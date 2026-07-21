import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'

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

export function useReport() {
  const sending = ref(false)
  const sent = ref(false) // успех — экран «Отчёт принят»
  const sendError = ref(false) // сеть/бэк — красная плашка, данные НЕ терять
  const { getKey, logout } = useAccessKey()

  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

  async function submit(payload) {
    if (sending.value) return
    sendError.value = false
    sending.value = true
    try {
      if (!API) {
        if (isDev) {
          await new Promise((r) => setTimeout(r, 400))
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

      const res = await fetch(API, {
        method: 'POST',
        body: JSON.stringify({ key, ...payload }),
        redirect: 'follow',
      })
      if (!res.ok) throw new Error(`Источник недоступен (${res.status})`)
      const json = await res.json()
      if (!json || json.ok !== true) throw new Error(json?.error || 'Отказ бэка')
      sent.value = true
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('report submit failed:', e)
      sendError.value = true
    } finally {
      sending.value = false
    }
  }

  // «Внести ещё» — назад к форме (сброс полей делает экран).
  function resetSent() {
    sent.value = false
    sendError.value = false
  }

  return { sending, sent, sendError, submit, resetSent }
}
