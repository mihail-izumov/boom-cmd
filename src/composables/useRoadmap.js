import { ref } from 'vue'
import mock from '../data/roadmap.mock.json'

// Источник данных — единственное место, знающее, откуда роадмап.
// Фаза 2 (mock): импорт встроенного JSON.
// Фаза 2.5: заменить тело load() на
//   fetch(import.meta.env.VITE_ROADMAP_URL).then(r => r.json())
// или импорт собранного на билде tracker.json. Сигнатура хука и нормализация
// не меняются — компоненты не трогаются.

function normalizeCard(c) {
  const priorityNum = Number(c?.priority)
  return {
    id: String(c?.id ?? '').trim(),
    title: String(c?.title ?? '').trim(),
    description: String(c?.description ?? ''),
    status: String(c?.status ?? '').trim(),
    priority: Number.isFinite(priorityNum) ? priorityNum : 0,
    estimate: c?.estimate ? String(c.estimate).trim().toUpperCase() : null,
    labels: Array.isArray(c?.labels)
      ? c.labels.map((s) => String(s).trim()).filter(Boolean)
      : String(c?.labels ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    project: String(c?.project ?? '').trim(),
    assignee: c?.assignee ? String(c.assignee).trim() : null,
    target: c?.target ? String(c.target).trim() : null,
  }
}

function normalize(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeCard)
    .filter((c) => c.id && c.title)
}

export function useRoadmap() {
  const cards = ref([])
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
      // Имитация сетевой задержки только в DEV, чтобы скелет был виден.
      if (isDev) {
        await new Promise((r) => setTimeout(r, 350))
      }
      if (wantError()) {
        throw new Error('Симуляция ошибки (?mockError=1)')
      }
      cards.value = normalize(mock?.cards)
    } catch (e) {
      error.value = e?.message || 'Не удалось загрузить роадмап'
      cards.value = []
    } finally {
      loading.value = false
    }
  }

  // Запускаем сразу — компонент рендерится в состоянии loading.
  load()

  return { cards, loading, error, reload: load }
}
