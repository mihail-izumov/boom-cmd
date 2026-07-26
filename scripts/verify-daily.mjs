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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { computeDaily, computeNetwork, sigClass } from '../src/composables/dailyModel.js'
import { actCode } from '../src/i18n/daily.js'
import {
  sortSignals, latestSignal, feedSignals, statusOf, markState, stateKey,
  buildSignalReadBody, postSignalRead,
} from '../src/composables/dailySignals.js'
import { readCounters } from '../src/i18n/home.js'
import {
  sortSummaries, latestByCadence, latestOf, splitBlock, blocksOf,
  summaryKey, summaryStatusOf, markSummaryState, LABEL_MAX,
} from '../src/composables/netSummary.js'
import { cardTitle, periodLabel, addDays } from '../src/i18n/summary.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
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

console.log('\n=== actCode (v2.2 §3): короткий код бейджа, display-only ===')
check("actCode('Питер-Г1') = 'Г1'", actCode('Питер-Г1') === 'Г1', actCode('Питер-Г1'))
check("actCode('Охта-СемПак-А2') = 'А2' (последний дефис)", actCode('Охта-СемПак-А2') === 'А2')
check("код без дефиса не меняется ('Г1')", actCode('Г1') === 'Г1')
check("null/undefined → '' (не падает)", actCode(null) === '' && actCode(undefined) === '')
{
  // данные не тронуты: в модели activities/acts — ПОЛНЫЙ код из payload
  const s = { ...sets['ohta:2025-05'], activities: [{ code: 'Охта-Г1', name: 'Тест', days: ['2025-05-03'] }] }
  const m = computeDaily(s)
  check('в модели activities[].code — полный код (display-only укорачивание)',
    m.activities[0].code === 'Охта-Г1', m.activities[0].code)
  const day = m.days.find((x) => x.iso === '2025-05-03')
  check('в модели days[].acts — полный код', day.acts.includes('Охта-Г1'), day.acts.join(','))
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

// ═══════════════ Сигналы дня (v3, полоса B) — чистые хелперы ═══════════════
console.log('\n=== Сигналы дня (v3): выбор / лента / статусы / тело ===')
{
  const raw = [
    { date: '2025-05-09', status: 'ok', headline: 'B', action: 'b' },
    { date: '2025-05-16', status: 'ok', headline: 'D', action: 'd' },
    { date: '2025-05-05', status: 'warn', headline: 'A', action: 'a' },
    { date: '2025-05-14', status: 'focus', headline: 'C', action: 'c' },
    { date: 'битая-дата', status: 'ok', headline: 'X' },
    'мусор',
    null,
  ]
  const sorted = sortSignals(raw)
  check('sortSignals: битые/не-объекты отброшены (4 из 7)', sorted.length === 4, sorted.length)
  check('sortSignals: по возрастанию даты',
    sorted.map((s) => s.date).join(',') === '2025-05-05,2025-05-09,2025-05-14,2025-05-16')
  check('latestSignal = max date при перемешанном порядке (16.05)', latestSignal(sorted).date === '2025-05-16')
  check('лента = остальные, новые сверху',
    feedSignals(sorted).map((s) => s.date).join(',') === '2025-05-14,2025-05-09,2025-05-05')
  check('единственный сигнал → лента пуста',
    feedSignals(sortSignals([{ date: '2025-05-01', status: 'ok' }])).length === 0)
  check('нет сигналов → latest null, лента пуста',
    latestSignal(sortSignals(undefined)) === null && feedSignals(sortSignals(null)).length === 0)

  // статусная машина новое → открыто → прочитано
  const store = {}
  check("статус до записи = 'none' (бейдж «новое»)", statusOf(store, 'ohta', '2025-05-16') === 'none')
  markState(store, 'ohta', '2025-05-16', 'viewed')
  check("после viewed = 'viewed' (без бейджа, кнопка активна)", statusOf(store, 'ohta', '2025-05-16') === 'viewed')
  markState(store, 'ohta', '2025-05-16', 'read')
  check("после read = 'read' (Прочитано ✓)", statusOf(store, 'ohta', '2025-05-16') === 'read')
  check('ключ хранилища — пара «park:date» (фраза не хранится)', stateKey('ohta', '2025-05-16') === 'ohta:2025-05-16')

  // тело signal_read по контракту §2
  const body = buildSignalReadBody('phrase-x', 'ohta', '2025-05-16')
  check('тело signal_read: key/type/park/signal_date по контракту',
    body.key === 'phrase-x' && body.type === 'signal_read' && body.park === 'ohta' && body.signal_date === '2025-05-16')
  check('в теле ровно 4 ключа (без лишнего)', Object.keys(body).sort().join(',') === 'key,park,signal_date,type')

  // postSignalRead с мокнутым fetch (реального URL нет)
  let cap = null
  const okres = await postSignalRead({
    api: 'https://mock.invalid/report', key: 'phrase-x', park: 'ohta', signalDate: '2025-05-16',
    fetchImpl: async (url, opts) => { cap = { url, opts }; return { ok: true, status: 200, json: async () => ({ ok: true }) } },
  })
  check('postSignalRead: {ok:true} → true', okres === true)
  check('postSignalRead: redirect follow + тело по контракту',
    cap.opts.redirect === 'follow' &&
    JSON.parse(cap.opts.body).type === 'signal_read' &&
    JSON.parse(cap.opts.body).signal_date === '2025-05-16')
  let threw = false
  try {
    await postSignalRead({ api: 'x', key: 'k', park: 'ohta', signalDate: '2025-05-16',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'bad key' }) }) })
  } catch { threw = true }
  check('postSignalRead: {ok:false} → бросает (кнопка останется активной)', threw)
}

