import { ref } from 'vue'
import mock from '../data/projects.mock.json'

// Источник данных проектов — единственная точка, знающая, откуда они приходят.
// Фаза 2 (мок): импорт встроенного JSON.
// Фаза 4: заменить тело load() на fetch к gated Apps Script
//   (см. AUTH-AppsScript-boom-cmd.md). Сигнатура хука не меняется,
//   компоненты не трогаются.

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

  const isDev =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

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
      projects.value = normalize(mock?.projects)
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить проекты'
      projects.value = []
    } finally {
      loading.value = false
    }
  }

  load()

  return { projects, loading, error, reload: load }
}
