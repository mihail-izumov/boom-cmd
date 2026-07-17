// Локальная проверка приёмки под-страницы «Контроль дня».
// Запуск: `node scripts/verify-daily.mjs`.
//
// Работает на ВЫДУМАННОМ src/data/daily.mock.json (как verify-analytics.mjs на своём
// моке) — пинует МАТ-ИНВАРИАНТЫ модели, не реальные бизнес-числа (граница: реальные
// значения в публичный scripts/ не кладутся; сверка с пультами — приватный шаг «уровня B»).
//
// Инварианты: Σплан=цель РОВНО · sigClass 1.00/0.85 (зел/жёлт/крас) ·
// journal[-1].landing === round(model.landing) · адаптивные колонки метрик.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { computeDaily, computeNetwork, sigClass } from '../src/composables/dailyModel.js'

const here = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(resolve(here, '../src/data/daily.mock.json'), 'utf8'))
const sets = data.sets

let ok = true
const check = (label, pass, got) => { ok = ok && pass; console.log(`${pass ? '✓' : '✗'}  ${label}${got !== undefined ? `  (${got})` : ''}`) }

console.log('=== sigClass (пороги 1.00 / 0.85) ===')
check('sigClass(1.00) = good', sigClass(1.0) === 'good', sigClass(1.0))
check('sigClass(0.92) = warn', sigClass(0.92) === 'warn', sigClass(0.92))
check('sigClass(0.85) = warn', sigClass(0.85) === 'warn', sigClass(0.85))
check('sigClass(0.8499) = bad', sigClass(0.8499) === 'bad', sigClass(0.8499))
check('sigClass(null) = idle', sigClass(null) === 'idle', sigClass(null))

console.log('\n=== Инварианты по наборам ===')
const expectFc = { 'ohta:2025-05': 'good', 'piterland:2025-05': 'warn', 'iyun:2025-05': 'bad' }
for (const [key, set] of Object.entries(sets)) {
  const m = computeDaily(set)
  console.log(`\n— ${key} —`)

  // 1) Σплан = цель РОВНО
  const sumPlan = m.days.reduce((a, x) => a + x.plan, 0)
  check(`Σплан = цель (${Math.round(sumPlan)} vs ${m.T})`, Math.abs(sumPlan - m.T) < 1e-6 * (m.T || 1) + 1e-6)

  // 2) заработано = Σ полных дней (вкл. выброс)
  const earned = set.days.filter((d) => d.status === 'full').reduce((a, d) => a + d.rev, 0)
  check(`earned = Σ full rev (${m.realizedRev})`, m.realizedRev === earned)

  // 3) финальная точка journal == round(model.landing)
  const jLast = set.journal[set.journal.length - 1]
  check(`journal[-1].landing == round(landing) (${jLast.landing} vs ${Math.round(m.landing)})`, jLast.landing === Math.round(m.landing))

  // 4) светофор прогноза
  check(`fcSig = ${expectFc[key]}`, m.fcSig === expectFc[key], m.fcSig)

  // независимые числа для владельца
  console.log(`   цель ${m.T.toLocaleString('ru-RU')} · заработано ${m.realizedRev.toLocaleString('ru-RU')} · ` +
    `прогноз ${Math.round(m.landing).toLocaleString('ru-RU')} (${(m.landDev * 100).toFixed(1)}%) · ` +
    `on_plan ${m.onPlan == null ? '—' : (m.onPlan * 100).toFixed(1) + '%'} · достижима ${m.achievable ? 'да' : 'нет'}`)
  console.log(`   метрик-колонок: [${m.metColumns.map((c) => c.key).join(', ') || '—'}]`)
}

console.log('\n=== Адаптивные колонки метрик ===')
const mOhta = computeDaily(sets['ohta:2025-05'])
const mPiter = computeDaily(sets['piterland:2025-05'])
const mIyun = computeDaily(sets['iyun:2025-05'])
const keys = (m) => m.metColumns.map((c) => c.key)
check("ohta включает 'chk' и 'sessions'", keys(mOhta).includes('chk') && keys(mOhta).includes('sessions'))
check('piterland — без метрик (только rev/нал/безнал)', keys(mPiter).length === 0, keys(mPiter).join(',') || 'пусто')
check("iyun включает 'new'/'topups', но НЕ 'chk'/'sessions'",
  keys(mIyun).includes('new') && keys(mIyun).includes('topups') && !keys(mIyun).includes('chk') && !keys(mIyun).includes('sessions'),
  keys(mIyun).join(','))

console.log('\n=== «Вся сеть» (агрегат 3 парков) ===')
const net = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
const totTarget = net.cards.reduce((a, c) => a + c.target, 0)
const totEarned = net.cards.reduce((a, c) => a + c.earned, 0)
check(`сумма целей = Σ по-парковых (${net.totals.target})`, net.totals.target === totTarget)
check(`сумма фактов = Σ по-парковых (${net.totals.earned})`, net.totals.earned === totEarned)
check('карт в сети = 3', net.cards.length === 3, net.cards.length)
console.log(`   сеть: цель ${net.totals.target.toLocaleString('ru-RU')} · заработано ${net.totals.earned.toLocaleString('ru-RU')} · ` +
  `прогноз ${Math.round(net.totals.landing).toLocaleString('ru-RU')} (${(net.totals.landDev * 100).toFixed(1)}%) · допущение ${net.totals.anyAssume ? 'да' : 'нет'}`)

console.log('\n=== Итог ===')
console.log(ok ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(ok ? 0 : 1)