console.log('\n=== Сигналы в моке (3–4 / 1 / 0) ===')
check('ohta: сигналов ≥ 3', sortSignals(sets['ohta:2025-05'].signals).length >= 3, sortSignals(sets['ohta:2025-05'].signals).length)
check('ohta: актуальный = 16.05 (перемешанный порядок в моке)',
  latestSignal(sortSignals(sets['ohta:2025-05'].signals)).date === '2025-05-16')
check('piterland: ровно 1 сигнал (ленты нет)',
  sortSignals(sets['piterland:2025-05'].signals).length === 1 &&
  feedSignals(sortSignals(sets['piterland:2025-05'].signals)).length === 0)
check('iyun: сигналов нет (пустой стейт)', sortSignals(sets['iyun:2025-05'].signals).length === 0)
check('модель прокидывает signals + impliedBase/adjBase',
  Array.isArray(computeDaily(sets['ohta:2025-05']).signals) &&
  Number.isFinite(computeDaily(sets['ohta:2025-05']).impliedBase) &&
  Number.isFinite(computeDaily(sets['ohta:2025-05']).adjBase))
{
  const n = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
  const o = n.cards.find((c) => c.park === 'ohta')
  const iy = n.cards.find((c) => c.park === 'iyun')
  check('сеть: у карты Охты signal актуального (16.05); у Июня — null',
    !!o.signal && o.signal.date === '2025-05-16' && iy.signal === null)
}

// ═══════════════ jsdom: живой рендер полос A/B и сети ═══════════════
console.log('\n=== jsdom: сборка тестового бандла ===')
const tmp = resolve(root, '.tmp-verify-daily')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
writeFileSync(resolve(tmp, 'entry.js'), `
export { default as DailySignalCard } from '${root}/src/components/daily/DailySignalCard.vue'
export { default as DailyDayProgress } from '${root}/src/components/daily/DailyDayProgress.vue'
export { default as DailyNetwork } from '${root}/src/components/daily/DailyNetwork.vue'
export { default as NetSummaryCard } from '${root}/src/components/daily/NetSummaryCard.vue'
export { default as SummaryScreen } from '${root}/src/screens/SummaryScreen.vue'
export { default as HomeScreen } from '${root}/src/screens/HomeScreen.vue'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
export { useParkContext } from '${root}/src/composables/useParkContext.js'
export { useAppNav, clearSubView } from '${root}/src/composables/useAppNav.js'
`)

