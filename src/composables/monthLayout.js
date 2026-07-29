// monthLayout.js — ГЕОМЕТРИЯ полосы месяца (D-34). Чистый JS, без vue и DOM.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ МОДУЛЕМ. Полоса обязана соответствовать числам под ней —
// это не «хорошо бы», а инвариант: если сегмент врёт, виджет вреднее, чем его
// отсутствие. Пока проценты считались внутри шаблона, проверить это было
// нечем — тест мог только читать style.width уже отрисованного DOM и сверять
// со строкой. Вынесли расчёт в функцию: теперь инварианты проверяются на
// числах, а компонент их только рендерит.
//
// Регламент проверки — boom-cmd-data/docs/РЕГЛАМЕНТ-соответствие-полос-числам.md
//
// ИНВАРИАНТЫ (закреплены в scripts/verify-daily.mjs):
//   И-1 scaleMax = max(всех заданных значений) — иначе метка уедет за край;
//   И-2 pct(v) = v / scaleMax × 100 РОВНО, без клампов и округлений;
//   И-3 сегменты непрерывны: gapStart = factPct, gapStart + gapWidth = forecastPct;
//   И-4 порядок позиций совпадает с порядком значений (монотонность);
//   И-5 значение = scaleMax → позиция ровно 100; значение null → позиция null;
//   И-6 ни одна позиция не выходит за [0, 100].

// Ширина метки-риски, px. Метка на 100% прижимается внутрь, иначе половина
// уезжает за overflow-hidden и читается как «хвост», торчащий из полосы.
export const MARK_W = 2
export const MARK_W_GOAL = 3

const num = (v) => (v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null)

// Позиционирование метки: центр по значению, но у самого края — прижать внутрь.
// Возвращает объект style для инлайна (left + transform), чтобы у компонента не
// осталось собственной арифметики.
export function markStyle(pct) {
  if (pct == null) return null
  if (pct >= 99.999) return { left: '100%', transform: 'translateX(-100%)' }
  if (pct <= 0.001) return { left: '0%', transform: 'translateX(0)' }
  return { left: `${pct}%`, transform: 'translateX(-50%)' }
}

/**
 * Раскладка полосы месяца.
 * @param {{fact:?number, plan:?number, forecast:?number, goal:?number}} v
 * @returns {{
 *   scaleMax:number, factPct:number,
 *   planPct:?number, forecastPct:?number, goalPct:?number,
 *   gapStart:number, gapWidth:number,
 *   planIsGoal:boolean, reachedPlan:boolean, reachedGoal:boolean, empty:boolean
 * }}
 */
export function monthLayout(v) {
  const fact = num(v && v.fact)
  const plan = num(v && v.plan)
  const forecast = num(v && v.forecast)
  const goal = num(v && v.goal)

  const present = [fact, plan, forecast, goal].filter((x) => x != null)
  const scaleMax = present.length ? Math.max(...present) : 0
  const pct = (x) => (scaleMax && x != null ? (x / scaleMax) * 100 : null)

  const factPct = pct(fact) ?? 0
  const forecastPct = pct(forecast)
  // Прогноз по построению ≥ факта (landing = факт + остаток), но отрицательную
  // ширину не пускаем: один битый набор не должен рисовать сегмент задом наперёд.
  const gapWidth = forecastPct == null ? 0 : Math.max(0, forecastPct - factPct)

  return {
    scaleMax,
    factPct,
    planPct: pct(plan),
    forecastPct,
    goalPct: pct(goal),
    gapStart: factPct,
    gapWidth,
    // Цель совпала с планом — штатный случай (парк без планировщика, цель
    // приравнена к плану решением владельца). Сравниваем ТОЧНО: сближать
    // разные числа значило бы врать.
    planIsGoal: plan != null && goal != null && plan === goal,
    reachedPlan: plan != null && fact != null && fact >= plan,
    reachedGoal: goal != null && fact != null && fact >= goal,
    // ЦЕЛЬ = ВЕРХ ШКАЛЫ (обычный случай). Тогда отдельной метки у неё нет: конец
    // полосы и есть цель — так устроен bullet chart, эталон задаёт длину шкалы,
    // а не рисуется штрихом внутри. Метка нужна ТОЛЬКО когда цель кто-то перерос
    // (прогноз или факт выше цели) и она оказалась внутри шкалы.
    goalIsEnd: goal != null && goal === scaleMax,
    empty: present.length === 0,
  }
}
