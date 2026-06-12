// Локальная проверка приёмки аналитики по фикстуре.
// Запуск: `node scripts/verify-analytics.mjs`.
// Сверяет 8 чисел приёмки (ohta / 3 месяца) и три кейса пропусков из ТЗ.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  computeContext,
  sumField,
  recalcRatio,
  recalcRatioCross,
  weightedRatio,
  recalcPayoutTarget,
  weightedRatioCross,
  maxField,
  lastInPeriod,
  fieldCompleteness,
  pairCompleteness,
  sumOverCommonMonths,
  shareOfTotal,
  isFullyComplete,
} from '../src/composables/analyticsAggregate.js'

const here = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(resolve(here, '../src/data/analytics.mock.json'), 'utf8'))

function rub2(v) { return v === null ? '—' : v.toFixed(2) }
function pct2(v) { return v === null ? '—' : v.toFixed(2) }

const ctx = computeContext(data, { park: 'ohta', periodMonths: 3 })
console.log(`\n=== Контекст: ohta / 3 месяца ===`)
console.log('axis:', ctx.axis)

const exp = {
  total_revenue: 15562064,
  games: 409006,
  avg_game_price: 42.07,
  avg_check: 568.73,
  ticket_loop_pct: 58.10, // допускается 58.1
  payout_share_pct: 4.08,
  cards_in_system: 14676,
  max_payment_rub: 75000,
}

const got = {
  total_revenue: sumField({ rows: data.revenue, ctx, field: 'total_revenue' }).value,
  games: sumField({ rows: data.game_econ, ctx, field: 'games' }).value,
  avg_game_price: recalcRatio({ rows: data.game_econ, ctx, num: 'game_revenue', den: 'games', scale: 1 }).value,
  avg_check: recalcRatio({ rows: data.revenue, ctx, num: 'total_revenue', den: 'receipts', scale: 1 }).value,
  ticket_loop_pct: weightedRatio({ rows: data.game_econ, ctx, valueField: 'ticket_loop_pct', weightField: 'game_revenue' }).value,
  payout_share_pct: recalcRatioCross({ rowsNum: data.prizes, rowsDen: data.game_econ, ctx, num: 'prize_cost', den: 'game_revenue' }).value,
  cards_in_system: lastInPeriod({ rows: data.cards, ctx, field: 'cards_in_system' }).value,
  max_payment_rub: maxField({ rows: data.cards, ctx, field: 'max_payment_rub' }).value,
}

console.log('\n=== 8 KPI приёмки ===')
const rows = [
  ['Σ total_revenue (₽)',      got.total_revenue,    exp.total_revenue,    (v) => v === exp.total_revenue],
  ['Σ games',                  got.games,            exp.games,            (v) => v === exp.games],
  ['avg_game_price (₽)',       got.avg_game_price,   exp.avg_game_price,   (v) => +v.toFixed(2) === exp.avg_game_price],
  ['avg_check (₽)',            got.avg_check,        exp.avg_check,        (v) => +v.toFixed(2) === exp.avg_check],
  ['ticket_loop_pct (%)',      got.ticket_loop_pct,  exp.ticket_loop_pct,  (v) => +v.toFixed(1) === 58.1],
  ['payout_share_pct (%)',     got.payout_share_pct, exp.payout_share_pct, (v) => +v.toFixed(2) === exp.payout_share_pct],
  ['cards_in_system (last)',   got.cards_in_system,  exp.cards_in_system,  (v) => v === exp.cards_in_system],
  ['max_payment_rub',          got.max_payment_rub,  exp.max_payment_rub,  (v) => v === exp.max_payment_rub],
]
let allOk = true
for (const [label, g, e, ok] of rows) {
  const pass = ok(g)
  allOk = allOk && pass
  console.log(`${pass ? '✓' : '✗'}  ${label.padEnd(28)} got=${typeof g === 'number' ? g : 'null'}  exp=${e}`)
}

console.log('\n=== Кейс 1: reviews/Питерленд (все null → прочерки) ===')
const ctxP = computeContext(data, { park: 'piterland', periodMonths: 3 })
const yandex = lastInPeriod({ rows: data.reviews, ctx: ctxP, field: 'yandex_total' })
const yandexC = fieldCompleteness({ rows: data.reviews, ctx: ctxP, field: 'yandex_total' })
console.log(`  yandex_total last = ${yandex.value} (ожидаем null);  completeness = ${JSON.stringify(yandexC)}`)
const okPit = yandex.value === null && !isFullyComplete(yandexC)
console.log(okPit ? '  ✓ кейс пропусков отрабатывает' : '  ✗ кейс пропусков сломан')