// jsdom-глобали ДО импортов vite/vue (runtime-dom кэширует document при загрузке)
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://mihail-izumov.github.io/boom-cmd/',
  pretendToBeVisual: true,
})
global.window = dom.window
global.document = dom.window.document
global.localStorage = dom.window.localStorage
try { Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true }) } catch { /* Node 22 */ }
global.Element = dom.window.Element
global.SVGElement = dom.window.SVGElement
global.HTMLElement = dom.window.HTMLElement
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)

const { build } = await import('vite')
const vuePlugin = (await import('@vitejs/plugin-vue')).default
await build({
  configFile: false,
  root,
  logLevel: 'error',
  plugins: [vuePlugin()],
  define: {
    'import.meta.env.VITE_REPORT_API': JSON.stringify('https://mock.invalid/report'),
    'import.meta.env.VITE_PROJECTS_API': JSON.stringify('https://mock.invalid/gate'),
    'import.meta.env.VITE_DAILY_API': JSON.stringify('https://mock.invalid/daily'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: { entry: resolve(tmp, 'entry.js'), formats: ['es'], fileName: 'bundle' },
    outDir: tmp,
    emptyOutDir: false,
    rollupOptions: { external: ['vue'] },
    minify: false,
  },
})
console.log('✓  lib-сборка готова')

// мок fetch: GET → гейт «ок», POST → сценарий из postMode
let postMode = 'ok' // 'ok' | 'reject' | 'neterror'
let getPayload = {} // что отдаёт GET (гейт + ?action=daily); меняется в кейсах сводок
const postedBodies = []
global.fetch = async (url, opts = {}) => {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj })
  if ((opts.method || 'GET') === 'POST') {
    postedBodies.push(String(opts.body || ''))
    if (postMode === 'neterror') return { ok: false, status: 500, json: async () => ({}) }
    if (postMode === 'reject') return json({ ok: false, error: 'bad key' })
    return json({ ok: true })
  }
  return json(getPayload) // гейт: 200 без error → фраза ок
}

const vueWarns = []
const origWarn = console.warn
console.warn = (...a) => {
  const s = a.join(' ')
  if (s.includes('[Vue warn]')) vueWarns.push(s)
  else if (!s.startsWith('signal_read failed')) origWarn(...a)
}

const bundle = await import(pathToFileURL(resolve(tmp, 'bundle.js')).href)
const { createApp, nextTick } = await import('vue')

// «входим» фразой, чтобы memKey был установлен (нужен для POST)
const ak = bundle.useAccessKey()
await ak.submitKey('test-phrase')

const BAD = /NaN|undefined|Infinity/
function mount(comp, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(comp, props || {})
  app.config.warnHandler = (msg) => vueWarns.push(`[Vue warn] ${msg}`)
  app.mount(el)
  return { el, app }
}
async function fire(node, type) {
  node.dispatchEvent(new dom.window.Event(type, { bubbles: true }))
  await nextTick()
}
// прокрутить микро/макро-задачи: экраны грузят данные в setup (useDaily → fetch)
async function flush(n = 6) {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
  }
}

const NOW_MID = new Date(2025, 4, 16, 12, 0, 0) // 16.05.2025, пятница (mOhta/mIyun объявлены выше)

