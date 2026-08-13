import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
import { RETRY_DELAYS_MS, fetchJson, runWithRetries } from './netPolicy.js'
import { networkHint, isOnline } from '../i18n/net.js'

// Источник данных под-страницы «Цели и прогнозы» — лаунчер ссылок на планинг/
// стратегические страницы. Клон паттерна useDaily/useProjects:
//   • публичный API: { data, loading, error, reload };
//   • ответ: { updated, items: [ { park, month, type, title, url } ] };
//   • dev + пустой URL → ленивый мок; prod + пустой URL → ГРОМКАЯ ошибка;
//   • фраза доступа — из общего useAccessKey; backend — gated Apps Script,
//     ветка ?action=goals (тот же деплой аналитики), URL из VITE_GOALS_API
//     → фолбэк VITE_ANALYTICS_API. no-store (список ведут в Google-таблице).
//
// ВАЖНО (граница): наружу коммитятся только контракт + mock с ВЫДУМАННЫМИ URL.
// Сами планинг-страницы (реальные числа) публичны — известный долг, см. BOUNDARY.md.

const EMPTY = { updated: null, items: [] }

function normalizeItem(it) {
  if (!it || typeof it !== 'object') return null
  const url = String(it.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) return null // ссылка обязательна и http(s)
  const month = String(it.month ?? '').trim()
  if (!/^\d{4}-\d{2}$/.test(month)) return null // месяц обязателен, YYYY-MM
  const title = String(it.title ?? '').trim()
  if (!title) return null
  // park пусто / 'network' / 'all' → общесетевое; иначе id парка (нижний регистр)
  let park = String(it.park ?? '').trim().toLowerCase()
  if (!park || park === 'network' || park === 'all') park = 'network'
  return { park, month, type: String(it.type ?? '').trim(), title, url }
}

function normalize(raw) {
  const safe = raw && typeof raw === 'object' ? raw : {}
  return {
    updated: typeof safe.updated === 'string' ? safe.updated : null,
    items: (Array.isArray(safe.items) ? safe.items : []).map(normalizeItem).filter(Boolean),
  }
}

export function useGoals() {
  const data = ref(EMPTY)
  const loading = ref(false)
  const error = ref(null)
  // Подсказка «что делать» отдельно от технической причины (образец — useDaily).
  const hint = ref('')
  const { getKey, logout } = useAccessKey()

  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const API =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      (import.meta.env.VITE_GOALS_API || import.meta.env.VITE_ANALYTICS_API)) ||
    ''

  function wantError() {
    try {
      return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mockError') === '1'
    } catch {
      return false
    }
  }

  async function loadMock() {
    const mod = await import('../data/goals.mock.json')
    return normalize(mod?.default)
  }

  async function load() {
    loading.value = true
    error.value = null
    hint.value = ''
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

      const url = `${API}?key=${encodeURIComponent(key)}&action=goals`
      const json = await runWithRetries(() => fetchJson(url, { cache: 'no-store' }), {
        onRetry: (n, e) => {
          if (typeof console !== 'undefined') {
            console.warn(`goals reload retry ${n}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
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
      error.value = e?.message || 'Не удалось загрузить цели и прогнозы'
      hint.value = networkHint({ retriable: !!(e && e.retriable), online: isOnline() })
      data.value = EMPTY
    } finally {
      loading.value = false
    }
  }

  load()

  return { data, loading, error, hint, reload: load }
}
