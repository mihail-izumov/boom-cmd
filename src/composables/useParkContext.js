import { computed, ref } from 'vue'
import { PARKS_BY_ID } from '../data/parks.js'

// Глобальный парк-контекст (TZ-3.3 §1, чистое разделение Y).
// Модульный reactive-синглгон: top-level ref в модуле = один экземпляр
// на всё приложение. Любой компонент, который импортирует useParkContext,
// читает и пишет в один и тот же стейт.
//
// Контекст — reactive ТОЛЬКО на сессию (без localStorage).
//
// Значение `current`:
//   'network' — режим «Вся сеть» (дефолт): в Проектах показываются только
//               общесетевые проекты (parks === 'network'). Общесетевые
//               в виды парков НЕ попадают.
//   <park id> — режим парка: показываются только проекты, привязанные
//               к этому парку (Array.isArray(parks) && parks.includes(id)).
// «Куча всё подряд» в системе больше нет — это решение TZ-3.3.

const current = ref('network')

export function setPark(idOrNetwork) {
  // Принимаем 'network' (явно) либо id из справочника парков.
  // Прежний алиас 'all' маппится на 'network' — на случай старых вызовов
  // и сохранённых URL/состояний.
  if (idOrNetwork === 'network' || idOrNetwork === 'all') {
    current.value = 'network'
  } else if (PARKS_BY_ID[idOrNetwork]) {
    current.value = idOrNetwork
  } else {
    // Неизвестное значение не ломает UI — откатываемся на 'network'.
    current.value = 'network'
  }
}

export function useParkContext() {
  const isNetwork = computed(() => current.value === 'network')
  const currentPark = computed(() =>
    isNetwork.value ? null : PARKS_BY_ID[current.value] || null,
  )
  const currentName = computed(() =>
    isNetwork.value ? 'Вся сеть' : currentPark.value?.name || 'Вся сеть',
  )
  const currentShort = computed(() =>
    isNetwork.value
      ? 'Вся сеть'
      : currentPark.value?.short || currentPark.value?.name || 'Вся сеть',
  )
  return { current, isNetwork, currentPark, currentName, currentShort, setPark }
}
