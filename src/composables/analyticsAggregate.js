// === Аналитика · модуль агрегаций =====================================
// Чистый JS-модуль (нет vue, нет DOM, нет fetch). Реализует DATA-CONTRACT
// `DATA-CONTRACT-analytics.md` построчно. Любая правка под ревью владельца.
//
// ИСТОЧНИКИ ИСТИНЫ:
//   • §3 — правила агрегации за период (СУММА / ПЕРЕСЧЁТ из компонент /
//          ПОСЛЕДНИЙ месяц / МАКСИМУМ / помесячный взвешенный «≈»);
//   • §4 — пропуски (null), правило «оба периода полные» для роста.
//
// ОКНО ПЕРИОДА:
//   • park view: последние N календарных месяцев, в которых у этого парка
//     есть хотя бы одна строка по любому домену (стабильная ось для всех
//     KPI выбранного парка).
//   • 'network' view: последние N календарных месяцев, в которых хотя бы
//     у одного парка есть строка по любому домену. По требованию владельца
//     (ответ 5): недостающие парк-месяцы попадают в бейдж неполноты.
//
// СЕМАНТИКА «Вся сеть» В АНАЛИТИКЕ:
//   В Проектах network = только строки с parks==='network'. В Аналитике
//   общесетевых строк не бывает — каждая строка привязана к парку. Поэтому
//   network здесь = АГРЕГАТ по всем паркам с данными, по тем же правилам §3.
//   Это сознательное расхождение с Проектами (TZ-3.3 §1); в коде явно
//   маршрутизируется через computeContext().
//
// НАКОПИТЕЛЬНЫЕ «ПОСЛЕДНИЙ МЕСЯЦ» НА СЕТИ:
//   По требованию владельца (ответ 2б): сумма последних значений каждого
//   парка в окне; если эти последние месяцы у парков разные — экспозируем
//   `dates` и флаг `multipleDates`, чтобы UI показал подпись о разных датах.

// --- Тонкие утилиты ----------------------------------------------------

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

// Все парки из всех доменов — для определения parksInScope при 'network'.
function listAllParks(data) {
  const set = new Set()
  for (const k of DOMAIN_KEYS) {
    for (const r of data[k] || []) {
      if (r && r.park) set.add(r.park)
    }
  }
  return [...set]
}

// Множество месяцев, в которых у парка scope есть хотя бы одна строка
// в ЛЮБОМ домене (для park view: одного парка; для network: всех парков).
function collectScopeMonths(data, park) {
  const months = new Set()
  for (const k of DOMAIN_KEYS) {
    for (const r of data[k] || []) {
      if (!r || !r.month) continue
      if (park === 'network' || r.park === park) months.add(r.month)
    }
  }
  return [...months].sort() // лексикографическая сортировка 'YYYY-MM' = хронологическая
}

// Последние N месяцев из отсортированного по возрастанию массива.
function takeLastN(sortedAsc, n) {
  if (n >= sortedAsc.length) return sortedAsc.slice()
  return sortedAsc.slice(sortedAsc.length - n)
}

// Индекс строк по (park, month) для O(1) lookup.
function indexByParkMonth(rows) {
  const map = new Map()
  for (const r of rows || []) {
    if (!r || !r.park || !r.month) continue
    map.set(`${r.park}|${r.month}`, r)
  }
  return map
}

// Какие парки фактически имеют строки в этом домене внутри axis.
function activeParksFor(domainRows, parksAll, axis) {
  const present = new Set()
  for (const r of domainRows || []) {
    if (axis.includes(r?.month) && parksAll.includes(r?.park)) present.add(r.park)
  }
  return parksAll.filter((p) => present.has(p))
}

// Список доменов — для прохода при сборе scopeMonths и парков.
export const DOMAIN_KEYS = [
  'revenue',
  'players',
  'cards',
  'game_econ',
  'prizes',
  'reviews',
]

// --- Контекст периода --------------------------------------------------

/**
 * Базовый контекст для всех вычислений:
 *   axis         — массив 'YYYY-MM' в порядке возрастания (last N имеющихся);
 *   target       — целевая длина окна (1, 3, 12);
 *   park         — 'network' | id парка;
 *   parksAll     — все парки, встречающиеся в данных;
 *   parksInScope — парки, используемые в агрегации (для network — parksAll,
 *                  для park — [park]).
 */
export function computeContext(data, { park, periodMonths }) {
  const safeData = data || {}
  const parksAll = listAllParks(safeData)
  const scopeMonths = collectScopeMonths(safeData, park)
  const axis = takeLastN(scopeMonths, periodMonths)
  const parksInScope = park === 'network' ? parksAll : [park]
  return {
    park,
    target: periodMonths,
    axis,
    parksAll,
    parksInScope,
    updated: safeData.updated || null,
  }
}

