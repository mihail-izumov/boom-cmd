import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'

// Заявка «Подключить бизнес» (D-20) — вторая пишущая операция фронта после
// «Отчёта дня» и signal_read. POST JSON → Apps Script doPost, ветка
// action='connect_request' (v3.7) → строка в лист `connect_requests` + письмо
// владельцу. Чтения этой операцией нет, read-only витрины не нарушаем.
//
//   • URL — из env VITE_REPORT_API (тот же inbox-канал, что форма и signal_read;
//     в код/репо НЕ вшивать);
//   • гейт-ключ `key` — фраза из useAccessKey (память вкладки, не localStorage);
//   • паттерн запроса — как useReport: без Content-Type (нет CORS-preflight,
//     Apps Script не отвечает на OPTIONS), redirect:'follow', ждём {ok:true};
//   • dev без URL — имитация успеха (модалку можно гонять без бэка);
//     prod без URL / ошибка сети/бэка — sendError, данные поля НЕ теряем.
//
// Порядок деплоя: бэк v3.7 — ДО пуша фронта, иначе заявка отвалится с 'bad park'
// (ветка connect_request стоит до whitelist парков только начиная с v3.7).

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_REPORT_API) ||
  ''

// Ограничение длины названия — то же число, что и на бэке (CONNECT_NAME_MAX).
export const BUSINESS_NAME_MAX = 200

// Нормализация названия: обрезка по краям + жёсткий лимит. Вынесена отдельно,
// чтобы приёмка проверяла её без монтирования модалки.
export function normalizeBusinessName(v) {
  return String(v == null ? '' : v)
    .trim()
    .slice(0, BUSINESS_NAME_MAX)
}

// Тело запроса. Отдельной функцией — по образцу buildSignalReadBody: приёмке
// нужно проверять КОНТРАКТ, а не перехватывать fetch внутри компонента.
export function buildConnectBody({ key, businessName, source = 'front' }) {
  return {
    key,
    action: 'connect_request',
    business_name: normalizeBusinessName(businessName),
    source,
  }
}

export function useConnectRequest() {
  const sending = ref(false)
  const sent = ref(false) // успех — состояние «Заявка отправлена»
  const sendError = ref(false) // сеть/бэк — плашка, поле НЕ чистим
  const { getKey } = useAccessKey()

  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

  async function submit(businessName, source = 'front') {
    if (sending.value) return false
    const name = normalizeBusinessName(businessName)
    if (!name) return false // пустое название не отправляем (и письма не будет)
    sendError.value = false
    sending.value = true
    try {
      if (!API) {
        if (isDev) {
          await new Promise((r) => setTimeout(r, 400))
          sent.value = true
          return true
        }
        throw new Error('Источник отправки не настроен')
      }
      const key = getKey()
      if (!key) throw new Error('Нет фразы доступа')

      const res = await fetch(API, {
        method: 'POST',
        body: JSON.stringify(buildConnectBody({ key, businessName: name, source })),
        redirect: 'follow',
      })
      if (!res.ok) throw new Error(`Источник недоступен (${res.status})`)
      const json = await res.json()
      if (!json || json.ok !== true) throw new Error(json?.error || 'Отказ бэка')
      sent.value = true
      return true
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('connect_request failed:', e)
      sendError.value = true
      return false
    } finally {
      sending.value = false
    }
  }

  function reset() {
    sent.value = false
    sendError.value = false
  }

  return { sending, sent, sendError, submit, reset }
}
