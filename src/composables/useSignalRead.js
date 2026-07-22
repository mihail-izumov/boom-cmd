import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
import { postSignalRead } from './dailySignals.js'

// Отметка «Прочитал» для «Сигнала дня» (v3, полоса B). ЕДИНСТВЕННАЯ новая
// пишущая операция фронта — POST signal_read в тот же inbox-канал, что форма
// (VITE_REPORT_API). read-only не нарушаем: чтения этой операцией нет.
//   • URL — из env VITE_REPORT_API (в код/репо НЕ вшивать);
//   • гейт-ключ key — фраза из useAccessKey (память вкладки, не localStorage);
//   • паттерн запроса — как useReport (без Content-Type, redirect:'follow', {ok:true});
//   • dev без URL — имитация успеха (полосу B можно гонять без бэка);
//     prod без URL / ошибка сети/бэка — postError=true, кнопка остаётся активной.
// Приём signal_read готовит владелец отдельной добавкой на бэке (лист
// signal_reads), деплой — ДО пуша v3 («сперва бэк, потом пуш»). Приёмка фронта
// живого бэка не требует: fetch мокается (§6).

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_REPORT_API) ||
  ''

export function useSignalRead() {
  const posting = ref(false)
  const postError = ref(false)
  const { getKey } = useAccessKey()
  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

  async function markRead({ park, signal_date }) {
    if (posting.value) return false
    postError.value = false
    posting.value = true
    try {
      if (!API) {
        if (isDev) {
          await new Promise((r) => setTimeout(r, 300))
          return true
        }
        throw new Error('Источник отправки не настроен')
      }
      const key = getKey()
      if (!key) throw new Error('Нет фразы доступа')
      await postSignalRead({ api: API, key, park, signalDate: signal_date })
      return true
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('signal_read failed:', e)
      postError.value = true
      return false
    } finally {
      posting.value = false
    }
  }

  return { posting, postError, markRead }
}