console.log('\n=== jsdom: блок «Сигнал Дня» (полосы A+B слиты, v3.1) ===')
{
  localStorage.clear()
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('заголовок «Сигнал Дня» (Дня с большой)', el.textContent.includes('Сигнал Дня'))
  check('подпись «разбор аналитика от 16.05» (актуальный = max date)', el.textContent.includes('разбор аналитика от 16.05'))
  check('headline актуального виден', el.textContent.includes('Темп восстановлен к выходным'))
  check('бейдж «новое» на первом заходе', el.textContent.includes('новое'))
  const btn = el.querySelector('[data-test="signal-read"]')
  check('кнопка «Прочитала» активна (не «Прочитано»)',
    !!btn && btn.disabled === false && el.textContent.includes('Прочитала') && !el.textContent.includes('Прочитано'))
  check('«Как идёт день» влит в блок', el.textContent.includes('Как идёт день'))
  check('день-строки влиты (4 на моке)', el.querySelectorAll('[data-test="day-line"]').length === 4,
    el.querySelectorAll('[data-test="day-line"]').length)
  check('лента свёрнута: старые сигналы не в DOM', !el.textContent.includes('Среда провалилась по будням'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}
{
  // второй заход: актуальный уже viewed → бейдж «новое» снят
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('бейдж «новое» снят в следующий заход', !el.textContent.includes('новое'))
  await fire(el.querySelector('[data-test="signal-feed-toggle"]'), 'click')
  check('лента раскрыта: старый сигнал виден', el.textContent.includes('Среда провалилась по будням'))
  check('в ленте есть «новое» (непросмотренные строки)', el.textContent.includes('новое'))
  check('строк ленты = 3 (кроме актуального)', el.querySelectorAll('[data-test="signal-feed-row"]').length === 3)
  app.unmount()
}
{
  // успех POST → «Прочитано ✓», кнопка неактивна; тело по контракту §2
  localStorage.clear()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  await new Promise((r) => setTimeout(r, 20)); await nextTick()
  check('POST ушёл ровно один', postedBodies.length === 1)
  const body = JSON.parse(postedBodies[0] || '{}')
  check('тело signal_read по контракту §2 (key/type/park/signal_date)',
    body.key === 'test-phrase' && body.type === 'signal_read' && body.park === 'ohta' && body.signal_date === '2025-05-16')
  check('после успеха: «Прочитано ✓», кнопка неактивна',
    el.textContent.includes('Прочитано') && el.querySelector('[data-test="signal-read"]').disabled === true)
  app.unmount()
  const re = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('прочитано и при следующих заходах', re.el.textContent.includes('Прочитано'))
  re.app.unmount()
}
{
  // ошибка бэка → красная плашка, кнопка остаётся активной
  localStorage.clear()
  postMode = 'reject'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  await new Promise((r) => setTimeout(r, 20)); await nextTick()
  check('красная плашка дословно', el.textContent.includes('Не удалось отметить. Проверьте связь и попробуйте ещё раз.'))
  check('кнопка осталась активной (повтор разрешён)',
    el.querySelector('[data-test="signal-read"]').disabled === false &&
    el.textContent.includes('Прочитала') && !el.textContent.includes('Прочитано'))
  app.unmount()
  postMode = 'ok'
}
{
  // нет сигнала (Июнь) → блок есть (Как идёт день живёт), но разбора нет
  const { el, app } = mount(bundle.DailySignalCard, { m: mIyun, now: NOW_MID })
  await nextTick()
  check('без сигнала: заголовок «Сигнал Дня» есть', el.textContent.includes('Сигнал Дня'))
  check('без сигнала: разбора/кнопки нет',
    !el.querySelector('[data-test="signal-read"]') && !el.textContent.includes('разбор аналитика от'))
  check('без сигнала: заметка-пустышка дословно', el.textContent.includes('Разбор аналитика появится позже.'))
  check('без сигнала: «Как идёт день» всё равно есть', el.textContent.includes('Как идёт день'))
  app.unmount()
}

console.log('\n=== jsdom: полоса A — «Как идёт день» (bare-блок) ===')
{
  const { el, app } = mount(bundle.DailyDayProgress, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('заголовок «Как идёт день»', el.textContent.includes('Как идёт день'))
  check('4 строки на моке (16.05, пятница)', el.querySelectorAll('[data-test="day-line"]').length === 4,
    el.querySelectorAll('[data-test="day-line"]').length)
  check('Вчера, чт 15.05 … % плана дня',
    el.textContent.includes('Вчера, чт 15.05') && el.textContent.includes('плана дня'))
  check('Неделя: N-й день …', /Неделя: \d-й день, \d+% плана с начала недели\./.test(el.textContent))
  check('Месяц: … (goalState)', el.textContent.includes('Месяц:'))
  check('Сегодня пятница — K% недельного плана',
    el.textContent.includes('Сегодня пятница') && el.textContent.includes('% недельного плана'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}
{
  // фолбэк «вчера не внесён» (17.05: вчера 16.05 = partial)
  const { el, app } = mount(bundle.DailyDayProgress, { m: mOhta, now: new Date(2025, 4, 17, 12, 0, 0) })
  await nextTick()
  check('фолбэк «Вчера: отчёт ещё не внесён.»', el.textContent.includes('Вчера: отчёт ещё не внесён.'))
  app.unmount()
}
{
  // фолбэк «неделя началась» (05.05 понедельник: закрытых дней недели нет)
  const { el, app } = mount(bundle.DailyDayProgress, { m: mOhta, now: new Date(2025, 4, 5, 12, 0, 0) })
  await nextTick()
  check('фолбэк «Неделя началась: план — … ₽.»', /Неделя началась: план — .+₽\./.test(el.textContent))
  app.unmount()
}
{
  // out: строка месяца без вычисленного +N% (литеральное «100%» — часть фразы)
  const mOut = computeDaily(synthSet(310))
  check('синтетика: goalState out', mOut.goalState === 'out')
  const { el, app } = mount(bundle.DailyDayProgress, { m: mOut, now: new Date(2025, 5, 3, 12, 0, 0) })
  await nextTick()
  const monthLine = [...el.querySelectorAll('[data-test="day-line"]')].find((n) => n.textContent.includes('Месяц:'))
  check('out: строка месяца дословная, без вычисленного +N%',
    !!monthLine &&
    monthLine.textContent.includes('Месяц: фокус — минимум отставания; ближайшая цель — 100% плана недели.') &&
    !/\+\d+%/.test(monthLine.textContent))
  app.unmount()
}

console.log('\n=== jsdom: «Вся сеть» — сигнал внутри карточки парка (v3.1) ===')
{
  const netForUi = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
  const { el, app } = mount(bundle.DailyNetwork, { net: netForUi })
  await nextTick()
  check('отдельного блока «Сигналы дня» больше нет', !el.textContent.includes('Сигналы дня'))
  check('сигнал внутри карточки: headline Охты виден', el.textContent.includes('Темп восстановлен к выходным'))
  check('дата — бейджем «16.05» без «от»', el.textContent.includes('16.05') && !el.textContent.includes('от 16.05'))
  const plates = el.querySelectorAll('[data-test="net-signal"]')
  check('плашек = паркам с сигналом (2; Июнь без сигнала)', plates.length === 2, plates.length)
  const pc = bundle.useParkContext()
  await fire(plates[0], 'click')
  check('tap по плашке/карточке → переключение парк-контекста (ohta)', pc.current.value === 'ohta')
  pc.setPark('network')
  app.unmount()
}
{
  // сеть без сигналов → плашек нет
  const bare = JSON.parse(JSON.stringify(sets))
  for (const k of Object.keys(bare)) delete bare[k].signals
  const netBare = computeNetwork(bare, ['ohta', 'piterland', 'iyun'])
  const { el, app } = mount(bundle.DailyNetwork, { net: netBare })
  await nextTick()
  check('сеть без сигналов: плашек нет', el.querySelectorAll('[data-test="net-signal"]').length === 0)
  app.unmount()
}

// ═══════════════ Сводки сети (net_summary): чистая логика ═══════════════
console.log('\n=== Сводки сети: отбор записей и подписи периодов ===')
const NS = data.net_summary
check('мок содержит net_summary (day + week + month)',
  Array.isArray(NS) && NS.length === 3 && new Set(NS.map((x) => x.cadence)).size === 3,
  Array.isArray(NS) ? NS.map((x) => x.cadence).join(',') : 'нет')
check('sortSummaries отбрасывает битые записи и чужой каденс',
  sortSummaries([
    null, 'x', { cadence: 'day' }, { cadence: 'quarter', date: '2025-05-16' },
    { cadence: 'day', date: '16.05.2025' }, { cadence: 'day', date: '2025-05-16' },
  ]).length === 1)
check('актуальная запись каденса = max date ВНУТРИ каденса', (() => {
  const s = sortSummaries([
    { cadence: 'day', date: '2025-05-16', status: 'ok' },
    { cadence: 'day', date: '2025-05-14', status: 'warn' },
    { cadence: 'week', date: '2025-05-05', status: 'focus' },
  ])
  return latestOf(s, 'day').date === '2025-05-16' && latestOf(s, 'week').date === '2025-05-05'
})())
check('latestByCadence: порядок день → неделя → месяц',
  latestByCadence(NS).map((x) => x.cadence).join(',') === 'day,week,month',
  latestByCadence(NS).map((x) => x.cadence).join(','))
check('нет net_summary → карточек нет (обратная совместимость)',
  latestByCadence(undefined).length === 0 && latestByCadence([]).length === 0)
check('незнакомые ключи внутри записи не мешают отбору',
  latestByCadence([{ cadence: 'day', date: '2025-05-16', kind: 'x', extra: { a: 1 } }]).length === 1)

check('подпись дня = ДД.ММ', periodLabel('day', '2025-05-16') === '16.05', periodLabel('day', '2025-05-16'))
check('подпись недели = якорь…+6', periodLabel('week', '2025-05-12') === '12.05–18.05', periodLabel('week', '2025-05-12'))
check('неделя через границу месяца считается верно', periodLabel('week', '2025-06-29') === '29.06–05.07', periodLabel('week', '2025-06-29'))
check('неделя через границу года считается верно', periodLabel('week', '2025-12-29') === '29.12–04.01', periodLabel('week', '2025-12-29'))
check('addDays через високосный февраль', addDays('2024-02-28', 2) === '2024-03-01', addDays('2024-02-28', 2))
check('подпись месяца = русский месяц из массива (без Intl)', periodLabel('month', '2025-05-01') === 'Май 2025', periodLabel('month', '2025-05-01'))
check('заголовок карточки собран из cadence+date',
  cardTitle('week', '2025-05-12').replace(/ /g, ' ') === 'Сводка недели · 12.05–18.05',
  cardTitle('week', '2025-05-12'))

console.log('\n=== Сводки сети: метка блока (точка+пробел, кап) ===')
check('обычная метка', (() => { const r = splitBlock('Данные. За пятницу 16.05 сдали все.'); return r.label === 'Данные' && r.rest.startsWith('За пятницу') })())
check('точка ВНУТРИ даты метку не рвёт (боевой кейс месяца)', (() => {
  const r = splitBlock('Итог месяца (на 16.05). Сеть факт 3,84 млн.')
  return r.label === 'Итог месяца (на 16.05)' && r.rest === 'Сеть факт 3,84 млн.'
})(), splitBlock('Итог месяца (на 16.05). Сеть факт 3,84 млн.').label)
check(`метка длиннее ${LABEL_MAX} символов → не выделяем, абзац сплошной`, (() => {
  const long = 'Очень длинное вступление без короткой метки в самом начале блока. Дальше текст.'
  const r = splitBlock(long)
  return r.label === null && r.rest === long
})())
check('нет точки вовсе → абзац сплошной', splitBlock('Просто текст без точки').label === null)
check('пустой блок → пусто', splitBlock('').rest === '' && splitBlock(null).rest === '')
check('blocksOf: 3 блока, первый — head', (() => {
  const b = blocksOf(NS[0])
  return b.length === 3 && b[0].head === true && b[1].head === false
})())
check('blocksOf: пустой блок отброшен, рендер не падает',
  blocksOf({ block1: 'Данные. Есть.', block2: '', block3: null }).length === 1)
check('ключ прочитанности — «summary:{cadence}:{date}»',
  summaryKey('week', '2025-05-12') === 'summary:week:2025-05-12', summaryKey('week', '2025-05-12'))
check('статусы сводок не пересекаются с парковыми', (() => {
  const store = {}
  markSummaryState(store, 'day', '2025-05-16', 'viewed')
  markState(store, 'ohta', '2025-05-16', 'read')
  return summaryStatusOf(store, 'day', '2025-05-16') === 'viewed' &&
    statusOf(store, 'ohta', '2025-05-16') === 'read' &&
    Object.keys(store).length === 2
})())

console.log('\n=== jsdom: карточка сводки (три блока, блок 1 свёрнут) ===')
{
  localStorage.clear()
  const day = NS.find((x) => x.cadence === 'day')
  const { el, app } = mount(bundle.NetSummaryCard, { cadence: 'day', entry: day })
  await nextTick()
  check('заголовок «Сводка дня · 16.05»', el.textContent.replace(/ /g, ' ').includes('Сводка дня · 16.05'))
  check('точка статуса одна', el.querySelectorAll('[data-test="summary-dot"]').length === 1)
  check('бейдж «новое» в первый заход', !!el.querySelector('[data-test="summary-new"]'))
  check('видны блоки 2 и 3 (Оценка + Фокус)',
    el.textContent.includes('Оценка') && el.textContent.includes('Фокус на субботу'))
  check('это НЕ сигнал: ни headline/action, ни кнопки «Прочитала» (фаза 2)',
    !el.querySelector('[data-test="signal-read"]') && !el.textContent.includes('Прочитала'))
  const bodyBefore = el.querySelector('[data-test="summary-head-body"]')
  check('блок 1 свёрнут по умолчанию (тело скрыто)', !bodyBefore)
  const toggle = el.querySelector('[data-test="summary-head-toggle"]')
  check('свёрнутый блок подписан своей меткой «Данные»', !!toggle && toggle.textContent.includes('Данные'))
  await fire(toggle, 'click')
  check('тап раскрывает блок 1', el.textContent.includes('За пятницу 16.05 отчёты сдали все три парка'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()

  const re = mount(bundle.NetSummaryCard, { cadence: 'day', entry: day })
  await nextTick()
  check('бейдж «новое» снят в следующий заход', !re.el.querySelector('[data-test="summary-new"]'))
  re.app.unmount()
}
{
  // месячная карточка: метка с точкой внутри даты не рвётся при живом рендере
  localStorage.clear()
  const month = NS.find((x) => x.cadence === 'month')
  const { el, app } = mount(bundle.NetSummaryCard, { cadence: 'month', entry: month })
  await nextTick()
  check('заголовок месяца — русский месяц', el.textContent.replace(/ /g, ' ').includes('Сводка месяца · Май 2025'))
  const toggle = el.querySelector('[data-test="summary-head-toggle"]')
  check('метка свёрнутого блока = «Итог месяца (на 16.05)»', toggle.textContent.includes('Итог месяца (на 16.05)'))
  check('метка не обрезана по точке внутри даты', toggle.textContent.trim().startsWith('Итог месяца (на 16.05)'),
    toggle.textContent.trim())
  const bold = [...el.querySelectorAll('[data-test="summary-block"] b')].map((b) => b.textContent)
  check('жирные метки блоков 2/3 = «Траектория.» и «Вывод.»', bold.join('|') === 'Траектория.|Вывод.', bold.join('|'))
  app.unmount()
}
{
  // неизвестный статус и лишние ключи рендер не роняют
  localStorage.clear()
  const { el, app } = mount(bundle.NetSummaryCard, {
    cadence: 'week',
    entry: { cadence: 'week', date: '2025-05-12', status: 'wat', block1: 'Итог недели. Есть.', kind: 'x' },
  })
  await nextTick()
  check('неизвестный статус → нейтральная точка, рендер жив',
    el.querySelector('[data-test="summary-dot"]').getAttribute('style').includes('text-muted'))
  check('единственный блок = head, блоков 2/3 нет', el.querySelectorAll('[data-test="summary-block"]').length === 0)
  app.unmount()
}

console.log('\n=== jsdom: раздел «Сводки сети» и вход с Главной ===')
{
  localStorage.clear()
  getPayload = { updated: '2025-05-20', sets: {}, net_summary: NS }
  const { el, app } = mount(bundle.SummaryScreen, {})
  await flush()
  const cards = el.querySelectorAll('[data-test="summary-card"]')
  check('три карточки: день → неделя → месяц', cards.length === 3 &&
    [...cards].map((c) => c.getAttribute('data-cadence')).join(',') === 'day,week,month',
    [...cards].map((c) => c.getAttribute('data-cadence')).join(','))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}
{
  // обратная совместимость: payload без net_summary
  localStorage.clear()
  getPayload = { updated: '2025-05-20', sets: {} }
  const { el, app } = mount(bundle.SummaryScreen, {})
  await flush()
  check('нет net_summary → карточек нет, пустой стейт', el.querySelectorAll('[data-test="summary-card"]').length === 0 &&
    el.textContent.includes('Сводок пока нет'))
  app.unmount()
  getPayload = {}
}
{
  // вход в раздел — первая плитка на Главной
  localStorage.clear()
  const nav = bundle.useAppNav()
  bundle.clearSubView()
  const { el, app } = mount(bundle.HomeScreen, {})
  await flush()
  const tiles = [...el.querySelectorAll('.grid button')]
  check('плиток на Главной 4', tiles.length === 4, tiles.length)
  check('«Сводки» — первая плитка', tiles[0]?.getAttribute('data-test') === 'tile-summary' && tiles[0].textContent.includes('Сводки'))
  check('порядок остальных не тронут', tiles.slice(1).map((t) => t.textContent.trim()).join(',') === 'Аналитика,Проекты,Материалы',
    tiles.slice(1).map((t) => t.textContent.trim()).join(','))
  await fire(tiles[0], 'click')
  check('тап по плитке → под-страница «summary»', nav.subView.value === 'summary', nav.subView.value)
  bundle.clearSubView()
  app.unmount()
}

console.log('\n=== Главная: счётчики чекапов/сигналов (readCounters, v3.1) ===')
check('readCounters из stats → числа строками',
  (() => { const c = readCounters({ stats: { checkups: 137, signals: 42 } }); return c.checkups === '137' && c.signals === '42' })())
check('readCounters без stats → null (покажем «—»)',
  (() => { const c = readCounters({}); return c.checkups === null && c.signals === null })())
check('readCounters битые значения → null',
  (() => { const c = readCounters({ stats: { checkups: 'x', signals: null } }); return c.checkups === null && c.signals === null })())
check('мок содержит stats (чекапов ≥ сигналов)', !!data.stats && Number(data.stats.checkups) >= Number(data.stats.signals))

console.log('\n=== Vue warnings ===')
check('нет [Vue warn]', vueWarns.length === 0, vueWarns[0] || 'чисто')
console.warn = origWarn
rmSync(tmp, { recursive: true, force: true })

console.log('\n=== Итог ===')
console.log(ok ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(ok ? 0 : 1)