console.log('\n=== Кейс 2: cashless ohta 2025-02 = null ===')
const ctxOhta3 = computeContext(data, { park: 'ohta', periodMonths: 3 })
const ctxOhtaY = computeContext(data, { park: 'ohta', periodMonths: 6 })
// Период «6 мес» накроет 01..06 и попадёт на дыру cashless в феврале.
const cashY = sumField({ rows: data.revenue, ctx: ctxOhtaY, field: 'cashless' })
const cashYC = fieldCompleteness({ rows: data.revenue, ctx: ctxOhtaY, field: 'cashless' })
console.log(`  Σ cashless (ohta 6mo, axis ${ctxOhtaY.axis.join(',')}) = ${cashY.value}; completeness: ${JSON.stringify(cashYC)}`)
const okCash = cashY.contribMonths === 5 && !isFullyComplete(cashYC)
console.log(okCash ? '  ✓ дыра видна в бейдже (5 из 6 мес)' : '  ✗ дыра не отрабатывает')

console.log('\n=== Кейс 3: prizes/MARI — все строки без полей → completeness и payout_target_pct ===')
const ctxM = computeContext(data, { park: 'mari', periodMonths: 3 })
const payoutM = recalcPayoutTarget({ rows: data.prizes, ctx: ctxM })
const payoutC = fieldCompleteness({ rows: data.prizes, ctx: ctxM, field: 'payout_target_pct' })
console.log(`  payout_target(period) = ${payoutM.value};  completeness = ${JSON.stringify(payoutC)}`)
const okMari = payoutM.value === null && payoutC.have === 0
console.log(okMari ? '  ✓ MARI prizes — прочерк + бейдж «0 из 3»' : '  ✗ MARI prizes — сломан')

console.log('\n=== Год для ohta (12 мес, в фикстуре 6) — бейдж «6 из 12» ===')
const ctxOhtaYear = computeContext(data, { park: 'ohta', periodMonths: 12 })
const totalY = sumField({ rows: data.revenue, ctx: ctxOhtaYear, field: 'total_revenue' })
const totalYC = fieldCompleteness({ rows: data.revenue, ctx: ctxOhtaYear, field: 'total_revenue' })
console.log(`  axis length = ${ctxOhtaYear.axis.length};  Σ = ${totalY.value};  completeness = ${JSON.stringify(totalYC)}`)
const okYear = ctxOhtaYear.axis.length === 6 && totalYC.have === 6 && totalYC.want === 12
console.log(okYear ? '  ✓ окно «Год» признаёт неполноту' : '  ✗ окно «Год» сломано')

console.log('\n=== Сеть («Вся сеть») / 3 мес — проверка кросс-парк агрегации ===')
const ctxNet = computeContext(data, { park: 'network', periodMonths: 3 })
const netRev = sumField({ rows: data.revenue, ctx: ctxNet, field: 'total_revenue' })
const netRevC = fieldCompleteness({ rows: data.revenue, ctx: ctxNet, field: 'total_revenue' })
// ohta 04..06 + piterland 04..06 + mari 04..06 — все revenue полны
console.log(`  axis = ${ctxNet.axis.join(',')};  Σ total_revenue (network) = ${netRev.value}`)
console.log(`  completeness = ${JSON.stringify(netRevC)}`)

// === Синтетический кейс асимметрии (баги 2 и 3) ======================
// «Поле A есть, поле B = null в части месяцев» — главный регресс-класс
// после фикса. Тестируется на инлайн-данных: настоящая фикстура
// ohta/2025-02 имеет такую пару (cashless null, total_revenue не null),
// но для чистого юнит-теста удобнее изолированный мини-набор.