// --- Полнота / completeness -------------------------------------------

/**
 * Полнота поля в окне.
 *   park view:
 *     { kind: 'park', have, want, axisLength }
 *       have — месяцев в axis, где значение не null;
 *       want — target (целевая длина окна);
 *       axisLength — сколько месяцев реально доступно (<= target).
 *   network view:
 *     { kind: 'network',
 *       haveParkMonths, wantParkMonths,
 *       monthsHave, monthsWant, parksCount, parksWithData }
 *       парк-месяцы = parksInScope.length × target;
 *       monthsHave/monthsWant — про календарь окна.
 *
 * isFullyComplete(c) — true, если ВСЁ заполнено (бейдж не показываем).
 */
export function fieldCompleteness({ rows, ctx, field }) {
  const { park, axis, target, parksInScope } = ctx
  const idx = indexByParkMonth(rows)

  if (park === 'network') {
    let have = 0
    const wantParkMonths = parksInScope.length * target
    for (const p of parksInScope) {
      for (const m of axis) {
        const r = idx.get(`${p}|${m}`)
        if (r && isNum(r[field])) have++
      }
    }
    // Сколько парков реально дают хотя бы одно значение по этому полю в окне.
    const parksWithData = parksInScope.filter((p) =>
      axis.some((m) => isNum(idx.get(`${p}|${m}`)?.[field])),
    ).length
    return {
      kind: 'network',
      haveParkMonths: have,
      wantParkMonths,
      monthsHave: axis.length,
      monthsWant: target,
      parksCount: parksInScope.length,
      parksWithData,
    }
  }

  let have = 0
  for (const m of axis) {
    const r = idx.get(`${park}|${m}`)
    if (r && isNum(r[field])) have++
  }
  return { kind: 'park', have, want: target, axisLength: axis.length }
}

export function isFullyComplete(c) {
  if (!c) return true
  if (c.kind === 'park') return c.have === c.want && c.axisLength === c.want
  return (
    c.haveParkMonths === c.wantParkMonths &&
    c.monthsHave === c.monthsWant &&
    c.parksWithData === c.parksCount
  )
}

// --- Примитивы агрегации ----------------------------------------------

/**
 * СУММА по периоду (§3, строка «СУММА»).
 *   value = null, если ни одной строки не внесло вклад (полная дыра).
 */
export function sumField({ rows, ctx, field }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  let sum = 0
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[field])) {
        sum += r[field]
        contrib++
      }
    }
  }
  return { value: contrib > 0 ? sum : null, contribMonths: contrib }
}

/**
 * ПЕРЕСЧЁТ из компонент (§3, строка «ПЕРЕСЧЁТ»):
 *   Σnum / Σden × scale; в Σ входят ТОЛЬКО месяцы, где есть ОБА компонента
 *   (§4.3). Возвращает null, если знаменатель пуст/ноль.
 *   Оба поля должны жить в одном rows-массиве (один домен).
 */
export function recalcRatio({ rows, ctx, num, den, scale = 100 }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  let sumN = 0
  let sumD = 0
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[num]) && isNum(r[den])) {
        sumN += r[num]
        sumD += r[den]
        contrib++
      }
    }
  }
  if (contrib === 0 || sumD === 0) return { value: null, contribMonths: 0 }
  return { value: (sumN / sumD) * scale, contribMonths: contrib }
}

/**
 * КРОСС-ДОМЕННЫЙ пересчёт (для payout_share_pct: prize_cost из prizes,
 * game_revenue из game_econ). Сводим по (park, month).
 */
export function recalcRatioCross({ rowsNum, rowsDen, ctx, num, den, scale = 100 }) {
  const { axis, parksInScope } = ctx
  const idxN = indexByParkMonth(rowsNum)
  const idxD = indexByParkMonth(rowsDen)
  let sumN = 0
  let sumD = 0
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const rn = idxN.get(`${p}|${m}`)
      const rd = idxD.get(`${p}|${m}`)
      if (rn && rd && isNum(rn[num]) && isNum(rd[den])) {
        sumN += rn[num]
        sumD += rd[den]
        contrib++
      }
    }
  }
  if (contrib === 0 || sumD === 0) return { value: null, contribMonths: 0 }
  return { value: (sumN / sumD) * scale, contribMonths: contrib }
}

/**
 * Взвешенное ПЕРЕСЧЁТ (для ticket_loop_pct: Σ(game_revenue × loop/100) /
 * Σgame_revenue × 100). Геометрически — пересчёт с весом по game_revenue.
 */
