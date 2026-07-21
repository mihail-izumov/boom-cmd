// Локальная проверка приёмки под-страницы «Контроль дня».
// Запуск: `node scripts/verify-daily.mjs`.
//
// Работает на ВЫДУМАННОМ src/data/daily.mock.json (как verify-analytics.mjs на своём
// моке) — пинует МАТ-ИНВАРИАНТЫ модели, не реальные бизнес-числа (граница: реальные
// значения в публичный scripts/ не кладутся; сверка с пультами — приватный шаг «уровня B»).
//
// Инварианты: Σплан=цель РОВНО · sigClass 1.00/0.85 (зел/жёлт/крас) ·
// journal[-1].landing === round(model.landing) · адаптивные колонки метрик ·
// goalState v2.1 §5 (out/record/ok, границы ×1.001 к maxObs и ×1.25 к implied).

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

  // 5) goalState согласован с achievable: out ⟺ !achievable; record/ok ⟹ achievable
  check(`goalState валиден и согласован с achievable (${m.goalState})`,
    ['ok', 'record', 'out'].includes(m.goalState) && (m.goalState === 'out') === !m.achievable)

  // независимые числа для владельца
  console.log(`   цель ${m.T.toLocaleString('ru-RU')} · заработано ${m.realizedRev.toLocaleString('ru-RU')} · ` +
    `прогноз ${Math.round(m.landing).toLocaleString('ru-RU')} (${(m.landDev * 100).toFixed(1)}%) · ` +
    `on_plan ${m.onPlan == null ? '—' : (m.onPlan * 100).toFixed(1) + '%'} · достижима ${m.achievable ? 'да' : 'нет'} · goalState ${m.goalState}`)
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

console.log('\n=== goalState (v2.1 §5): граничные случаи на синтетике ===')
// Синтетический набор: июнь-2025 (30 дней), коэффициенты 1, факторов нет.
// 2 полных дня: 100 и 300 → impliedBase = 200, maxObsBase = 300, остаток 28 дней
// с весом 1 → adjBase = (T − 400) / 28. Подбираем T под нужный adjBase.
function synthSet(adjBase) {
  return {
    park: 'synth', park_name: 'Синтетика', month: '2025-06',
    month_target: 400 + adjBase * 28,
    dow_coef: [1, 1, 1, 1, 1, 1, 1],
    days: [
      { date: '2025-06-01', rev: 100, status: 'full' },
      { date: '2025-06-02', rev: 300, status: 'full' },
    ],
    journal: [], activities: [], holidays: [],
  }
}
{
  const ok124 = computeDaily(synthSet(248)) // adjBase/implied = 1.24
  check('ratio 1.24 → ok (248 ≤ 250 и ≤ 300×1.001)', ok124.goalState === 'ok', ok124.goalState)
  check('ratio 1.24: achievable сохранён и true', ok124.achievable === true)
  const rec126 = computeDaily(synthSet(252)) // adjBase/implied = 1.26
  check('ratio 1.26 → record (252 > 250, но ≤ 300×1.001)', rec126.goalState === 'record', rec126.goalState)
  check('ratio 1.26: achievable ПО-СТАРОМУ true (обратная совместимость)', rec126.achievable === true)
  const out310 = computeDaily(synthSet(310)) // adjBase > maxObsBase×1.001
  check('adjBase 310 > maxObs 300×1.001 → out', out310.goalState === 'out', out310.goalState)
  check('out: achievable false (согласован)', out310.achievable === false)
  const edge = computeDaily(synthSet(250)) // ровно ×1.25 — строгое «>», остаёмся в ok
  check('ratio ровно 1.25 → ok (строгое >)', edge.goalState === 'ok', edge.goalState)
}

console.log('\n=== goalState в журнале: goal_state из payload + фолбэк ===')
{
  const s = synthSet(248)
  s.journal = [
    { date: '2025-06-01', realized: 100, landing: 6000, landing_pct: 0.83, on_plan: 1, achievable: true, goal_state: 'record' },
    { date: '2025-06-02', realized: 400, landing: 6000, landing_pct: 0.83, on_plan: 1, achievable: false },
    { date: '2025-06-02', realized: 400, landing: 6000, landing_pct: 0.83, on_plan: 1, achievable: true },
  ]
  const j = computeDaily(s).journal
  check("goal_state из payload прокидывается ('record')", j[0].goalState === 'record', j[0].goalState)
  check("фолбэк без goal_state: achievable=false → 'out'", j[1].goalState === 'out', j[1].goalState)
  check("фолбэк без goal_state: achievable=true → 'ok'", j[2].goalState === 'ok', j[2].goalState)
  check('achievable в журнале сохранён', j[0].achievable === true && j[1].achievable === false)
}

console.log('\n=== «Вся сеть» (агрегат 3 парков) ===')
const net = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
const totTarget = net.cards.reduce((a, c) => a + c.target, 0)
const totEarned = net.cards.reduce((a, c) => a + c.earned, 0)
check(`сумма целей = Σ по-парковых (${net.totals.target})`, net.totals.target === totTarget)
check(`сумма фактов = Σ по-парковых (${net.totals.earned})`, net.totals.earned === totEarned)
check('карт в сети = 3', net.cards.length === 3, net.cards.length)
check('goalState на каждой карте = goalState модели её парка (v2.1 §5)',
  net.cards.every((c) => {
    const s = Object.values(sets).find((x) => x.park === c.park && x.month === c.month)
    return s && c.goalState === computeDaily(s).goalState
  }),
  net.cards.map((c) => `${c.park}:${c.goalState}`).join(' '))
console.log(`   сеть: цель ${net.totals.target.toLocaleString('ru-RU')} · заработано ${net.totals.earned.toLocaleString('ru-RU')} · ` +
  `прогноз ${Math.round(net.totals.landing).toLocaleString('ru-RU')} (${(net.totals.landDev * 100).toFixed(1)}%) · допущение ${net.totals.anyAssume ? 'да' : 'нет'}`)

console.log('\n=== Итог ===')
console.log(ok ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(ok ? 0 : 1)
