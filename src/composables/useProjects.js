import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
import { RETRY_DELAYS_MS, fetchJson, runWithRetries } from './netPolicy.js'
import { networkHint, isOnline } from '../i18n/net.js'

// Источник данных проектов — единственная точка, знающая, откуда они приходят.
// Фаза 2 (мок): встроенный JSON.
// Фаза 4 (сейчас): живой read-only источник — gated Apps Script
//   (см. AUTH-AppsScript-boom-cmd.md). URL — из import.meta.env.VITE_PROJECTS_API,
//   парольная фраза — из useAccessKey (только в памяти вкладки; не на диске,
//   не в коде/бандле/env).
//   normalize() и публичный API (projects/loading/error/reload) не меняются.
//   Гейт — на ВЕСЬ вход (useAccessKey + App.vue); здесь только берём фразу и
//   при unauthorized в рантайме бросаем приложение на экран входа (logout()).
//
// Правило источника (R2 — фейк не должен уехать в прод под видом live):
//   • dev + пустой URL  → фолбэк на мок (ленивый импорт, в прод-бандл не попадает);
//   • prod + пустой URL → ГРОМКАЯ ошибка «источник не настроен», НИКОГДА не мок.

function normalizeItem(it) {
  const type = it?.type === 'milestone' ? 'milestone' : 'task'
  return {
    id: String(it?.id ?? '').trim(),
    title: String(it?.title ?? '').trim(),
    description: String(it?.description ?? ''),
    type,
  }
}

function normalizeParks(parks) {
  // Чистое разделение scope (TZ-3.3 §1):
  //   'network' — общесетевой проект (виден только в фильтре «Вся сеть»);
  //   [ids]     — парк-специфичный (виден только в виде каждого из этих парков).
  // Старое значение 'all' оставлено как фолбэк-алиас на 'network' (на случай
  // оставшихся данных в источниках/моках до миграции).
  if (parks === 'network' || parks === 'all') return 'network'
  if (Array.isArray(parks)) {
    const list = parks.map((p) => String(p).trim()).filter(Boolean)
    return list.length ? list : 'network'
  }
  // null/undefined/строка/мусор — трактуем как общесетевой
  return 'network'
}

// Дата запуска (`target`). Источник может прислать:
//   • ISO-строку `2026-06-25T07:00:00Z` (Sheets-дата через JSON);
//   • JS-toString `Thu Jun 25 2026 11:00:00 GMT+0400 (…)` — так Apps Script
//     сериализует ячейку-Date через String(), это и попадало в UI «как есть»;
//   • свободный текст: `Q3`, `Август`, `К сентябрю` — это НЕ дата, оставляем.
// Машинные форматы приводим к `DD.MM.YYYY`, парся части прямо из строки
// (без new Date — чтобы таймзона не сдвинула день). Прочее — отдаём как есть.
const MONTHS_EN = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}
function formatTarget(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const js = s.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/)
  if (js && MONTHS_EN[js[1]]) {
    return `${String(js[2]).padStart(2, '0')}.${MONTHS_EN[js[1]]}.${js[3]}`
  }
  return s
}

function normalizeProject(p) {
  const priorityNum = Number(p?.priority)
  return {
    id: String(p?.id ?? '').trim(),
    title: String(p?.title ?? '').trim(),
    status: String(p?.status ?? '').trim(),
    priority: Number.isFinite(priorityNum) ? priorityNum : 0,
    directions: Array.isArray(p?.directions)
      ? p.directions.map((s) => String(s).trim()).filter(Boolean)
      : String(p?.directions ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    parks: normalizeParks(p?.parks),
    target: formatTarget(p?.target),
    description: String(p?.description ?? ''),
    items: Array.isArray(p?.items) ? p.items.map(normalizeItem).filter((i) => i.id && i.title) : [],
  }
}

function normalize(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeProject)
    .filter((p) => p.id && p.title)
}

export function useProjects() {
  const projects = ref([])
  const loading = ref(false)
  const error = ref(null)
  // Подсказка «что делать» отдельно от технической причины (образец — useDaily):
  // человеку нужно действие, владельцу — причина. Пусто → подсказки нет.
  const hint = ref('')
  // Фраза доступа и сброс на логин — у синглтона гейта (гейт на весь вход).
  const { getKey, logout } = useAccessKey()

  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV
  const API =
    (typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_PROJECTS_API) ||
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

  // Dev-фолбэк: мок подгружается лениво и только в dev-ветке —
  // в прод-бандл projects.mock.json не попадает.
  async function loadMock() {
    const mod = await import('../data/projects.mock.json')
    return normalize(mod?.default?.projects)
  }

  async function load() {
    loading.value = true
    error.value = null
    hint.value = ''
    try {
      if (isDev) {
        await new Promise((r) => setTimeout(r, 350))
      }
      if (wantError()) {
        throw new Error('Симуляция ошибки (?mockError=1)')
      }

      // URL источника не задан.
      if (!API) {
        // Прямой import.meta.env.DEV (а не компаундный isDev) — чтобы в прод
        // ветка свернулась в `if (false)` и dead-code-elimination выкинул
        // и loadMock(), и сам мок-чанк из бандла (мок физически не в проде).
        if (import.meta.env.DEV) {
          projects.value = await loadMock()
          return
        }
        // Прод без источника — громкая ошибка, мок недопустим.
        throw new Error('Источник данных не настроен')
      }

      // Живой источник: фраза доступа — из общего гейта (память вкладки).
      const key = getKey()
      if (!key) {
        // На гейте-на-весь-вход сюда без фразы не попадаем; страховка — на логин.
        logout()
        projects.value = []
        return
      }

      // Простой GET без кастомных заголовков (чтобы не словить CORS-preflight);
      // redirect:'follow' по умолчанию — Apps Script отвечает 302 на
      // googleusercontent, fetch проходит за редиректом.
      const url = `${API}?key=${encodeURIComponent(key)}`
      const data = await runWithRetries(() => fetchJson(url), {
        onRetry: (n, e) => {
          if (typeof console !== 'undefined') {
            console.warn(`projects reload retry ${n}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
          }
        },
      })

      if (data && data.error === 'unauthorized') {
        // Фраза перестала подходить (напр. сменили ACCESS_KEY) — на экран входа.
        logout('unauthorized')
        projects.value = []
        return
      }

      projects.value = normalize(data?.projects)
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить проекты'
      hint.value = networkHint({ retriable: !!(e && e.retriable), online: isOnline() })
      projects.value = []
    } finally {
      loading.value = false
    }
  }

  load()

  return { projects, loading, error, hint, reload: load }
}
