import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'

// Источник данных под-страницы «Контроль дня». Клон паттерна useAnalytics.js:
//   • публичный API: { data, loading, error, reload };
//   • ответ ОБЁРНУТ в { updated, sets: { "<park>:<month>": {...} } } — normalize читает .sets;
//   • правило источника R2: dev + пустой URL → ленивый мок; prod + пустой URL → ГРОМКАЯ ошибка;
//   • фраза доступа — из общего useAccessKey;
//   • backend: тот же gated Apps Script аналитики, ветка ?action=daily (§2.2 контракта),
//     читает ОТДЕЛЬНУЮ дневную таблицу по openById; URL — VITE_DAILY_API, фолбэк VITE_ANALYTICS_API
//     (тот же деплой). На VITE_PROJECTS_API НЕ фолбэкаем — другой деплой.

const EMPTY = { updated: null, sets: {} }

function normalizeSet(raw) {
  if (!raw || typeof raw !== 'object') return null
  const park = String(raw.park ?? '').trim()
  const month = String(raw.month ?? '').trim()
  if (!park || !/^\d{4}-\d{2}$/.test(month)) return null
  // Прокидываем структуру как есть (dailyModel устойчив к пропускам/новым ключам,
  // DATA-CONTRACT §7). Гарантируем типы контейнеров, чтобы рендер не падал.
  return {
    ...raw,
    park, month,
    days: Array.isArray(raw.days) ? raw.days : [],
    dow_coef: Array.isArray(raw.dow_coef) ? raw.dow_coef : [],
    dow_n: Array.isArray(raw.dow_n) ? raw.dow_n : [],
    dow_src: Array.isArray(raw.dow_src) ? raw.dow_src : [],
    journal: Array.isArray(raw.journal) ? raw.journal : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    holidays: Array.isArray(raw.holidays) ? raw.holidays : [],
    calib: raw.calib && typeof raw.calib === 'object' ? raw.calib : {},
  }
}

function normalize(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {}
  const out = { updated: typeof safe.updated === 'string' ? safe.updated : null, sets: {} }
  // v3.1: счётчики Главной (чекапы/сигналы) — из системы, прокидываем как есть.
  if (safe.stats && typeof safe.stats === 'object') out.stats = safe.stats
  // Сводки сети (день/неделя/месяц) — отдельный верхнеуровневый массив, по образцу
  // stats и НЕ внутри sets[k]. Прокидываем как есть: валидация и выбор актуальной
  // записи — в netSummary.js. Нет ключа → раздел «Сводки» покажет пустой стейт.
  if (Array.isArray(safe.net_summary)) out.net_summary = safe.net_summary
  // Журнал разборов (D-19) — тоже верхнеуровневый массив; валидация и сортировка —
  // в reviews.js. Нет ключа → счётчик Главной «—», журнал покажет пустой стейт.
  if (Array.isArray(safe.reviews)) out.reviews = safe.reviews
  const sets = safe.sets && typeof safe.sets === 'object' ? safe.sets : {}
  for (const [key, v] of Object.entries(sets)) {
    const n = normalizeSet(v)
    if (n) out.sets[key] = n
  }
  return out
}

export function useDaily() {
  const data = ref(EMPTY)
  const loading = ref(false)
  const error = ref(null)
  const { getKey, logout } = useAccessKey()

  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const API =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      (import.meta.env.VITE_DAILY_API || import.meta.env.VITE_ANALYTICS_API)) ||
    ''

  function wantError() {
    try {
      return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mockError') === '1'
    } catch {
      return false
    }
  }

  async function loadMock() {
    const mod = await import('../data/daily.mock.json')
    return normalize(mod?.default)
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      if (isDev) await new Promise((r) => setTimeout(r, 300))
      if (wantError()) throw new Error('Симуляция ошибки (?mockError=1)')

      if (!API) {
        if (import.meta.env.DEV) {
          data.value = await loadMock()
          return
        }
        throw new Error('Источник данных не настроен')
      }

      const key = getKey()
      if (!key) {
        logout()
        data.value = EMPTY
        return
      }

      const url = `${API}?key=${encodeURIComponent(key)}&action=daily`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Источник недоступен (${res.status})`)
      const json = await res.json()

      if (json && json.error === 'unauthorized') {
        logout('unauthorized')
        data.value = EMPTY
        return
      }

      data.value = normalize(json)
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить дневной слой'
      data.value = EMPTY
    } finally {
      loading.value = false
    }
  }

  load()

  return { data, loading, error, reload: load }
}
