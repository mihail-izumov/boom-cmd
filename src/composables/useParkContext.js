import { computed, ref } from 'vue'
import { PARKS_BY_ID } from '../data/parks.js'

// Глобальный парк-контекст (TZ-3 §3, PRODUCT-PRINCIPLES §7).
// Модульный reactive-синглтон: top-level ref в модуле = один экземпляр
// на всё приложение. Любой компонент, который импортирует useParkContext,
// читает и пишет в один и тот же стейт.
//
// Контекст — reactive ТОЛЬКО на сессию (без localStorage), это сознательное
// решение из PRODUCT-PRINCIPLES.

// Значение: 'all' либо id парка из PARKS_BY_ID.
const current = ref('all')

export function setPark(idOrAll) {
  if (idOrAll === 'all' || PARKS_BY_ID[idOrAll]) {
    current.value = idOrAll
  } else {
    // Неизвестное значение не ломает UI — откатываемся на 'all'.
    current.value = 'all'
  }
}

export function useParkContext() {
  const isAll = computed(() => current.value === 'all')
  const currentPark = computed(() =>
    isAll.value ? null : PARKS_BY_ID[current.value] || null,
  )
  const currentName = computed(() =>
    isAll.value ? 'Вся сеть' : currentPark.value?.name || 'Вся сеть',
  )
  const currentShort = computed(() =>
    isAll.value
      ? 'Вся сеть'
      : currentPark.value?.short || currentPark.value?.name || 'Вся сеть',
  )
  return { current, isAll, currentPark, currentName, currentShort, setPark }
}
