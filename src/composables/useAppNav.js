import { ref } from 'vue'

// Глобальная навигация: активная вкладка + опциональная под-страница.
// Модульный reactive-синглгон по той же логике, что useParkContext:
// top-level ref в модуле = один экземпляр на всё приложение, любой компонент,
// который импортирует useAppNav, читает и пишет в один и тот же стейт.
//
// `subView` — мини-стек глубиной 1 (TZ-3.1 §3): null или ключ под-страницы
// (сейчас единственная — 'parks'). Это намеренно простой механизм без
// router-библиотеки: глубже 1 уровня в продукте не планируется.

const active = ref('home')
const subView = ref(null) // null | 'parks'

export function setActive(id) {
  if (id === active.value && subView.value === null) return
  active.value = id
  // Смена вкладки сбрасывает под-страницу (паттерн iOS: вкладка переключилась →
  // глубину сбрасываем).
  subView.value = null
}

export function setSubView(name) {
  subView.value = name || null
}

export function clearSubView() {
  subView.value = null
}

export function useAppNav() {
  return { active, subView, setActive, setSubView, clearSubView }
}