export function weightedRatio({ rows, ctx, valueField, weightField, scale = 100 }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  let sumN = 0
  let sumD = 0
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[valueField]) && isNum(r[weightField])) {
        sumN += (r[valueField] / scale) * r[weightField]
        sumD += r[weightField]
        contrib++
      }
    }
  }
  if (contrib === 0 || sumD === 0) return { value: null, contribMonths: 0 }
  return { value: (sumN / sumD) * scale, contribMonths: contrib }
}

/**
 * ПЕРЕСЧЁТ payout_target_pct (§3):
 *   Σprize_cost / Σ(prize_cost / (payout_target_pct/100)) × 100.
 * Знаменатель — back-derived «расчётная выручка» по месяцам.
 */
export function recalcPayoutTarget({ rows, ctx }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  let sumCost = 0
  let sumImpliedRev = 0
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r.prize_cost) && isNum(r.payout_target_pct) && r.payout_target_pct > 0) {
        sumCost += r.prize_cost
        sumImpliedRev += r.prize_cost / (r.payout_target_pct / 100)
        contrib++
      }
    }
  }
  if (contrib === 0 || sumImpliedRev === 0) return { value: null, contribMonths: 0 }
  return { value: (sumCost / sumImpliedRev) * 100, contribMonths: contrib }
}

/**
 * МАКСИМУМ по периоду (§3, строка «МАКСИМУМ»: max_payment_rub).
 */
export function maxField({ rows, ctx, field }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  let max = null
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[field])) {
        if (max === null || r[field] > max) max = r[field]
        contrib++
      }
    }
  }
  return { value: max, contribMonths: contrib }
}

/**
 * ПОСЛЕДНИЙ месяц в окне (§3, строка «ПОСЛЕДНИЙ»: накопительные точки
 * во времени — cards_in_system, outstanding_points_rub, yandex_total, …).
 *
 * park view: значение последнего месяца в axis, где у парка есть не-null.
 * network view (ответ владельца №2б): сумма последних значений каждого
 *   парка. Если дата последнего месяца не одинакова у парков — выставляем
 *   multipleDates=true и отдаём перечень `byPark` с (park, month, value),
 *   чтобы UI показал подпись «состояние на разные даты».
 */
export function lastInPeriod({ rows, ctx, field }) {
  const { axis, parksInScope, park } = ctx
  const idx = indexByParkMonth(rows)
  const byPark = []
  for (const p of parksInScope) {
    let pick = null
    // axis отсортирован по возрастанию — идём с конца.
    for (let i = axis.length - 1; i >= 0; i--) {
      const m = axis[i]
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[field])) {
        pick = { park: p, month: m, value: r[field] }
        break
      }
    }
    if (pick) byPark.push(pick)
  }

  if (byPark.length === 0) {
    return { value: null, byPark: [], multipleDates: false, dates: [] }
  }
  if (park !== 'network') {
    const only = byPark[0]
    return { value: only.value, byPark, multipleDates: false, dates: [only.month] }
  }
  const sum = byPark.reduce((acc, x) => acc + x.value, 0)
  const dates = [...new Set(byPark.map((x) => x.month))]
  return {
    value: sum,
    byPark,
    multipleDates: dates.length > 1,
    dates,
  }
}

// --- Помесячный ряд (для трендов слоя 2) -------------------------------

/**
 * Ряд значений по axis для тренда. На park view — значение этого парка.
 * На network — СУММА по всем паркам в этом месяце (или null, если нет).
 * Возвращает массив { month, value } той же длины, что axis.
 */
export function monthlySeries({ rows, ctx, field }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  return axis.map((m) => {
    let sum = 0
    let contrib = 0
    for (const p of parksInScope) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[field])) {
        sum += r[field]
        contrib++
      }
    }
    return { month: m, value: contrib > 0 ? sum : null }
  })
}

/**
 * Помесячный ВЗВЕШЕННЫЙ ряд (для returning_pct / capture_rate /
 * avg_visits на network: значение в месяц = взвешено по visitors_total
 * среди парков). На park view — просто значение этого парка.
 */
export function monthlyWeightedSeries({ rows, ctx, valueField, weightField }) {
  const { axis, parksInScope } = ctx
  const idx = indexByParkMonth(rows)
  return axis.map((m) => {
    let sumW = 0
    let sumVW = 0
    let contrib = 0
    for (const p of parksInScope) {
      const r = idx.get(`${p}|${m}`)
      if (r && isNum(r[valueField]) && isNum(r[weightField])) {
        sumW += r[weightField]
        sumVW += r[valueField] * r[weightField]
        contrib++
      }
    }
    return { month: m, value: contrib > 0 && sumW > 0 ? sumVW / sumW : null }
  })
}

