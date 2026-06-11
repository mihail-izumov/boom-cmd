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

console.log('\n=== Итого ===')
console.log(allOk && okPit && okCash && okMari && okYear ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(allOk && okPit && okCash && okMari && okYear ? 0 : 1)
