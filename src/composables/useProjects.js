import { ref } from 'vue'

// Источник данных проектов — единственная точка, знающая, откуда они приходят.
// Фаза 2 (мок): встроенный JSON.
// Фаза 4 (сейчас): живой read-only источник — gated Apps Script
//   (см. AUTH-AppsScript-boom-cmd.md). URL — из import.meta.env.VITE_PROJECTS_API,
//   парольная фраза — из localStorage (в код/бандл/env не попадает).
//   normalize() и публичный API (projects/loading/error/reload) не меняются;
//   гейт добавлен аддитивно (needsKey/keyError/submitKey).
//
// Правило источника (R2 — фейк не должен уехать в прод под видом live):
//   • dev + пустой URL  → фолбэк на мок (ленивый импорт, в прод-бандл не попадает);
//   • prod + пустой URL → ГРОМКАЯ ошибка «источник не настроен», НИКОГДА не мок.

const STORAGE_KEY = 'boom-cmd:access-key'

function readKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
function writeKey(v) {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    /* приватный режим / нет доступа — игнорируем */
  }
}
function clearKey() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

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
    target: p?.target ? String(p.target).trim() : null,
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
  // Гейт (аддитивно к публичному API):
  //   needsKey — нет/сброшена фраза, нужно показать форму ввода;
  //   keyError — последняя попытка дала unauthorized (неверная фраза).
  const needsKey = ref(false)
  const keyError = ref(false)

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

      // Живой источник: фраза доступа — из localStorage, к коду/бандлу не привязана.
      const key = readKey()
      if (!key) {
        projects.value = []
        keyError.value = false
        needsKey.value = true
        return
      }

      // Простой GET без кастомных заголовков (чтобы не словить CORS-preflight);
      // redirect:'follow' по умолчанию — Apps Script отвечает 302 на
      // googleusercontent, fetch проходит за редиректом.
      const url = `${API}?key=${encodeURIComponent(key)}`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Источник недоступен (${res.status})`)
      }
      const data = await res.json()

      if (data && data.error === 'unauthorized') {
        clearKey()
        keyError.value = true
        needsKey.value = true
        projects.value = []
        return
      }

      projects.value = normalize(data?.projects)
      needsKey.value = false
      keyError.value = false
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить проекты'
      projects.value = []
    } finally {
      loading.value = false
    }
  }

  // Сохранить введённую фразу и перезагрузить. Фраза живёт только в localStorage.
  function submitKey(phrase) {
    const v = String(phrase ?? '').trim()
    if (!v) return undefined
    writeKey(v)
    keyError.value = false
    needsKey.value = false
    return load()
  }

  load()

  return { projects, loading, error, reload: load, needsKey, keyError, submitKey }
}
