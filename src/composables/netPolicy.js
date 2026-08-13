// Политика сетевых обращений фронта — ЧИСТЫЕ функции без vue и DOM (проверяются
// в node без jsdom). Одна на всё приложение: и на запись («Отчёт Дня»), и на
// чтение дневного слоя.
//
// ПОВОД (05.08.2026), два случая за один день:
//   1) Утром управляющая Охты дважды не смогла отправить отчёт. Журнал выполнений
//      Apps Script за это время — ни одной ошибки и вообще ни одного запроса: POST
//      умирал по дороге к Google, в сети ТЦ. Со второй-третьей попытки уходил.
//   2) Вечером Главная показала одни прочерки, а «Контроль Дня» в тот же момент —
//      живые цифры. Причина та же: каждый экран тянет payload СВОИМ запросом, и
//      запрос Главной осёкся. В журнале снова чисто — сервер этих запросов не видел.
// Общий корень: единственная попытка, отсутствие потолка ожидания и никакого
// внешнего признака, что запрос вообще был.
//
// Здесь живут только правила. Как их применять, решает вызывающий: у записи и у
// чтения разные «окончательные» отказы (у отчёта — валидация тела, у чтения —
// протухшая фраза доступа), и прятать это различие в общий хелпер нельзя.

// Паузы перед 2-й и 3-й попытками, мс. Три попытки суммарно.
// Больше трёх не делаем: если не прошло за ~6 секунд, это уже не осечка, а обрыв,
// и человеку честнее увидеть ошибку и решить самому.
export const RETRY_DELAYS_MS = [1500, 4000]

// Потолок ожидания ОДНОЙ попытки. На бэке `doPost` отрабатывает 1–3 с, `doGet` —
// 5–11 с (журнал выполнений 04–05.08), так что 25 с — это заведомо не «медленно»,
// а «висит». Без потолка зависший запрос держит экран в загрузке до таймаута
// браузера, то есть минуты, и повтор не наступает никогда.
export const ATTEMPT_TIMEOUT_MS = 25000

/**
 * Транспортная осечка (повторяем) или отказ по существу (не повторяем).
 *   408/425/429 и любые 5xx — перегрузка, квота, прокси: повтор осмыслен;
 *   прочие 4xx — запрос не тот, повтор ничего не изменит;
 *   статуса нет вовсе — это сетевой сбой, повторяем.
 */
export function isRetriableStatus(status) {
  const n = Number(status)
  if (!isFinite(n)) return true
  return n === 408 || n === 425 || n === 429 || n >= 500
}

/** Ошибка с пометкой «повторять осмысленно». */
export function failure(message, retriable) {
  const e = new Error(message)
  e.retriable = !!retriable
  return e
}

export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * fetch с потолком ожидания. AbortController есть во всех целевых браузерах
 * (browserslist: iOS ≥ 15), но guard оставлен: без него падение было бы не
 * «данные не пришли», а белый экран.
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = ATTEMPT_TIMEOUT_MS) {
  const canAbort = typeof AbortController !== 'undefined'
  const ctrl = canAbort ? new AbortController() : null
  const timer = canAbort ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    return await fetch(url, { ...init, ...(ctrl ? { signal: ctrl.signal } : {}) })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Сеть отвалилась или сработал потолок — обе причины повторяемы, но называются по-разному. */
export function transportFailure(e) {
  return failure(e?.name === 'AbortError' ? 'Ответ не пришёл вовремя' : 'Сеть недоступна', true)
}

/**
 * ОДНА попытка чтения JSON: запрос → статус → разбор. Бросает ошибку с полем
 * `retriable`, то есть годится как `attemptFn` для `runWithRetries`.
 *
 * Не-JSON в ответе считаем ПОВТОРЯЕМЫМ: так выглядят страница логина Google при
 * сбое доступа к развёртыванию и обрыв на 302 к `googleusercontent`. Ответ
 * `{error:'unauthorized'}` — валидный JSON и сюда не попадает: это осознанный
 * отказ гейта, и разбирает его вызывающий, каждый по-своему.
 *
 * ⚠ `useDaily.fetchDaily` и `useReport.attemptOnce` СОЗНАТЕЛЬНО оставлены со
 * своими копиями (13.08.2026). Они написаны раньше, покрыты приёмкой построчно,
 * и у записи разбор отказов другой (валидация тела). Переписывать работающее и
 * проверенное ради красоты — риск без выгоды; новые вызовы идут сюда.
 */
export async function fetchJson(url, init = {}) {
  let res
  try {
    res = await fetchWithTimeout(url, init)
  } catch (e) {
    throw transportFailure(e)
  }
  if (!res.ok) throw failure(`Источник недоступен (${res.status})`, isRetriableStatus(res.status))
  try {
    return await res.json()
  } catch {
    throw failure('Ответ не разобран', true)
  }
}

/**
 * Прогон попыток. `attemptFn(i)` обязана бросать ошибку с полем `retriable`
 * (см. failure/transportFailure). Возвращает результат первой удачной попытки,
 * иначе пробрасывает последнюю ошибку.
 * `onRetry(i, err)` — для лога и для индикации «пробуем ещё» на экране; счётчик
 * поднимается ДО паузы, потому что пауза — бо́льшая часть времени повтора.
 */
export async function runWithRetries(attemptFn, { delays = RETRY_DELAYS_MS, onRetry } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await attemptFn(i)
    } catch (e) {
      if (!e || !e.retriable || i >= delays.length) throw e
      if (onRetry) onRetry(i + 2, e)
      await wait(delays[i])
    }
  }
}
