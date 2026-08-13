import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
import { RETRY_DELAYS_MS, fetchJson, runWithRetries } from './netPolicy.js'
import { networkHint, isOnline } from '../i18n/net.js'

// Источник данных «Материалы» — единственная точка работы с источником.
// Паттерн = useProjects.js / useAnalytics.js (PATTERNS-data-section §1.1):
//   • публичный API: { materials, loading, error, reload };
//   • normalize() устойчив к мусору, фильтрует неполные записи;
//   • правило источника R2:
//       dev + пустой URL  → ленивый импорт мока (в прод-бандл не попадает);
//       prod + пустой URL → ГРОМКАЯ ошибка «источник не настроен», НЕ мок;
//   • фраза доступа — из общего гейта useAccessKey (память вкладки);
//   • unauthorized в рантайме → logout('unauthorized') → экран входа.
//
// Backend: отдельный gated Apps Script, привязанный к собственному Sheet
// «Материалы» (см. TZ-5-Materials-Source). URL — из import.meta.env.VITE_MATERIALS_API.
// Фразу доступа проверяет тот же `useAccessKey`, который ходит в Projects-эндпоинт;
// для этого в Script Properties Materials Apps Script прописывается **тот же
// `ACCESS_KEY`**, что и у Projects (организационная договорённость; в коде эту
// связь не закрепляем — два независимых Web App).
//
// Отклонение от §5 (данные EN, UI RU): данные «Материалов» приходят на русском
// (type/status/directions). Словари короткие, владельцу удобнее вести лист
// по-русски; фронт работает с этими значениями как с лейблами. Это согласовано
// явно (см. TZ-5-Materials-Source).

// Нормализация ссылки.
// • http(s)://… → внешняя (Drive). Открывается как есть.
// • Иначе → локальный путь к public/. Склеиваем с import.meta.env.BASE_URL,
//   срезая случайный префикс `/public/` или ведущий слеш (страховка от старых
//   данных в листе вида `/public/materials/foo.jpg`).
function resolveLink(raw) {
  const link = String(raw ?? '').trim()
  if (!link) return { link: '', href: '', external: false }
  if (/^https?:\/\//i.test(link)) {
    return { link, href: link, external: true }
  }
  const path = link.replace(/^\/?public\//, '').replace(/^\/+/, '')
  const base =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.BASE_URL) ||
    '/'
  return { link, href: base + path, external: false }
}

function normalizeParks(parks) {
  // Симметрично useProjects: 'network'/'all'/пусто → 'network';
  // строка с id или массив → массив id парков.
  if (parks === 'network' || parks === 'all') return 'network'
  if (Array.isArray(parks)) {
    const list = parks.map((p) => String(p).trim()).filter(Boolean)
    return list.length ? list : 'network'
  }
  const s = String(parks ?? '').trim()
  if (!s) return 'network'
  const low = s.toLowerCase()
  if (low === 'network' || low === 'all') return 'network'
  const list = s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return list.length ? list : 'network'
}

function normalizeMaterial(m) {
  const { link, href, external } = resolveLink(m?.link)
  return {
    id: String(m?.id ?? '').trim(),
    title: String(m?.title ?? '').trim(),
    description: String(m?.description ?? ''),
    // Лейблы остаются как пришли (RU-словари). Trim — на всякий случай.
    type: String(m?.type ?? '').trim(),
    status: String(m?.status ?? '').trim(),
    // directions — массив, как в Projects: устойчиво и к строке с запятыми,
    // и к уже подготовленному массиву.
    directions: Array.isArray(m?.directions)
      ? m.directions.map((s) => String(s).trim()).filter(Boolean)
      : String(m?.directions ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    parks: normalizeParks(m?.parks),
    last_updated: String(m?.last_updated ?? '').trim(),
    link,
    href,
    external,
  }
}

function normalize(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeMaterial)
    .filter((m) => m.id && m.title)
}

export function useMaterials() {
  const materials = ref([])
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
      import.meta.env.VITE_MATERIALS_API) ||
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
    const mod = await import('../data/materials.mock.json')
    return normalize(mod?.default?.materials)
  }

  async function load() {
    loading.value = true
    error.value = null
    hint.value = ''
    try {
      if (isDev) await new Promise((r) => setTimeout(r, 350))
      if (wantError()) throw new Error('Симуляция ошибки (?mockError=1)')

      // URL источника не задан.
      if (!API) {
        if (import.meta.env.DEV) {
          materials.value = await loadMock()
          return
        }
        // Прод без источника — громкая ошибка, мок недопустим (R2).
        throw new Error('Источник данных не настроен')
      }

      // Живой источник: фраза доступа — из общего гейта.
      const key = getKey()
      if (!key) {
        // На гейте-на-весь-вход сюда без фразы не попадаем; страховка — на логин.
        logout()
        materials.value = []
        return
      }

      // GET без кастомных заголовков (без CORS-preflight). Отдельный Web App
      // под Материалы — без маршрутизации `?action=`, эндпоинт обслуживает
      // только один раздел.
      const url = `${API}?key=${encodeURIComponent(key)}`
      const data = await runWithRetries(() => fetchJson(url), {
        onRetry: (n, e) => {
          if (typeof console !== 'undefined') {
            console.warn(`materials reload retry ${n}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
          }
        },
      })

      if (data && data.error === 'unauthorized') {
        // Фраза перестала подходить (сменили ACCESS_KEY) — на экран входа.
        logout('unauthorized')
        materials.value = []
        return
      }

      materials.value = normalize(data?.materials)
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить материалы'
      hint.value = networkHint({ retriable: !!(e && e.retriable), online: isOnline() })
      materials.value = []
    } finally {
      loading.value = false
    }
  }

  load()

  return { materials, loading, error, hint, reload: load }
}