console.log('\n=== Синтетика: симметричные суммы по общим месяцам ===')
const synth = {
  updated: '2025-09-01T00:00:00Z',
  // 8 месяцев у «x»: 5 общих, 3 — только new_visitors (visitors_total = null).
  players: [
    { park: 'x', month: '2025-01', visitors_total: 100, new_visitors: 60 },
    { park: 'x', month: '2025-02', visitors_total: 110, new_visitors: 70 },
    { park: 'x', month: '2025-03', visitors_total: 120, new_visitors: 80 },
    { park: 'x', month: '2025-04', visitors_total: 130, new_visitors: 90 },
    { park: 'x', month: '2025-05', visitors_total: 140, new_visitors: 100 },
    { park: 'x', month: '2025-06', visitors_total: null, new_visitors: 50 },
    { park: 'x', month: '2025-07', visitors_total: null, new_visitors: 55 },
    { park: 'x', month: '2025-08', visitors_total: null, new_visitors: 60 },
  ],
  // Доходы: «website» появляется только последние 3 месяца, безнал/нал —
  // все 6. shareOfTotal должен считать доли по общим 3 месяцам.
  revenue: [
    { park: 'x', month: '2025-01', cashless: 1000, cash: 200, website: null, total_revenue: 1200, receipts: 10 },
    { park: 'x', month: '2025-02', cashless: 1100, cash: 220, website: null, total_revenue: 1320, receipts: 11 },
    { park: 'x', month: '2025-03', cashless: 1200, cash: 240, website: null, total_revenue: 1440, receipts: 12 },
    { park: 'x', month: '2025-04', cashless: 1300, cash: 260, website: 50,   total_revenue: 1610, receipts: 13 },
    { park: 'x', month: '2025-05', cashless: 1400, cash: 280, website: 60,   total_revenue: 1740, receipts: 14 },
    { park: 'x', month: '2025-06', cashless: 1500, cash: 300, website: 70,   total_revenue: 1870, receipts: 15 },
  ],
  cards: [], game_econ: [], prizes: [], reviews: [],
}

const synthCtxP = computeContext(synth, { park: 'x', periodMonths: 8 })
const paired = sumOverCommonMonths({
  rows: synth.players, ctx: synthCtxP, fields: ['visitors_total', 'new_visitors'],
})
const pairC = pairCompleteness({
  rows: synth.players, ctx: synthCtxP, fields: ['visitors_total', 'new_visitors'],
})
// Common months = 5; Σvisitors = 600, Σnew = 400; share = 66.67%.
const expSv = 600
const expSn = 400
const expCommon = 5
console.log(`  Σvisitors (common) = ${paired.sums.visitors_total}  (ожидаем ${expSv})`)
console.log(`  Σnew (common)      = ${paired.sums.new_visitors}  (ожидаем ${expSn})`)
console.log(`  contribMonths       = ${paired.contribMonths}  (ожидаем ${expCommon})`)
console.log(`  pairCompleteness    = have:${pairC.have} want:${pairC.want}`)
const shareNewSynth = (paired.sums.new_visitors / paired.sums.visitors_total) * 100
const shareRecalc = recalcRatio({
  rows: synth.players, ctx: synthCtxP, num: 'new_visitors', den: 'visitors_total',
}).value
console.log(`  shareNew (pair)    = ${shareNewSynth.toFixed(2)}%`)
console.log(`  shareNew (recalc)  = ${shareRecalc.toFixed(2)}%  ← должно совпасть`)
const okPair =
  paired.sums.visitors_total === expSv &&
  paired.sums.new_visitors === expSn &&
  paired.contribMonths === expCommon &&
  pairC.have === 5 &&
  pairC.want === 8 &&
  Math.abs(shareNewSynth - shareRecalc) < 1e-9
console.log(okPair ? '  ✓ симметричные суммы и доля сходятся с recalcRatio' : '  ✗ баг 2 не закрыт')

console.log('\n=== Синтетика: shareOfTotal без перекоса (баг 3) ===')
const synthCtxR = computeContext(synth, { park: 'x', periodMonths: 6 })
const struct = shareOfTotal({
  rows: synth.revenue, ctx: synthCtxR, fields: ['cashless', 'cash', 'website'],
})
// Общие месяцы = 3 (apr/may/jun): Σcashless=4200, Σcash=840, Σwebsite=180,
// total = 5220 → cashless 80.46%, cash 16.09%, website 3.45%.
const get = (f) => struct.find((s) => s.field === f)
const sCashless = get('cashless')
const sCash = get('cash')
const sWebsite = get('website')
console.log(`  Σcashless = ${sCashless.value}  (ожидаем 4200)`)
console.log(`  Σcash     = ${sCash.value}  (ожидаем 840)`)
console.log(`  Σwebsite  = ${sWebsite.value}  (ожидаем 180)`)
console.log(`  share website = ${sWebsite.share.toFixed(2)}%  (ожидаем 3.45)`)
console.log(`  contribMonths = ${sCashless.contribMonths}  (ожидаем 3)`)
const okShare =
  sCashless.value === 4200 &&
  sCash.value === 840 &&
  sWebsite.value === 180 &&
  sCashless.contribMonths === 3 &&
  Math.abs(sWebsite.share - (180 / 5220) * 100) < 1e-9
console.log(okShare ? '  ✓ shareOfTotal на общих месяцах, перекоса нет' : '  ✗ баг 3 не закрыт')

console.log('\n=== Итого ===')
const overall = allOk && okPit && okCash && okMari && okYear && okPair && okShare
console.log(overall ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(overall ? 0 : 1)
