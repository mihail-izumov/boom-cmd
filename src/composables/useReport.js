import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
// Политика повторов — в чистом reportModel.js: там она проверяется приёмкой
// без jsdom и таймеров (см. комментарий по месту).
import { RETRY_DELAYS_MS, ATTEMPT_TIMEOUT_MS, isRetriableStatus } from './reportModel.js'

// Отправка «Отчёта дня» (D-12) — ЕДИНСТВЕННАЯ пишущая операция фронта.
// POST JSON → Apps Script doPost → append строки ТОЛЬКО в лист `inbox`
// дневной таблицы. Никакого чтения этой страницей; двусторонней связи нет.
//
//   • URL — из env VITE_REPORT_API (repo Variable; в код/репо НЕ вшивать);
//   • гейт-ключ `key` — фраза из useAccessKey (память вкладки, не localStorage);
//   • БЕЗ заголовка Content-Type: application/json — «простой» запрос без
//     CORS-preflight (Apps Script не отвечает на OPTIONS); body = JSON-строка;
//   • redirect: 'follow' — /exec отвечает 302 на googleusercontent;
//   • dev без URL — имитация успеха (форму можно прогонять без бэка);
//     prod без URL — громкая ошибка отправки;
//   • дубли не блокируем: повтор того же парк+дата — новой строкой (submitted_at
//     на бэке расставит; последняя = актуальная).
//
// ── ПОВТОРНЫЕ ПОПЫТКИ (05.08.2026) ──
// Повод. Утром 05.08 Охта дважды не смогла отправить отчёт, а журнал выполнений
// Apps Script за это время не показал НИ ОДНОЙ ошибки и вообще ни одного запроса:
// POST умирал по дороге к Google, в сети ТЦ. Со второй-третьей попытки руками —
// уходил. То есть отказ был транспортным и лечился повтором, но повторять было
// некому: здесь стоял один `fetch`, и любая осечка сразу давала красную плашку.
// Для отметок «Сигнала дня» очередь с бэкоффом построили 04.08, а у отчёта —
// операции, ради которой вся форма и делалась, — не было ни одной второй попытки.
//
// Почему повтор безопасен. Это свойство бэка, а не допущение: `appendReport_`
// только добавляет строку, а сверка берёт ПОСЛЕДНЮЮ строку дня по `submitted_at`
// (см. changelog v3.2). Дубль за тот же парк+дату — штатное состояние листа
// приёма с v1, он не ломает ни письмо-сверку, ни забор.
//
// Что НЕ повторяем — осознанный отказ бэка (`{ok:false, error}`): «bad date»,
// «cashless+cash+site != revenue», «bad park», «bad key». Тело запроса от повтора
// валиднее не станет, а человек будет смотреть на «Отправляем…» лишние секунды.
// Тот же список причин, по которым очередь сигналов помечает элемент `dead`.

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_REPORT_API) ||
  ''

// Настроен ли гейт входа (VITE_PROJECTS_API). Если гейта нет, фразы в памяти
// нет и не будет — не выкидываем на экран входа, а показываем ошибку отправки.
const GATE_API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_PROJECTS_API) ||
  ''

function failure(message, retriable) {
  const e = new Error(message)
  e.retriable = !!retriable
  return e
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// fetch с потолком ожидания. AbortController есть во всех целевых браузерах
// (browserslist: iOS ≥ 15), но guard оставлен: без него падение было бы не
// «отчёт не ушёл», а белый экран.
async function fetchOnce(url, body) {
  const canAbort = typeof AbortController !== 'undefined'
  const ctrl = canAbort ? new AbortController() : null
  const timer = canAbort ? setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS) : null
  try {
    return await fetch(url, {
      method: 'POST',
      body,
      redirect: 'follow',
      ...(ctrl ? { signal: ctrl.signal } : {}),
    })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function useReport() {
  const sending = ref(false)
  const sent = ref(false) // успех — экран «Отчёт принят»
  const sendError = ref(false) // сеть/бэк — красная плашка, данные НЕ терять
  // Номер текущей попытки (1, 2, 3). Нужен экрану: молчать 6 секунд, пока идут
  // повторы, нельзя — это читается как зависание, и человек жмёт кнопку ещё раз.
  const attempt = ref(0)
  const { getKey, logout } = useAccessKey()

  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

  // Одна попытка целиком: запрос → статус → JSON → контракт {ok:true}.
  // Бросает Error с полем retriable.
  async function attemptOnce(url, body) {
    let res
    try {
      res = await fetchOnce(url, body)
    } catch (e) {
      // Сеть отвалилась или сработал потолок ожидания — оба случая повторяемы.
      throw failure(e?.name === 'AbortError' ? 'Ответ не пришёл вовремя' : 'Сеть недоступна', true)
    }
    if (!res.ok) {
      throw failure(`Источник недоступен (${res.status})`, isRetriableStatus(res.status))
    }
    let json
    try {
      json = await res.json()
    } catch {
      // Вместо JSON пришло что-то другое — так выглядит страница логина Google
      // при сбое доступа к развёртыванию и обрыв на 302 к googleusercontent.
      throw failure('Ответ не разобран', true)
    }
    if (!json || json.ok !== true) {
      // Бэк ответил осознанно: причина в теле запроса или в ключе. Не повторяем.
      throw failure(json?.error || 'Отказ бэка', false)
    }
  }

  async function submit(payload) {
    if (sending.value) return
    sendError.value = false
    sending.value = true
    attempt.value = 1
    try {
      if (!API) {
        if (isDev) {
          await wait(400)
          sent.value = true
          return
        }
        throw new Error('Источник отправки не настроен')
      }

      const key = getKey()
      if (!key) {
        if (GATE_API) {
          // сессия истекла — на экран входа (данные формы остаются в компоненте)
          logout('expired')
          return
        }
        throw new Error('Гейт входа не настроен — нет фразы для отправки')
      }

      const body = JSON.stringify({ key, ...payload })
      for (let i = 0; ; i++) {
        try {
          await attemptOnce(API, body)
          sent.value = true
          return
        } catch (e) {
          const last = i >= RETRY_DELAYS_MS.length
          if (!e.retriable || last) throw e
          // Счётчик поднимаем ДО паузы, а не в начале следующего витка: пауза —
          // это бо́льшая часть времени повтора, и всё это время кнопка обязана
          // говорить «пробуем ещё», иначе экран выглядит зависшим.
          attempt.value = i + 2
          if (typeof console !== 'undefined') {
            console.warn(`report submit retry ${i + 2}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
          }
          await wait(RETRY_DELAYS_MS[i])
        }
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('report submit failed:', e)
      sendError.value = true
    } finally {
      sending.value = false
      attempt.value = 0
    }
  }

  // «Внести ещё» — назад к форме (сброс полей делает экран).
  function resetSent() {
    sent.value = false
    sendError.value = false
    attempt.value = 0
  }

  return { sending, sent, sendError, attempt, submit, resetSent }
}
