// Самопроверка типа «БАЛАНС+Δ» (контракт §3/§4) на синтетической фикстуре
// из задания «балансовые карточки: подпись "баланс на дату" + Δ за период».
// Запуск: node scripts/verify-balance-delta.mjs
//
// ВАЖНО: фикстура полностью синтетическая (парки alpha/beta/gamma, поле
// bal) — реальных цифр здесь нет и быть не должно. Финальная приёмка
// на каноне — в контуре данных.

import {
  computeContext,
  lastInPeriod,
  balanceDelta,
} from '../src/composables/analyticsAggregate.js'
import {
  formatRubSigned,
  formatQtySigned,
  lastDayLabel,
  balanceTitle,
  deltaRowLabel,
  deltaLine,
  BALANCE_LABELS,
} from '../src/i18n/analytics.js'

// --- Фикстура из задания §5 -------------------------------------------
// | месяц   | alpha | beta | gamma |
// | 2026-01 |  100  | N/A  |  50   |
// | 2026-02 |  110  | 200  |  55   |
// | 2026-03 |  120  | 210  |  60   |
// | 2026-04 |  130  | 220  |  65   |
// | 2026-05 |  140  | 230  | N/A   |
// Поле bal2 (кейс 6, отрицательная Δ): alpha 2026-04=130, 2026-05=120.
const row = (park, month, bal, bal2 = null) => ({ park, month, bal, bal2 })
const data = {
  updated: null,
  cards: [
    row('alpha', '2026-01', 100), row('alpha', '2026-02', 110),
    row('alpha', '2026-03', 120), row('alpha', '2026-04', 130, 130),
    row('alpha', '2026-05', 140, 120),
    row('beta', '2026-01', null), row('beta', '2026-02', 200),
    row('beta', '2026-03', 210), row('beta', '2026-04', 220),
    row('beta', '2026-05', 230),
    row('gamma', '2026-01', 50), row('gamma', '2026-02', 55),
    row('gamma', '2026-03', 60), row('gamma', '2026-04', 65),
    row('gamma', '2026-05', null),
  ],
}

let fails = 0
function check(name, got, exp) {
  const g = JSON.stringify(got)
  const e = JSON.stringify(exp)
  const ok = g === e
  if (!ok) fails++
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (!ok) console.log(`    got=${g}\n    exp=${e}`)
}
function ctxFor(park, n) {
  return computeContext(data, { park, periodMonths: n })
}

console.log('=== БАЛАНС+Δ · самопроверка на синтетической фикстуре ===')

// --- 1. alpha, окно 1 мес (axis=[2026-05]) -----------------------------
{
  const ctx = ctxFor('alpha', 1)
  const bal = lastInPeriod({ rows: data.cards, ctx, field: 'bal' })
  const d = balanceDelta({ rows: data.cards, ctx, field: 'bal' })
  console.log('\n[1] alpha, 1 мес · axis =', ctx.axis)
  check('баланс = 140', bal.value, 140)
  check('Δ = +10 (prev 2026-04)', { v: d.value, prev: d.prevMonth }, { v: 10, prev: '2026-04' })
  check('span = null (pick = конец окна)', d.span, null)
  check('подпись заголовка', balanceTitle('obligations', bal.dates),
    'Непогашенные обязательства · баланс на 31.05.2026')
}

// --- 2. beta, окно 3 мес (мар–май) -------------------------------------
{
  const ctx = ctxFor('beta', 3)
  const bal = lastInPeriod({ rows: data.cards, ctx, field: 'bal' })
  const d = balanceDelta({ rows: data.cards, ctx, field: 'bal' })
  console.log('\n[2] beta, 3 мес · axis =', ctx.axis)
  check('баланс = 230', bal.value, 230)
  check('Δ = 230−200 = +30 (prev 2026-02)', { v: d.value, prev: d.prevMonth }, { v: 30, prev: '2026-02' })
}

// --- 3. beta, окно 5 мес (янв–май): prevMonth 2025-12 отсутствует ------
{
  const ctx = ctxFor('beta', 5)
  const d = balanceDelta({ rows: data.cards, ctx, field: 'bal' })
  console.log('\n[3] beta, 5 мес · axis =', ctx.axis)
  check('Δ = null (нет 2025-12, через год)', { v: d.value, prev: d.prevMonth }, { v: null, prev: '2025-12' })
  check('contribParks = 0', d.contribParks, 0)
  const msg = deltaLine(d, null)
  check('сообщение UI', msg, 'Δ за период: нет данных за дек 2025')
}

// --- 4. gamma, окно 2 мес (апр–май): pick = 2026-04, span усечён -------
{
  const ctx = ctxFor('gamma', 2)
  const bal = lastInPeriod({ rows: data.cards, ctx, field: 'bal' })
  const d = balanceDelta({ rows: data.cards, ctx, field: 'bal' })
  console.log('\n[4] gamma, 2 мес · axis =', ctx.axis)
  check('баланс = 65 (pick 2026-04)', { v: bal.value, dates: bal.dates }, { v: 65, dates: ['2026-04'] })
  check('Δ = 65−60 = +5', d.value, 5)
  check('span усечён {2026-04..2026-04}', d.span, { from: '2026-04', to: '2026-04' })
  check('подпись диапазона', deltaRowLabel(d, null), 'Δ за апр 2026')
}

// --- 5. network, окно 1 мес: gamma без значения в окне ------------------
{
  const ctx = ctxFor('network', 1)
  const bal = lastInPeriod({ rows: data.cards, ctx, field: 'bal' })
  const d = balanceDelta({ rows: data.cards, ctx, field: 'bal' })
  console.log('\n[5] network, 1 мес · axis =', ctx.axis)
  check('баланс = 370 (lastInPeriod не менялся)', bal.value, 370)
  check('Δ = (140−130)+(230−220) = +20', d.value, 20)
  check('«2 из 3 парков»', BALANCE_LABELS.deltaParks(d.contribParks, d.totalParks), '2 из 3 парков')
  check('span = null, multipleSpans = false', { s: d.span, m: d.multipleSpans }, { s: null, m: false })
}

// --- 6. Отрицательная Δ: alpha, поле bal2 -------------------------------
{
  const ctx = ctxFor('alpha', 1)
  const d = balanceDelta({ rows: data.cards, ctx, field: 'bal2' })
  console.log('\n[6] alpha, 1 мес, поле bal2 (130 → 120)')
  check('Δ = −10', d.value, -10)
  const rub = formatRubSigned(d.value)
  const qty = formatQtySigned(d.value)
  // Минус типографский U+2212; рендер — только строка, цветом не управляет
  // (монохром гарантирован шаблоном: text-[var(--text)]).
  check('рендер ₽: «−10 ₽»', /^−10\s₽$/u.test(rub) ? 'ok' : rub, 'ok')
  check('рендер шт: «−10 шт»', /^−10\sшт$/u.test(qty) ? 'ok' : qty, 'ok')
}

// --- Бонус: переход через год в monthAdd уже покрыт кейсом 3;
//     последний день месяца — кейсом 1 (31.05.2026) и февралём:
check('\nlastDayLabel("2026-02") = 28.02.2026', lastDayLabel('2026-02'), '28.02.2026')

console.log(`\n=== Итог: ${fails === 0 ? 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `ПРОВАЛОВ: ${fails}`} ===`)
process.exit(fails === 0 ? 0 : 1)