/**
 * КРОСС-ДОМЕННОЕ взвешенное (для returning_pct / avg_visits: значения
 * живут в cards, вес visitors_total — в players). Сводка по (park, month).
 */
export function weightedRatioCross({
  rowsValue,
  rowsWeight,
  ctx,
  valueField,
  weightField,
  scale = 100,
}) {
  const { axis, parksInScope } = ctx
  const idxV = indexByParkMonth(rowsValue)
  const idxW = indexByParkMonth(rowsWeight)
  let sumN = 0
  let sumD = 0
  let contrib = 0
  for (const p of parksInScope) {
    for (const m of axis) {
      const rv = idxV.get(`${p}|${m}`)
      const rw = idxW.get(`${p}|${m}`)
      if (rv && rw && isNum(rv[valueField]) && isNum(rw[weightField])) {
        sumN += (rv[valueField] / scale) * rw[weightField]
        sumD += rw[weightField]
        contrib++
      }
    }
  }
  if (contrib === 0 || sumD === 0) return { value: null, contribMonths: 0 }
  return { value: (sumN / sumD) * scale, contribMonths: contrib }
}

/**
 * КРОСС-ДОМЕННЫЙ помесячный взвешенный ряд (например returning_pct по
 * cards с весом visitors_total из players, для тренда на сетевом виде).
 */
export function monthlyWeightedSeriesCross({
  rowsValue,
  rowsWeight,
  ctx,
  valueField,
  weightField,
}) {
  const { axis, parksInScope } = ctx
  const idxV = indexByParkMonth(rowsValue)
  const idxW = indexByParkMonth(rowsWeight)
  return axis.map((m) => {
    let sumW = 0
    let sumVW = 0
    let contrib = 0
    for (const p of parksInScope) {
      const rv = idxV.get(`${p}|${m}`)
      const rw = idxW.get(`${p}|${m}`)
      if (rv && rw && isNum(rv[valueField]) && isNum(rw[weightField])) {
        sumW += rw[weightField]
        sumVW += rv[valueField] * rw[weightField]
        contrib++
      }
    }
    return { month: m, value: contrib > 0 && sumW > 0 ? sumVW / sumW : null }
  })
}

// --- Рост к прошлому периоду (§4.4) -----------------------------------

/**
 * Рост Σ(field) к прошлому периоду той же длины.
 * Возвращает null, ЕСЛИ:
 *   • axis < target (текущее окно неполное по календарю), ИЛИ
 *   • любая (park, month) в текущем или прошлом окне даёт null (§4.4
 *     «оба периода полные по этому полю»), ИЛИ
 *   • прошлый период не существует (мало истории).
 *
 * Применяется к СУММИРУЕМЫМ полям. Для пересчётных полей рост = null
 * (не определён без отдельной договорённости с владельцем).
 */
export function growthVsPrev({ rows, data, ctx, field }) {
  const { target, parksInScope, axis, park } = ctx
  if (axis.length < target) return null

  const allMonths = collectScopeMonths(data, park)
  if (allMonths.length < target * 2) return null
  const currentAxis = takeLastN(allMonths, target)
  const prevAxis = takeLastN(
    allMonths.slice(0, allMonths.length - target),
    target,
  )
  if (prevAxis.length < target) return null

  const idx = indexByParkMonth(rows)
  function sumStrict(ax) {
    let s = 0
    for (const p of parksInScope) {
      for (const m of ax) {
        const r = idx.get(`${p}|${m}`)
        if (!r || !isNum(r[field])) return null
        s += r[field]
      }
    }
    return s
  }
  const curr = sumStrict(currentAxis)
  const prev = sumStrict(prevAxis)
  if (curr === null || prev === null || prev === 0) return null
  return ((curr - prev) / prev) * 100
}

// --- Структура (доля от Σ) -----------------------------------
// Для секции «безнал / нал» и т.п. Возвращает массив долей по списку полей.

export function shareOfTotal({ rows, ctx, fields }) {
  const sums = fields.map((f) => sumField({ rows, ctx, field: f }))
  const total = sums.reduce((acc, s) => acc + (s.value || 0), 0)
  return fields.map((f, i) => ({
    field: f,
    value: sums[i].value,
    share: total > 0 && isNum(sums[i].value) ? (sums[i].value / total) * 100 : null,
  }))
}

// --- Helpers для парков активных в окне (для бейджей и подписей) -------

export function activeParksInAxis(domainRows, parksAll, axis) {
  return activeParksFor(domainRows, parksAll, axis)
}
