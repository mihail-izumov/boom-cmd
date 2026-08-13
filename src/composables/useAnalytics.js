import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
import { RETRY_DELAYS_MS, fetchJson, runWithRetries } from './netPolicy.js'
import { networkHint, isOnline } from '../i18n/net.js'

// Источник данных Аналитики — единственная точка работы с источником.
// Паттерн = useProjects.js (см. PATTERNS-data-section §1.1):
//   • публичный API: { data, loading, error, reload };
//   • normalize() устойчив к мусору и новым ключам (DATA-CONTRACT §6);
//   • правило источника R2:
//       dev + пустой URL  → ленивый импорт мока (в прод-бандл не попадает);
//       prod + пустой URL → ГРОМКАЯ ошибка «источник не настроен», НЕ мок;
//   • фраза доступа — из общего гейта useAccessKey (память вкладки);
//   • unauthorized в рантайме → logout('unauthorized') → экран входа.
//
// Backend: тот же gated Apps Script, что у Projects, с `?action=analytics`
// (PATTERNS §1.2). URL — из import.meta.env.VITE_ANALYTICS_API (фолбэк на
// VITE_PROJECTS_API оставлен на случай общего web-app — переключение
// одной env-переменной без правки кода).

const DOMAINS = ['revenue', 'players', 'cards', 'game_econ', 'prizes', 'reviews']

function pickNum(v) {
  // Принимаем number, оставляем 0 как валидное значение. null/undefined/строка
  // не валидное → null (это пропуск, см. §4 контракта).
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null
  const park = String(raw.park ?? '').trim()
  const month = String(raw.month ?? '').trim()
  if (!park || !/^\d{4}-\d{2}$/.test(month)) return null
  const out = { park, month }
  // Прокидываем ВСЕ числовые поля как есть — контракт допускает новые поля
  // (§6), рендер не должен падать от незнакомых ключей.
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'park' || k === 'month') continue
    out[k] = pickNum(v)
  }
  return out
}

function normalize(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {}
  const out = { updated: typeof safe.updated === 'string' ? safe.updated : null }
  for (const d of DOMAINS) {
    out[d] = Array.isArray(safe[d])
      ? safe[d].map(normalizeRow).filter(Boolean)
      : []
  }
  return out
}

const EMPTY = normalize(null)

export function useAnalytics() {
  const data = ref(EMPTY)
  const loading = ref(false)
  const error = ref(null)
  // Подсказка «что делать» отдельно от технической причины (образец — useDaily).
  const hint = ref('')
  const { getKey, logout } = useAccessKey()

  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const API =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      (import.meta.env.VITE_ANALYTICS_API ||
        import.meta.env.VITE_PROJECTS_API)) ||
    ''

  function wantError() {
    try {
      return (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('mockError') === '1'
      )
    } catch {
      return false
    }
  }

  // Dev-фолбэк: мок подгружается лениво и только в dev-ветке (DCE выкинет
  // мок-чанк из прод-бандла за `if (import.meta.env.DEV)`).
  async function loadMock() {
    const mod = await import('../data/analytics.mock.json')
    return normalize(mod?.default)
  }

  async function load() {
    loading.value = true
    error.value = null
    hint.value = ''
    try {
      if (isDev) await new Promise((r) => setTimeout(r, 350))
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

      // GET без кастомных заголовков (без CORS-preflight); ?action=analytics —
      // маршрутизация на бэке (PATTERNS §1.2).
      const url = `${API}?key=${encodeURIComponent(key)}&action=analytics`
      // no-store: не отдавать из HTTP-кэша браузера. Свежесть данных важнее
      // (источник = живая Google-таблица, читаемая в рантайме). SW этот
      // запрос уже не перехватывает (кросс-ориджин, см. public/sw.js).
      const json = await runWithRetries(() => fetchJson(url, { cache: 'no-store' }), {
        onRetry: (n, e) => {
          if (typeof console !== 'undefined') {
            console.warn(`analytics reload retry ${n}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
          }
        },
      })

      if (json && json.error === 'unauthorized') {
        logout('unauthorized')
        data.value = EMPTY
        return
      }

      data.value = normalize(json)
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить аналитику'
      hint.value = networkHint({ retriable: !!(e && e.retriable), online: isOnline() })
      data.value = EMPTY
    } finally {
      loading.value = false
    }
  }

  load()

  return { data, loading, error, hint, reload: load }
}
