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

// ── ОТКУДА ПРИШЛИ (задание 06.08 §3.3) ──────────────────────────────────────
// Под-страница может открываться из РАЗНЫХ мест: «Драйверы роста» — плиткой с
// Главной и строкой-сводкой из «Контроля дня». Возврат обязан вести туда, откуда
// зашли, иначе клик по сводке стоит владельцу потери состояния «Контроля дня»
// (раскрытых недель и выбранного месяца) — а он туда вернётся.
//
// Это НЕ стек: глубина по-прежнему 1, помним ровно один шаг назад. Форма —
// `{ to, label }`: `to` — ключ под-страницы для возврата, `label` — подпись
// back-кнопки. `null` = зашли обычным путём, возврат на Главную, как раньше.
const subOrigin = ref(null)

export function setActive(id) {
  if (id === active.value && subView.value === null) return
  active.value = id
  // Смена вкладки сбрасывает под-страницу (паттерн iOS: вкладка переключилась →
  // глубину сбрасываем).
  subView.value = null
  subOrigin.value = null
}

export function setSubView(name, origin = null) {
  subView.value = name || null
  subOrigin.value = name ? origin : null
}

export function clearSubView() {
  subView.value = null
  subOrigin.value = null
}

export function useAppNav() {
  return { active, subView, subOrigin, setActive, setSubView, clearSubView }
}
