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

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { computeDaily, computeNetwork, sigClass } from '../src/composables/dailyModel.js'
import { monthLayout, markStyle } from '../src/composables/monthLayout.js'
import { actCode } from '../src/i18n/daily.js'
import {
  sortSignals, latestSignal, feedSignals, statusOf, markState, stateKey,
  buildSignalReadBody, postSignalRead,
} from '../src/composables/dailySignals.js'
import { readCounters, plural, checkupsWord, signalsWord, reviewsWord } from '../src/i18n/home.js'
// ВНИМАНИЕ: useConnectRequest.js импортирует vue — статически его сюда тянуть НЕЛЬЗЯ.
// runtime-dom кэширует `document` в момент загрузки, а jsdom-глобали ставятся ниже:
// ранний импорт vue = `document === null` и падение на первом же mount().
// Поэтому его хелперы приезжают через тестовый бандл (bundle.buildConnectBody и т.д.).
// businesses.js — чистые данные без vue, его импортировать статически безопасно.
import { BUSINESSES, ACTIVE_BUSINESS } from '../src/data/businesses.js'
import { sortReviews, reviewCount } from '../src/composables/reviews.js'
import {
  sortSummaries, latestByCadence, latestOf, splitBlock, blocksOf,
  summaryKey, summaryStatusOf, markSummaryState, LABEL_MAX,
  asofOf, feedOf, feedByCadence, entryKey, summaryInk, monthsOf, monthKeyOf, weekIndexOf,
  splitSentences, focusBlocks, TOTAL_RE, splitSubItems, renderBlocks, SUBLABEL_MAX,
} from '../src/composables/netSummary.js'
import { cardTitle, periodLabel, addDays, monthLabel, dowTitle, asofLabel, CADENCE_SEG, L as LSUM } from '../src/i18n/summary.js'

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

  // тело signal_read по контракту §2 + v3.2 (score из модалки оценки)
  const body = buildSignalReadBody('phrase-x', 'ohta', '2025-05-16', 7)
  check('тело signal_read: key/type/park/signal_date/score по контракту',
    body.key === 'phrase-x' && body.type === 'signal_read' && body.park === 'ohta' &&
    body.signal_date === '2025-05-16' && body.score === 7)
  check('в теле ровно 5 ключей (без лишнего)', Object.keys(body).sort().join(',') === 'key,park,score,signal_date,type')
  // обратная совместимость: без score / с мусорным score поле опускается
  check('без score → ровно 4 ключа (обратная совместимость)',
    Object.keys(buildSignalReadBody('k', 'ohta', '2025-05-16')).sort().join(',') === 'key,park,signal_date,type')
  check('мусорный score (11 / -1 / 3.5 / "x") опускается',
    buildSignalReadBody('k', 'ohta', 'd', 11).score === undefined &&
    buildSignalReadBody('k', 'ohta', 'd', -1).score === undefined &&
    buildSignalReadBody('k', 'ohta', 'd', 3.5).score === undefined &&
    buildSignalReadBody('k', 'ohta', 'd', 'x').score === undefined)
  check('границы шкалы валидны: 0 и 10 уходят',
    buildSignalReadBody('k', 'ohta', 'd', 0).score === 0 &&
    buildSignalReadBody('k', 'ohta', 'd', 10).score === 10)

  // postSignalRead с мокнутым fetch (реального URL нет)
  let cap = null
  const okres = await postSignalRead({
    api: 'https://mock.invalid/report', key: 'phrase-x', park: 'ohta', signalDate: '2025-05-16', score: 7,
    fetchImpl: async (url, opts) => { cap = { url, opts }; return { ok: true, status: 200, json: async () => ({ ok: true }) } },
  })
  check('postSignalRead: {ok:true} → true', okres === true)
  check('postSignalRead: redirect follow + тело по контракту (со score)',
    cap.opts.redirect === 'follow' &&
    JSON.parse(cap.opts.body).type === 'signal_read' &&
    JSON.parse(cap.opts.body).signal_date === '2025-05-16' &&
    JSON.parse(cap.opts.body).score === 7)
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
export { default as NavigationBar } from '${root}/src/components/NavigationBar.vue'
export { default as BusinessChip } from '${root}/src/components/business/BusinessChip.vue'
export { default as AccessKeyForm } from '${root}/src/components/AccessKeyForm.vue'
export { default as ConnectBusinessModal } from '${root}/src/components/business/ConnectBusinessModal.vue'
export { default as HomeScreen } from '${root}/src/screens/HomeScreen.vue'
export { default as MonthProgressCard } from '${root}/src/components/home/MonthProgressCard.vue'
export { default as MonthProgressSlide } from '${root}/src/components/home/MonthProgressSlide.vue'
export { default as ReviewsScreen } from '${root}/src/screens/ReviewsScreen.vue'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
export { buildConnectBody, normalizeBusinessName, BUSINESS_NAME_MAX } from '${root}/src/composables/useConnectRequest.js'
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
  // 28.07: текст кнопки — «Прочитано» в обоих состояниях; активную от нажатой
  // отличаем по disabled и галке «✓».
  check('кнопка «Прочитано» активна (без «✓»)',
    !!btn && btn.disabled === false && el.textContent.includes('Прочитано') && !el.textContent.includes('Прочитано ✓'))
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
// v3.2: модалка оценки телепортируется в body — ищем её по document, не по el.
const rateSheet = () => document.querySelector('[data-test="signal-rate-sheet"]')
{
  // «Прочитано» → модалка оценки; отправка → POST со score → «Прочитано ✓»
  localStorage.clear()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('до клика модалки нет', !rateSheet())
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  check('клик по кнопке → модалка открыта, POST ещё не ушёл',
    !!rateSheet() && postedBodies.length === 0)
  check('вопрос модалки дословно (28.07: без «?», сигнала со строчной)',
    rateSheet().textContent.includes('Оцените пользу сигнала') && !rateSheet().textContent.includes('Сигнала?'))
  const slider = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  check('ползунок 0–10 шаг 1, старт с середины (5)',
    !!slider && slider.min === '0' && slider.max === '10' && slider.step === '1' && slider.value === '5')
  slider.value = '8'
  await fire(slider, 'input')
  check('значение видно крупно', rateSheet().textContent.includes('8'))
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await new Promise((r) => setTimeout(r, 20)); await nextTick()
  check('POST ушёл ровно один', postedBodies.length === 1)
  const body = JSON.parse(postedBodies[0] || '{}')
  check('тело signal_read по контракту §2 + score из ползунка',
    body.key === 'test-phrase' && body.type === 'signal_read' && body.park === 'ohta' &&
    body.signal_date === '2025-05-16' && body.score === 8)
  check('после успеха: модалка закрыта, «Прочитано ✓», кнопка неактивна',
    !rateSheet() && el.textContent.includes('Прочитано ✓') &&
    el.querySelector('[data-test="signal-read"]').disabled === true)
  app.unmount()
  const re = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('прочитано и при следующих заходах', re.el.textContent.includes('Прочитано ✓'))
  re.app.unmount()
}
{
  // закрытие модалки без отправки = отмена: POST нет, кнопка активна
  localStorage.clear()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  check('модалка открыта', !!rateSheet())
  await fire(rateSheet().querySelector('[aria-label="Закрыть"]'), 'click')
  await new Promise((r) => setTimeout(r, 20)); await nextTick()
  check('закрытие крестом: POST не ушёл, прочтение не зафиксировано',
    !rateSheet() && postedBodies.length === 0 &&
    el.querySelector('[data-test="signal-read"]').disabled === false &&
    el.textContent.includes('Прочитано') && !el.textContent.includes('Прочитано ✓'))
  app.unmount()
}
{
  // ошибка бэка → красная плашка, кнопка остаётся активной
  localStorage.clear()
  postMode = 'reject'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await new Promise((r) => setTimeout(r, 20)); await nextTick()
  check('красная плашка дословно', el.textContent.includes('Не удалось отметить. Проверьте связь и попробуйте ещё раз.'))
  check('кнопка осталась активной (повтор разрешён), модалка закрыта',
    !rateSheet() && el.querySelector('[data-test="signal-read"]').disabled === false &&
    el.textContent.includes('Прочитано') && !el.textContent.includes('Прочитано ✓'))
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
const nsDays = NS.filter((x) => x.cadence === 'day')
check('мок содержит net_summary (day + week + month)',
  Array.isArray(NS) && new Set(NS.map((x) => x.cadence)).size === 3,
  Array.isArray(NS) ? NS.map((x) => x.cadence).join(',') : 'нет')
check('мок: дневных строк ≥ 4 (ленту есть чем проверить)', nsDays.length >= 4, nsDays.length)
check('мок: две дневные строки за ОДНУ дату (тай-брейк проверяем)', (() => {
  const byDate = {}
  for (const d of nsDays) byDate[d.date] = (byDate[d.date] || 0) + 1
  return Object.values(byDate).some((n) => n >= 2)
})(), nsDays.map((d) => d.date).join(','))
check('мок: data_asof заполнен во ВСЕХ записях', NS.every((x) => asofOf(x) !== ''),
  NS.filter((x) => asofOf(x) === '').length + ' без среза')
check('мок: устаревшая дозаливка лежит ПОЗЖЕ актуальной в payload (наивный отбор бы её и взял)', (() => {
  const i = NS.findIndex((x) => x.cadence === 'day' && x.date === '2025-05-16' && asofOf(x) === '2025-05-17 12:28')
  const j = NS.findIndex((x) => x.cadence === 'day' && x.date === '2025-05-16' && asofOf(x) === '2025-05-16 21:40')
  return i >= 0 && j >= 0 && j > i
})())
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

console.log('\n=== Сводки сети: тай-брейк по data_asof (v2 §4) ===')
check('asofOf: нормальный срез', asofOf({ data_asof: '2026-07-25 12:28' }) === '2026-07-25 12:28')
check('asofOf: голая дата допустима', asofOf({ data_asof: '2026-07-25' }) === '2026-07-25')
check('asofOf: разделитель T нормализуется в пробел', asofOf({ data_asof: '2026-07-25T12:28' }) === '2026-07-25 12:28')
check('asofOf: битое/пустое/нет поля → «»',
  asofOf({ data_asof: '25.07.2026' }) === '' && asofOf({}) === '' && asofOf(null) === '' &&
  asofOf({ data_asof: 42 }) === '')
check('равные date → актуальная та, у кого max(data_asof) (порядок payload обратный)', (() => {
  const s = sortSummaries([
    { cadence: 'day', date: '2026-07-24', data_asof: '2026-07-25 12:28', block1: 'Данные. Свежая.' },
    { cadence: 'day', date: '2026-07-24', data_asof: '2026-07-24 21:40', block1: 'Данные. Устаревшая.' },
  ])
  return latestOf(s, 'day').data_asof === '2026-07-25 12:28'
})())
check('max(date) главнее max(data_asof) (свежий срез у старой даты не перебивает)', (() => {
  const s = sortSummaries([
    { cadence: 'day', date: '2026-07-24', data_asof: '2026-07-25 12:28' },
    { cadence: 'day', date: '2026-07-23', data_asof: '2026-07-26 09:00' },
  ])
  return latestOf(s, 'day').date === '2026-07-24'
})())
check('обратная совместимость: без data_asof отбор падает на max(date)', (() => {
  const s = sortSummaries([
    { cadence: 'day', date: '2026-07-22' },
    { cadence: 'day', date: '2026-07-24' },
    { cadence: 'day', date: '2026-07-23' },
  ])
  return latestOf(s, 'day').date === '2026-07-24' && s.every((x) => asofOf(x) === '')
})())
check('смесь: запись БЕЗ среза считается старше записи со срезом при равной дате', (() => {
  const s = sortSummaries([
    { cadence: 'day', date: '2026-07-24', data_asof: '2026-07-25 12:28' },
    { cadence: 'day', date: '2026-07-24' },
  ])
  return latestOf(s, 'day').data_asof === '2026-07-25 12:28'
})())
check('мок: актуальная дневная = 16.05 со срезом 17.05 12:28 (устаревшая дозаливка отсеяна)', (() => {
  const cur = latestOf(sortSummaries(NS), 'day')
  return cur.date === '2025-05-16' && asofOf(cur) === '2025-05-17 12:28' && cur.status === 'warn'
})(), asofOf(latestOf(sortSummaries(NS), 'day')))

console.log('\n=== Сводки сети: лента каденса (v2 §3.2) ===')
{
  const MAY = '2025-05'
  const sorted = sortSummaries(NS).filter((x) => monthKeyOf(x) === MAY)
  const feedDay = feedOf(sorted, 'day')
  check('лента дней: новое сверху', feedDay[0].date === '2025-05-16' &&
    feedDay[feedDay.length - 1].date === '2025-05-13',
    feedDay.map((x) => x.date).join(' > '))
  check('лента дней: даты не возрастают сверху вниз',
    feedDay.every((x, i) => i === 0 || String(feedDay[i - 1].date) >= String(x.date)))
  check('лента дней: обе записи 16.05 в ленте, свежая первая',
    feedDay[0].date === '2025-05-16' && feedDay[1].date === '2025-05-16' &&
    asofOf(feedDay[0]) > asofOf(feedDay[1]))
  check('первая запись ленты = latestOf (актуальная раскрывается)',
    feedDay[0] === latestOf(sorted, 'day'))
  const feeds = feedByCadence(NS, MAY)
  check('feedByCadence отдаёт все три каденса',
    Object.keys(feeds).join(',') === 'day,week,month', Object.keys(feeds).join(','))
  check('feedByCadence(май): длины лент (день 5, неделя 3, месяц 1)',
    feeds.day.length === 5 && feeds.week.length === 3 && feeds.month.length === 1,
    `${feeds.day.length}/${feeds.week.length}/${feeds.month.length}`)
  check('пустой каденс присутствует пустым массивом (сегмент показываем всегда)', (() => {
    const f = feedByCadence([{ cadence: 'week', date: '2026-07-13', block1: 'Итог недели. Есть.' }], '2026-07')
    return f.day.length === 0 && f.week.length === 1 && f.month.length === 0
  })())
  check('нет net_summary → все ленты пусты, ошибок нет', (() => {
    const f = feedByCadence(undefined)
    return f.day.length === 0 && f.week.length === 0 && f.month.length === 0
  })())
  check('entryKey различает две записи одной даты',
    entryKey('day', feedDay[0], 0) !== entryKey('day', feedDay[1], 1),
    `${entryKey('day', feedDay[0], 0)} | ${entryKey('day', feedDay[1], 1)}`)
  check('entryKey без data_asof не ломается',
    entryKey('day', { date: '2026-07-24' }, 0) === 'day:2026-07-24#0',
    entryKey('day', { date: '2026-07-24' }, 0))
  check('период дня = ДД.ММ', periodLabel('day', feedDay[0].date) === '16.05', periodLabel('day', feedDay[0].date))
  check('период месяца — русский месяц', periodLabel('month', feeds.month[0].date) === 'Май\u00a02025')
  check('заголовок карточки БЕЗ периода и без разделителя «·»',
    cardTitle('week') === 'Сводка недели' && !cardTitle('week').includes('·'), cardTitle('week'))
  check('ink бейджа: тёмный на светлой заливке, белый на насыщенной',
    summaryInk('warn') === 'var(--accent-ink)' && summaryInk('ok') === 'var(--accent-ink)' &&
    summaryInk('focus') === 'var(--ink-on-color)' && summaryInk('wat') === 'var(--ink-on-color)')
}

console.log('\n=== Сводки сети: под-метки внутри блока (v2.6, рендер-задание §3.1) ===')
{
  const rest = 'Главное: неделя 88% плана → прогноз 9,90 млн ₽ (+14%). Факт недели: сеть 2 000 000 ₽ при плане 2 272 727 = 88%. Парк А 900 000 = 85%, Парк Б 1 100 000 = 91%. Работа системы: 7 чекапов, 12 сигналов, 9 «Прочитал» = 75%. Честно: процент держится на одном выбросе.'
  const items = splitSubItems(rest)
  check('под-метки найдены все четыре',
    items.map((x) => x.label).join(' | ') === 'Главное | Факт недели | Работа системы | Честно',
    items.map((x) => x.label).join(' | '))
  check('текст под-пункта не режется по внутренним точкам',
    items[1].text === 'сеть 2 000 000 ₽ при плане 2 272 727 = 88%. Парк А 900 000 = 85%, Парк Б 1 100 000 = 91%.',
    items[1].text)
  check('последний под-пункт добирает хвост до конца', items[3].text.endsWith('на одном выбросе.'))
}
check('под-метка только одна → сплошной абзац (обратная совместимость)',
  splitSubItems('Главное: неделя 88% плана. Дальше просто текст без меток.').length === 0)
check('под-меток нет вовсе → сплошной абзац',
  splitSubItems('За воскресенье отчёты сдали все парки, долгов по дням нет.').length === 0)
check('двоеточие В СЕРЕДИНЕ предложения под-меткой не становится', (() => {
  const it = splitSubItems('Что дальше: ориентир: превзойти лучший день. Резерв: будни вторника.')
  return it.length === 2 && it[0].label === 'Что дальше' &&
    it[0].text === 'ориентир: превзойти лучший день.'
})(), splitSubItems('Что дальше: ориентир: превзойти лучший день. Резерв: будни вторника.').map((x) => x.label).join('|'))
check(`под-метка длиннее ${SUBLABEL_MAX} символов жирной не делается`, (() => {
  const long = 'Очень длинная под-метка которая заведомо не влезает в кап: текст. Резерв: будни.'
  const it = splitSubItems(long)
  return it.length === 0 || it.every((x) => !x.label || x.label.length <= SUBLABEL_MAX)
})())
check('интро перед первой под-меткой идёт отдельной строкой без жирного', (() => {
  const it = splitSubItems('Небольшое вступление до меток. Главное: раз. Ещё: два.')
  return it.length === 3 && it[0].label === null && it[0].text === 'Небольшое вступление до меток.'
})())
check('скобки, →, — и «ёлочки» рендер не роняют', (() => {
  const it = splitSubItems('Главное: рост (в деньгах) 13,4 → 14,5 млн — это +8%. Честно: «на грани».')
  return it.length === 2 && it[0].text.includes('→') && it[1].text.includes('«на грани»')
})())
check('битый вход → пусто, не падаем',
  splitSubItems(null).length === 0 && splitSubItems('').length === 0 && splitSubItems(42).length === 0)
check('lookbehind в исходнике не используется (Safari < 16.4 уронил бы бандл)',
  !readFileSync(resolve(root, 'src/composables/netSummary.js'), 'utf8').includes('(?<='))

console.log('\n=== Сводки сети: сборка абзацев карточки (renderBlocks) ===')
{
  const wk = NS.find((x) => x.cadence === 'week' && x.date === '2025-03-31')
  const parts = renderBlocks(wk)
  check('метка блока уходит своей строкой над под-пунктами',
    parts[0].label === 'Итог недели' && parts[0].sep === '.' && parts[0].rest === '', parts[0].label)
  check('под-пункты помечены kind=sub и двоеточием',
    parts[1].kind === 'sub' && parts[1].sep === ':' && parts[1].label === 'Главное',
    `${parts[1].kind}/${parts[1].sep}/${parts[1].label}`)
  check('все три блока недели разложены по под-меткам',
    parts.filter((x) => x.kind === 'sub').length === 9, parts.filter((x) => x.kind === 'sub').length)
  check('под-метки блока 3 не перебиты разбивкой «Фокуса»',
    parts.filter((x) => x.kind === 'final').length === 0)
}
{
  const mo = NS.find((x) => x.cadence === 'month' && x.date === '2025-04-01')
  const parts = renderBlocks(mo)
  check('месяц: метка со скобками и точкой внутри собирается верно',
    parts[0].label === 'Итог месяца (на 26.04)', parts[0].label)
  check('месяц: имена парков стали под-метками',
    parts.filter((x) => /^Парк [АБВ]$/.test(x.label || '')).length === 3,
    parts.filter((x) => x.kind === 'sub').map((x) => x.label).join('|'))
  check('месяц: длинный блок даёт 8+ строк (кейс §5.5)',
    parts.filter((x) => x.kind === 'sub').length >= 8, parts.filter((x) => x.kind === 'sub').length)
}
check('день без под-меток рендерится как раньше', (() => {
  const parts = renderBlocks(latestOf(sortSummaries(NS), 'day'))
  return parts.every((x) => x.kind !== 'sub') && parts.some((x) => x.kind === 'total')
})())
check('битая запись → пусто, не падаем', renderBlocks(null).length === 0 && renderBlocks({}).length === 0)

console.log('\n=== Сводки сети: месяц записи и список месяцев (v2.2) ===')
check('месяц дня и месячной сводки — по своей дате',
  monthKeyOf({ cadence: 'day', date: '2025-05-16' }) === '2025-05' &&
  monthKeyOf({ cadence: 'month', date: '2025-04-01' }) === '2025-04')
check('месяц недели — по ЧЕТВЕРГУ (якорь+3), а не по понедельнику', (() => {
  // 31.03 (пн) → чт 03.04 → апрель; 28.04 (пн) → чт 01.05 → май
  return monthKeyOf({ cadence: 'week', date: '2025-03-31' }) === '2025-04' &&
    monthKeyOf({ cadence: 'week', date: '2025-04-28' }) === '2025-05'
})(), [monthKeyOf({ cadence: 'week', date: '2025-03-31' }), monthKeyOf({ cadence: 'week', date: '2025-04-28' })].join(' / '))
check('правило четверга = «большинство дней недели» (боевой кейс 29.06–05.07 → июль)',
  monthKeyOf({ cadence: 'week', date: '2026-06-29' }) === '2026-07',
  monthKeyOf({ cadence: 'week', date: '2026-06-29' }))
check('битая запись → пустой ключ, не падаем',
  monthKeyOf(null) === '' && monthKeyOf({ cadence: 'day', date: '16.05.2025' }) === '')
check('monthsOf: месяцы с ЛЮБОЙ записью, новые сверху',
  monthsOf(NS).join(',') === '2025-05,2025-04', monthsOf(NS).join(','))
check('monthsOf: месяц попадает в список и по одной недельной записи',
  monthsOf([{ cadence: 'week', date: '2025-03-31', block1: 'Итог недели. Есть.' }]).join(',') === '2025-04')
check('monthsOf без данных → пустой список',
  monthsOf(undefined).length === 0 && monthsOf([]).length === 0)
check('monthLabel = русский месяц + год', monthLabel('2025-04') === 'Апрель\u00A02025', monthLabel('2025-04'))
check('фильтр месяца делит ленты без потерь', (() => {
  const may = feedByCadence(NS, '2025-05')
  const apr = feedByCadence(NS, '2025-04')
  const n = (f) => f.day.length + f.week.length + f.month.length
  return n(may) + n(apr) === sortSummaries(NS).length
})(), `${sortSummaries(NS).length} записей`)

console.log('\n=== Сводки сети: номер недели внутри месяца (v2.3) ===')
check('нумерация как в «Контроле Дня»: первая неделя — та, с которой месяц начался', (() => {
  // май-2025: 1-е — четверг, первый понедельник 05.05
  return weekIndexOf({ cadence: 'week', date: '2025-04-28' }) === 1 && // якорь в апреле → неделя 1 мая
    weekIndexOf({ cadence: 'week', date: '2025-05-05' }) === 2 &&
    weekIndexOf({ cadence: 'week', date: '2025-05-12' }) === 3
})(), [ '2025-04-28', '2025-05-05', '2025-05-12' ].map((d) => weekIndexOf({ cadence: 'week', date: d })).join(','))
check('боевой июль-2026 (месяц начался в среду): 29.06 → 1, 06.07 → 2, 13.07 → 3, 20.07 → 4',
  ['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']
    .map((d) => weekIndexOf({ cadence: 'week', date: d })).join(',') === '1,2,3,4',
  ['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']
    .map((d) => weekIndexOf({ cadence: 'week', date: d })).join(','))
check('месяц начинается в понедельник → первая неделя без сдвига', (() => {
  // 01.12.2025 — понедельник
  return weekIndexOf({ cadence: 'week', date: '2025-12-01' }) === 1 &&
    weekIndexOf({ cadence: 'week', date: '2025-12-08' }) === 2
})())
check('номер только у недель; день/месяц/битое → null',
  weekIndexOf({ cadence: 'day', date: '2025-05-16' }) === null &&
  weekIndexOf({ cadence: 'month', date: '2025-05-01' }) === null &&
  weekIndexOf(null) === null && weekIndexOf({ cadence: 'week', date: '12.05.2025' }) === null)
check('заголовок недели = «Неделя N»',
  cardTitle('week', { weekIdx: 3 }) === 'Неделя 3', cardTitle('week', { weekIdx: 3 }))
check('номера нет (битая запись) → падаем на «Сводка недели»',
  cardTitle('week', {}) === 'Сводка недели')
check('заголовок дня = реальный день недели (v2.5)',
  cardTitle('day', { date: '2026-07-24' }) === 'Пятница', cardTitle('day', { date: '2026-07-24' }))
check('дни недели за июль 2026 считаются верно',
  ['2026-07-20', '2026-07-23', '2026-07-25', '2026-07-26'].map((d) => dowTitle(d)).join(',')
    === 'Понедельник,Четверг,Суббота,Воскресенье',
  ['2026-07-20', '2026-07-23', '2026-07-25', '2026-07-26'].map((d) => dowTitle(d)).join(','))
check('битая дата дня → падаем на «Сводка дня»',
  cardTitle('day', { date: '24.07.2026' }) === 'Сводка дня' && dowTitle('') === '')
check('заголовок месяца не тронут', cardTitle('month') === 'Сводка месяца')
check('подпись среза = «данные на ДД.ММ», без времени',
  asofLabel('2026-07-25 12:28') === 'данные на 25.07', asofLabel('2026-07-25 12:28'))
check('среза нет → подписи нет', asofLabel('') === '' && asofLabel(null) === '')

console.log('\n=== Сводки сети: разбивка последнего блока на абзацы (v2.5) ===')
check('предложения режутся по «точка+пробел», числа и «(на 23.07)» не рвутся',
  splitSentences('Итог месяца (на 23.07). Сеть факт 3,84 млн / план 6,85 = 56%. Разрыв −0,94 млн.').length === 3,
  splitSentences('Итог месяца (на 23.07). Сеть факт 3,84 млн / план 6,85 = 56%. Разрыв −0,94 млн.').length)
check('хвост без букв (эмодзи) приклеивается к предыдущему предложению',
  splitSentences('Усилить смену. 🚀').length === 1, splitSentences('Усилить смену. 🚀').join(' | '))
check('пустой текст → нет предложений', splitSentences('').length === 0 && splitSentences(null).length === 0)
check('TOTAL_RE ловит боевую формулировку сетевого итога',
  TOTAL_RE.test('Сегодня по сети надо сделать 1,01 млн ₽: Охта Молл 380 тыс.') &&
  TOTAL_RE.test('Сеть суммарно на сегодня: 1,01 млн ₽.') &&
  !TOTAL_RE.test('Ставим полный состав и активную кассу.'))
{
  const day = {
    cadence: 'day', date: '2026-07-24',
    block1: 'Данные. Сдали все три парка.',
    block2: 'Оценка. По сети 93,6%.',
    block3: 'Фокус на сегодня, субботу. Сегодня по сети надо сделать 1,01 млн ₽: Охта Молл 380 тыс, Питерленд 495 тыс, ТЦ Июнь 138 тыс. Для Охта Молл это выше их лучшей субботы (205 тыс). Ставим полный состав — отыгрываем по максимуму.',
  }
  const parts = focusBlocks(day)
  check('блоки 1 и 2 не делятся', parts[0].rest.startsWith('Сдали') && parts[1].rest.startsWith('По сети'))
  check('метка «Фокус…» вынесена своей строкой над итогом',
    parts[2].label === 'Фокус на сегодня, субботу' && parts[2].rest === '', parts[2].label)
  check('сетевой итог — ОТДЕЛЬНАЯ строка, без прилипшего продолжения',
    parts[3].kind === 'total' && parts[3].rest.endsWith('ТЦ Июнь 138 тыс.'), parts[3].rest)
  check('пояснение после итога — свой абзац',
    parts[4].kind === 'text' && parts[4].rest.startsWith('Для Охта Молл'), parts[4].rest)
  check('финальная директива — отдельным абзацем и последней',
    parts[5].kind === 'final' && parts[5].rest.startsWith('Ставим полный состав') && parts.length === 6,
    parts.length)
  check('порядок предложений не переставлен',
    parts.slice(2).map((x) => x.rest).join(' ').replace(/\s+/g, ' ').trim() ===
      day.block3.slice('Фокус на сегодня, субботу. '.length))
}
check('«Вывод» из двух предложений: директива уходит вниз, итога нет', (() => {
  const p = focusBlocks({ cadence: 'week', date: '2026-07-13', block1: 'Итог недели. Есть.',
    block3: 'Вывод. Неделю завалили выходные. Резерв месяца — Сб/Вс.' })
  return p.length === 3 && p[1].label === 'Вывод' && p[1].kind === 'text' &&
    p[2].kind === 'final' && p[2].rest === 'Резерв месяца — Сб/Вс.'
})())
check('одно предложение в блоке → делить нечего, блок как был', (() => {
  const p = focusBlocks({ cadence: 'week', date: '2026-07-13', block1: 'Итог недели. Есть.' })
  return p.length === 1 && p[0].rest === 'Есть.'
})())
check('битая запись → пусто, не падаем', focusBlocks(null).length === 0 && focusBlocks({}).length === 0)

console.log('\n=== Сводки сети: подписи сегментов ===')
check('подписи сегментов = Дни / Недели / Месяц (месяц в единственном числе)',
  CADENCE_SEG.day === 'Дни' && CADENCE_SEG.week === 'Недели' && CADENCE_SEG.month === 'Месяц',
  [CADENCE_SEG.day, CADENCE_SEG.week, CADENCE_SEG.month].join(' · '))
check('строки «новое» в словаре раздела больше нет', !('new' in LSUM), Object.keys(LSUM).join(','))

check('подпись дня = ДД.ММ', periodLabel('day', '2025-05-16') === '16.05', periodLabel('day', '2025-05-16'))
check('подпись недели = якорь…+6', periodLabel('week', '2025-05-12') === '12.05–18.05', periodLabel('week', '2025-05-12'))
check('неделя через границу месяца считается верно', periodLabel('week', '2025-06-29') === '29.06–05.07', periodLabel('week', '2025-06-29'))
check('неделя через границу года считается верно', periodLabel('week', '2025-12-29') === '29.12–04.01', periodLabel('week', '2025-12-29'))
check('addDays через високосный февраль', addDays('2024-02-28', 2) === '2024-03-01', addDays('2024-02-28', 2))
check('подпись месяца = русский месяц + неразрывный пробел (без Intl)',
  periodLabel('month', '2025-05-01') === 'Май\u00A02025', JSON.stringify(periodLabel('month', '2025-05-01')))
check('заголовок карточки — только каденс, период вынесен в бейдж',
  cardTitle('week') === 'Сводка недели' && !cardTitle('week').includes('·'), cardTitle('week'))

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
const nsDayLatest = latestOf(sortSummaries(NS), 'day')
const nsFeedDay = feedOf(sortSummaries(NS), 'day')
{
  localStorage.clear()
  const day = nsDayLatest
  const { el, app } = mount(bundle.NetSummaryCard, { cadence: 'day', entry: day })
  await nextTick()
  check('заголовок дня — день недели «Пятница» (16.05.2025 — пятница), без «·»',
    el.textContent.includes('Пятница') && !el.textContent.includes('Сводка дня') &&
    !el.textContent.includes('·'),
    el.querySelector('[data-test="summary-row"]').textContent.replace(/\s+/g, ' ').trim())
  check('в шапке сперва название, потом бейдж периода', (() => {
    const row = el.querySelector('[data-test="summary-row"]')
    const b = el.querySelector('[data-test="summary-badge"]')
    return row.firstElementChild !== b && !!(row.firstElementChild.compareDocumentPosition(b) & 4)
  })())
  check('период — бейдж «16.05», ровно один',
    el.querySelectorAll('[data-test="summary-badge"]').length === 1 &&
    el.querySelector('[data-test="summary-badge"]').textContent.trim() === '16.05',
    el.querySelector('[data-test="summary-badge"]')?.textContent.trim())
  check('заливка бейджа = статус, текст на нём монохромный (ink)', (() => {
    const st = el.querySelector('[data-test="summary-badge"]').getAttribute('style')
    return st.includes('var(--warning)') && st.includes('var(--accent-ink)')
  })(), el.querySelector('[data-test="summary-badge"]').getAttribute('style'))
  check('отдельной цветной точки больше нет', !el.querySelector('[data-test="summary-dot"]'))
  check('обводок в карточке нет', !el.innerHTML.includes('border-[var(--line)]'))
  check('бейджа «новое» нет (ТЗ v2 §3.3)',
    !el.querySelector('[data-test="summary-new"]') && !el.textContent.includes('новое'))
  check('срез формы показан строкой «данные на 17.05» (v2.5)',
    el.querySelector('[data-test="summary-asof"]')?.textContent.trim() === 'данные на 17.05',
    el.querySelector('[data-test="summary-asof"]')?.textContent.trim())
  check('время среза НЕ выводим, только дата',
    !el.textContent.includes('12:28') && !el.textContent.includes('2025-05-17'))
  check('второй даты В ШАПКЕ нет — период только в бейдже',
    (el.querySelector('[data-test="summary-row"]').textContent.match(/16\.05/g) || []).length === 1)
  check('одиночная карточка не сворачивается: стрелки нет, шапка не кнопка',
    el.querySelector('[data-test="summary-row"]').tagName === 'DIV' &&
    !el.querySelector('[data-test="summary-row"] svg'))
  check('видны блоки 2 и 3 (Оценка + Фокус)',
    el.textContent.includes('Оценка') && el.textContent.includes('Фокус на субботу'))
  check('это НЕ сигнал: ни headline/action, ни кнопки «Прочитано» (фаза 2)',
    !el.querySelector('[data-test="signal-read"]') && !el.textContent.includes('Прочитано'))
  check('блоки видны сразу, своей свёртки у них нет',
    el.querySelectorAll('[data-test="summary-block"]').length >= 3 &&
    !el.querySelector('[data-test="summary-head-toggle"]') &&
    !el.querySelector('[data-test="summary-head-body"]'),
    el.querySelectorAll('[data-test="summary-block"]').length)
  check('блок 1 («Данные») развёрнут вместе с остальными',
    el.textContent.includes('За пятницу 16.05 отчёты сдали все три парка'))
  check('порядок блоков — 1 → 2 → 3 (метки на месте)',
    [...el.querySelectorAll('[data-test="summary-block"] b')].map((b) => b.textContent).join('|')
      === 'Данные.|Оценка.|Фокус на субботу.',
    [...el.querySelectorAll('[data-test="summary-block"] b')].map((b) => b.textContent).join('|'))
  check('сетевой итог — отдельная строка, финал — отдельный абзац',
    el.querySelector('[data-test="summary-block"][data-kind="total"]')?.textContent.includes('412 тыс') &&
    el.querySelector('[data-test="summary-block"][data-kind="final"]')?.textContent.includes('усилить вечернюю смену'),
    [...el.querySelectorAll('[data-test="summary-block"]')].map((b) => b.getAttribute('data-kind')).join(','))
  check('итог набран монохромно, цвета в тексте нет',
    el.querySelector('[data-test="summary-block"][data-kind="total"]').className.includes('text-[var(--text)]'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()

  const re = mount(bundle.NetSummaryCard, { cadence: 'day', entry: day })
  await nextTick()
  check('бейджа «новое» нет и в следующий заход (логика снимка снята)',
    !re.el.querySelector('[data-test="summary-new"]') && !re.el.textContent.includes('новое'))
  check('на монтировании карточка больше ничего не пишет в прочитанность',
    !JSON.stringify(dom.window.localStorage).includes('summary:'),
    JSON.stringify(dom.window.localStorage).slice(0, 80))
  re.app.unmount()
}
{
  // свёрнутая строка ленты: «дата · метка первого блока», тап раскрывает
  const prev = nsFeedDay[2] // 15.05
  const { el, app } = mount(bundle.NetSummaryCard, {
    cadence: 'day', entry: prev, expanded: false, collapsible: true,
  })
  await nextTick()
  const row = el.querySelector('[data-test="summary-row"]')
  const card = el.querySelector('[data-test="summary-card"]')
  check('свёрнутая строка — день недели + бейдж периода',
    !!row && row.textContent.replace(/\s+/g, ' ').trim() === 'Четверг15.05',
    row && row.textContent.replace(/\s+/g, ' ').trim())
  check('свёрнутая: метки первого блока в строке нет', !row.textContent.includes('Данные'))
  check('свёрнутая: шапка — кнопка со стрелкой (её и жмём)',
    row.tagName === 'BUTTON' && !!row.querySelector('svg'))
  check('свёрнутая: тел блоков и среза в DOM нет',
    el.querySelectorAll('[data-test="summary-block"]').length === 0 &&
    !el.querySelector('[data-test="summary-asof"]'))
  check('свёрнутая: статус несёт заливка бейджа, точки нет',
    !el.querySelector('[data-test="summary-dot"]') &&
    el.querySelector('[data-test="summary-badge"]').getAttribute('style').includes('var(--warning)'))
  check('свёрнутая: data-open="false"', card.getAttribute('data-open') === 'false', card.getAttribute('data-open'))
  check('свёрнутая: тач-таргет ≥44pt', String(row.getAttribute('style') || '').includes('44px'))
  check('свёрнутая: без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}
{
  // месячная карточка: метка с точкой внутри даты не рвётся при живом рендере
  localStorage.clear()
  const month = NS.find((x) => x.cadence === 'month')
  const { el, app } = mount(bundle.NetSummaryCard, { cadence: 'month', entry: month })
  await nextTick()
  check('месяц: заголовок каденса + бейдж «Май 2025»',
    el.textContent.includes('Сводка месяца') &&
    el.querySelector('[data-test="summary-badge"]').textContent.trim().replace(/ /g, ' ') === 'Май 2025',
    el.querySelector('[data-test="summary-badge"]').textContent.trim())
  const bold = [...el.querySelectorAll('[data-test="summary-block"] b')].map((b) => b.textContent)
  check('метки трёх блоков на месте; под-метки блока 2 выделены двоеточием',
    bold.join('|') === 'Итог месяца (на 16.05).|Траектория.|Прогноз растёт неделя к неделе:|Посадки:|Вывод.',
    bold.join('|'))
  check('метка не обрезана по точке внутри даты (боевой кейс месяца)',
    bold[0] === 'Итог месяца (на 16.05).', bold[0])
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
  check('неизвестный статус → нейтральная заливка бейджа + белый ink, рендер жив', (() => {
    const st = el.querySelector('[data-test="summary-badge"]').getAttribute('style')
    return st.includes('var(--text-muted)') && st.includes('var(--ink-on-color)')
  })(), el.querySelector('[data-test="summary-badge"]').getAttribute('style'))
  check('единственный блок отрисован как обычный абзац',
    el.querySelectorAll('[data-test="summary-block"]').length === 1 &&
    el.textContent.includes('Итог недели'))
  check('среза нет в записи → строки «данные на …» нет', !el.querySelector('[data-test="summary-asof"]'))
  app.unmount()
}

console.log('\n=== jsdom: раздел «Сводки сети» и вход с Главной ===')
{
  localStorage.clear()
  getPayload = { updated: '2025-05-20', sets: {}, net_summary: NS }
  // шапка монтируется рядом: селектор месяца живёт в её правом углу (v2.3)
  const nav = mount(bundle.NavigationBar, { title: 'Сводки сети', collapsed: true, showBack: true, backLabel: 'Главная' })
  const { el, app } = mount(bundle.SummaryScreen, {})
  await flush()

  // селектор месяца — в правом верхнем углу шапки, НЕ в теле раздела
  const pill = nav.el.querySelector('[data-test="summary-month-pill"]')
  check('селектор месяца стоит в правом углу шапки, как парк-фильтр',
    !!pill && !!nav.el.querySelector('[data-test="nav-trailing"]'))
  check('в теле раздела селектора больше нет', !el.querySelector('[data-test="summary-month-pill"]'))
  check('умолчание — самый свежий месяц', pill.textContent.trim() === 'Май\u00A02025', pill.textContent.trim())
  check('пилюля ≥44pt и открывает диалог',
    String(pill.getAttribute('style') || '').includes('44px') && pill.getAttribute('aria-haspopup') === 'dialog')
  check('лист месяцев закрыт до тапа', !document.querySelector('[data-test="summary-month-sheet"]'))
  await fire(pill, 'click')
  const sheet = document.querySelector('[data-test="summary-month-sheet"]')
  const opts = [...document.querySelectorAll('[data-test="summary-month-option"]')]
  check('лист открылся: role=dialog + aria-modal',
    !!sheet && sheet.getAttribute('role') === 'dialog' && sheet.getAttribute('aria-modal') === 'true')
  check('в списке только месяцы с данными, новые сверху',
    opts.map((o) => o.textContent.trim().replace(/\u00A0/g, ' ')).join(' | ') === 'Май 2025 | Апрель 2025',
    opts.map((o) => o.textContent.trim()).join(' | '))
  check('выбранный помечен галкой, не цветом',
    opts[0].querySelector('svg') && !opts[1].querySelector('svg'))
  await fire(opts[1], 'click')
  check('после выбора лист закрылся', !document.querySelector('[data-test="summary-month-sheet"]'))
  check('пилюля показывает выбранный месяц',
    nav.el.querySelector('[data-test="summary-month-pill"]').textContent.trim() === 'Апрель\u00A02025',
    nav.el.querySelector('[data-test="summary-month-pill"]').textContent.trim())
  check('лента «Дни» апреля = одна запись 29.04', (() => {
    const c = [...el.querySelectorAll('[data-test="summary-card"]')]
    return c.length === 1 && c[0].textContent.includes('29.04')
  })())
  {
    const p2 = nav.el.querySelector('[data-test="summary-month-pill"]')
    await fire(p2, 'click')
    const back = [...document.querySelectorAll('[data-test="summary-month-option"]')][0]
    await fire(back, 'click')
  }
  check('возврат в май восстановил ленту мая',
    el.querySelectorAll('[data-test="summary-card"]').length === feedByCadence(NS, '2025-05').day.length)

  // сегменты
  const segs = [...el.querySelectorAll('[data-test^="summary-seg-"]')]
  check('сегментов три, подписи «Дни / Недели / Месяц»',
    segs.length === 3 && segs.map((s) => s.textContent.trim()).join(' / ') === 'Дни / Недели / Месяц',
    segs.map((s) => s.textContent.trim()).join(' · '))
  check('лид — одна фраза в две строки, по центру, крупнее прежнего', (() => {
    const lead = el.querySelector('[data-test="summary-lead"]')
    return !!lead && lead.textContent.trim() === 'Где парки сегодня и\nкакой прогноз на месяц' &&
      lead.className.includes('text-center') && lead.className.includes('text-[1rem]') &&
      lead.className.includes('whitespace-pre-line')
  })(), el.querySelector('[data-test="summary-lead"]')?.textContent.trim())
  check('сегменты — не таб-бар: role=tablist внутри раздела',
    el.querySelector('[data-test="summary-segments"]')?.getAttribute('role') === 'tablist')
  check('умолчание — «Дни»', segs[0].getAttribute('aria-selected') === 'true' &&
    segs[1].getAttribute('aria-selected') === 'false' && segs[2].getAttribute('aria-selected') === 'false')
  check('сегменты ≥44pt', segs.every((s) => String(s.getAttribute('style') || '').includes('44px')))

  // лента внутри сегмента «Дни»
  const feeds = feedByCadence(NS, '2025-05')
  let cards = [...el.querySelectorAll('[data-test="summary-card"]')]
  check('лента «Дни»: карточек = записей каденса (не одна)',
    cards.length === feeds.day.length && cards.length > 1, `${cards.length} / ${feeds.day.length}`)
  check('лента «Дни»: все карточки каденса day',
    cards.every((c) => c.getAttribute('data-cadence') === 'day'))
  check('лента: раскрыта только первая (актуальная)',
    cards[0].getAttribute('data-open') === 'true' &&
    cards.slice(1).every((c) => c.getAttribute('data-open') === 'false'),
    cards.map((c) => c.getAttribute('data-open')).join(','))
  check('лента: новое сверху — первая строка 16.05, последняя 13.05',
    cards[0].textContent.includes('16.05') &&
    cards[cards.length - 1].textContent.replace(/\s+/g, ' ').includes('13.05'))
  check('лента: актуальная = свежая дозаливка, устаревшая свёрнута ниже',
    cards[0].textContent.includes('Фокус на субботу') &&
    !cards[0].textContent.includes('Предварительно'))
  check('лента: шапка-строка у каждой карточки, свёрнутых — все кроме одной',
    el.querySelectorAll('[data-test="summary-row"]').length === cards.length &&
    cards.filter((c) => c.getAttribute('data-open') === 'false').length === cards.length - 1)
  check('стрелка живёт в шапке-строке и не переезжает при раскрытии', (() => {
    // одна и та же кнопка в обоих состояниях: у раскрытой она просто повёрнута
    const openRow = cards[0].querySelector('[data-test="summary-row"]')
    const shutRow = cards[1].querySelector('[data-test="summary-row"]')
    const cls = (r) => r.querySelector('svg').getAttribute('class') || ''
    return openRow.tagName === 'BUTTON' && shutRow.tagName === 'BUTTON' &&
      openRow.className === shutRow.className &&
      cls(openRow).includes('rotate-180') && !cls(shutRow).includes('rotate-180')
  })())
  check('разделителей «·» в разделе нет', !el.textContent.includes('·'))
  check('обводок в разделе нет (ни у карточек, ни у трека сегментов)',
    !el.innerHTML.includes('border-[var(--line)]') && !el.innerHTML.includes('border border'))
  check('у каждой карточки ленты — свой бейдж периода с заливкой статуса',
    [...el.querySelectorAll('[data-test="summary-badge"]')].length === cards.length &&
    [...el.querySelectorAll('[data-test="summary-badge"]')].every((b) => /background:\s*var\(--/.test(b.getAttribute('style'))))
  check('бейджа «новое» в ленте нет',
    !el.querySelector('[data-test="summary-new"]') && !el.textContent.includes('новое'))
  check('в разделе время среза не выводится, только дата строкой «данные на …»',
    !el.textContent.includes('12:28') && !el.textContent.includes('21:40') &&
    !el.textContent.includes('2025-05-17') &&
    el.querySelector('[data-test="summary-asof"]')?.textContent.trim() === 'данные на 17.05',
    el.querySelector('[data-test="summary-asof"]')?.textContent.trim())

  // тап по свёрнутой раскрывает её; прежняя закрывается (аккордеон)
  await fire(cards[1].querySelector('[data-test="summary-row"]'), 'click')
  cards = [...el.querySelectorAll('[data-test="summary-card"]')]
  check('тап по свёрнутой раскрывает её',
    cards[1].getAttribute('data-open') === 'true' &&
    cards[1].textContent.includes('Предварительно'),
    cards.map((c) => c.getAttribute('data-open')).join(','))
  check('аккордеон: раскрытие соседней СВЕРНУЛО прежнюю',
    cards[0].getAttribute('data-open') === 'false' &&
    cards.filter((c) => c.getAttribute('data-open') === 'true').length === 1,
    cards.map((c) => c.getAttribute('data-open')).join(','))
  await fire(cards[1].querySelector('[data-test="summary-row"]'), 'click')
  check('повторный тап сворачивает обратно — открытых нет',
    [...el.querySelectorAll('[data-test="summary-card"]')].every((c) => c.getAttribute('data-open') === 'false'))
  await fire(el.querySelectorAll('[data-test="summary-row"]')[0], 'click')
  check('открытой всегда не больше одной',
    [...el.querySelectorAll('[data-test="summary-card"]')].filter((c) => c.getAttribute('data-open') === 'true').length === 1)

  // переключение каденса
  await fire(segs[1], 'click')
  cards = [...el.querySelectorAll('[data-test="summary-card"]')]
  check('переключение на «Недели»: карточки week, их 3 (включая стыковую 28.04)',
    cards.length === feeds.week.length && cards.every((c) => c.getAttribute('data-cadence') === 'week'),
    `${cards.length} × ${cards[0]?.getAttribute('data-cadence')}`)
  check('«Недели»: новое сверху (12.05 → 05.05 → 28.04)',
    cards[0].textContent.includes('12.05') && cards[1].textContent.includes('05.05') &&
    cards[2].textContent.includes('28.04'))
  check('«Недели»: заголовки — «Неделя 3 / 2 / 1», а не «Сводка недели»',
    [...el.querySelectorAll('[data-test="summary-row"]')].map((r) => r.textContent.replace(/\s+/g, ' ').trim())
      .join(' | ') === 'Неделя 312.05–18.05 | Неделя 205.05–11.05 | Неделя 128.04–04.05' &&
    !el.textContent.includes('Сводка недели'),
    [...el.querySelectorAll('[data-test="summary-row"]')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' | '))
  check('«Недели»: aria-selected переехал на второй сегмент',
    el.querySelectorAll('[data-test^="summary-seg-"]')[1].getAttribute('aria-selected') === 'true')
  await fire(el.querySelectorAll('[data-test^="summary-seg-"]')[2], 'click')
  cards = [...el.querySelectorAll('[data-test="summary-card"]')]
  check('переключение на «Месяц»: одна карточка month, раскрыта, без стрелки',
    cards.length === 1 && cards[0].getAttribute('data-cadence') === 'month' &&
    cards[0].getAttribute('data-open') === 'true' &&
    cards[0].querySelector('[data-test="summary-row"]').tagName === 'DIV')
  await fire(el.querySelectorAll('[data-test^="summary-seg-"]')[0], 'click')
  check('возврат в «Дни»: открыта ровно одна запись — та, что выбирали',
    [...el.querySelectorAll('[data-test="summary-card"]')].filter((c) => c.getAttribute('data-open') === 'true').length === 1)
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
  await nextTick()
  check('экран ушёл — слот шапки освобождён', !nav.el.querySelector('[data-test="nav-trailing"]'))
  nav.app.unmount()
}
{
  // каденс без записей → тот же пустой стейт, сегменты на месте
  localStorage.clear()
  getPayload = {
    updated: '2025-05-20',
    sets: {},
    net_summary: NS.filter((x) => x.cadence === 'week'),
  }
  const { el, app } = mount(bundle.SummaryScreen, {})
  await flush()
  check('пустой каденс: сегменты показаны', el.querySelectorAll('[data-test^="summary-seg-"]').length === 3)
  check('пустой каденс «Дни»: карточек нет, показан пустой стейт раздела',
    el.querySelectorAll('[data-test="summary-card"]').length === 0 &&
    !!el.querySelector('[data-test="summary-empty-cadence"]') &&
    el.textContent.includes('Сводок пока нет'))
  await fire(el.querySelectorAll('[data-test^="summary-seg-"]')[1], 'click')
  check('переключение на «Недели»: карточки появились',
    el.querySelectorAll('[data-test="summary-card"]').length >= 1 &&
    !el.querySelector('[data-test="summary-empty-cadence"]'))
  app.unmount()
}
{
  // обратная совместимость: payload БЕЗ data_asof (старый контур)
  localStorage.clear()
  getPayload = {
    updated: '2025-05-20',
    sets: {},
    net_summary: NS.map(({ data_asof, ...rest }) => rest), // eslint-disable-line no-unused-vars
  }
  const { el, app } = mount(bundle.SummaryScreen, {})
  await flush()
  const cards = [...el.querySelectorAll('[data-test="summary-card"]')]
  check('без data_asof: раздел живой, лента строится по max(date)',
    cards.length === feedByCadence(NS, '2025-05').day.length &&
    cards[0].getAttribute('data-open') === 'true')
  check('без data_asof: без NaN/undefined/Infinity', !BAD.test(el.textContent))
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
  // Переименования владельца 28.07: плитка «Тренды» (бывш. «Сводки»), «Прогресс» (бывш. «Аналитика»).
  check('«Тренды» — первая плитка', tiles[0]?.getAttribute('data-test') === 'tile-summary' && tiles[0].textContent.includes('Тренды'))
  check('порядок остальных не тронут', tiles.slice(1).map((t) => t.textContent.trim()).join(',') === 'Прогресс,Задачи,Материалы',
    tiles.slice(1).map((t) => t.textContent.trim()).join(','))
  await fire(tiles[0], 'click')
  // 28.07: «Тренды» — вкладка таб-бара, тап по плитке активирует её (не под-страницу)
  check('тап по плитке «Тренды» → вкладка «summary», под-страницы нет',
    nav.active.value === 'summary' && nav.subView.value === null, nav.active.value)
  nav.setActive('home')
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

console.log('\n=== jsdom: компактный заголовок navigation bar (ТЗ v2 §3.5) ===')
{
  const navSrc = readFileSync(resolve(root, 'src/components/NavigationBar.vue'), 'utf8')
  check('зажимающего px-[10rem] в компактном заголовке больше нет', !navSrc.includes('px-[10rem]'))
  check('заголовку отдана центральная колонка grid (боковым — по 44pt минимум)',
    navSrc.includes('grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)]'))
  check('подпись слота «Назад» сжимается по многоточию, а не давит заголовок',
    /truncate text-\[1\.0625rem\] leading-none/.test(navSrc))

  // все разделы, где заголовок резался: «Сводки сети» 121px, «Контроль Дня» 138px.
  // Главной в этом списке больше нет — с D-20 у неё заголовка нет вовсе (см. ниже).
  for (const [title, props] of [
    ['Сводки сети', { showBack: true, backLabel: 'Главная', parkFilter: false }],
    ['Контроль Дня', { showBack: true, backLabel: 'Главная', parkFilter: true }],
    ['Отчёт Дня', { showBack: true, backLabel: 'Контроль Дня', parkFilter: false }],
  ]) {
    const { el, app } = mount(bundle.NavigationBar, { title, collapsed: true, ...props })
    await nextTick()
    const compact = el.querySelector('[data-test="nav-compact-title"]')
    check(`«${title}»: компактный заголовок в DOM целиком, без обрезки разметкой`,
      !!compact && compact.textContent.trim() === title, compact && compact.textContent.trim())
    check(`«${title}»: крупный заголовок в потоке на месте`,
      el.querySelector('h1').textContent.trim() === title)
    app.unmount()
  }
}

console.log('\n=== Главная: склонение счётчиков и подпись вкладки (v2.3) ===')
check('plural: 1 / 2 / 5', [1, 2, 5].map((n) => plural(n, ['чекап', 'чекапа', 'чекапов'])).join(',') === 'чекап,чекапа,чекапов')
check('plural: 11–14 всегда пятая форма',
  [11, 12, 13, 14].map((n) => plural(n, ['чекап', 'чекапа', 'чекапов'])).join(',') === 'чекапов,чекапов,чекапов,чекапов')
check('plural: 21 / 22 / 25 / 101 / 111',
  [21, 22, 25, 101, 111].map((n) => plural(n, ['чекап', 'чекапа', 'чекапов'])).join(',')
    === 'чекап,чекапа,чекапов,чекап,чекапов',
  [21, 22, 25, 101, 111].map((n) => plural(n, ['чекап', 'чекапа', 'чекапов'])).join(','))
check('plural: 0 → пятая форма', plural(0, ['чекап', 'чекапа', 'чекапов']) === 'чекапов')
check('checkupsWord/signalsWord: 2 чекапа, 3 сигнала',
  checkupsWord(2) === 'Чекапа' && signalsWord(3) === 'Сигнала',
  `${checkupsWord(2)} / ${signalsWord(3)}`)
check('счётчик строкой (как отдаёт readCounters) тоже склоняется',
  checkupsWord('137') === 'Чекапов' && signalsWord('42') === 'Сигнала',
  `${checkupsWord('137')} / ${signalsWord('42')}`)
check('числа нет → родительный множественного, как было',
  checkupsWord(null) === 'Чекапов' && signalsWord(null) === 'Сигналов')
{
  localStorage.clear()
  getPayload = { updated: '2025-05-20', sets: {}, stats: { checkups: 2, signals: 3 } }
  const { el, app } = mount(bundle.HomeScreen, {})
  await flush()
  check('на Главной: «2 Чекапа» и «3 Сигнала»',
    el.querySelector('[data-test="home-checkups-word"]').textContent.trim() === 'Чекапа' &&
    el.querySelector('[data-test="home-signals-word"]').textContent.trim() === 'Сигнала',
    [el.querySelector('[data-test="home-checkups-word"]').textContent.trim(),
      el.querySelector('[data-test="home-signals-word"]').textContent.trim()].join(' / '))
  // D-19: ключа reviews нет → «—» + родительный множественного
  check('разборов нет в payload → «—» и «Разборов»',
    el.querySelector('[data-test="home-reviews"]').textContent.includes('—') &&
    el.querySelector('[data-test="home-reviews-word"]').textContent.trim() === 'Разборов')
  app.unmount()
  getPayload = {}
}

// ═══════════════ D-19: журнал разборов («Разбор полёта») ═══════════════
console.log('\n=== D-19: разборы — чистые хелперы ===')
{
  const raw = [
    { date: '2025-05-09', title: '' },
    { date: '2025-05-16' },
    { date: 'мусор' },
    'не-объект',
    null,
    { date: '2025-05-02', title: 'Именованный' },
  ]
  const sorted = sortReviews(raw)
  check('sortReviews: битые/не-объекты отброшены (3 из 6)', sorted.length === 3, sorted.length)
  check('sortReviews: ПО УБЫВАНИЮ даты (свежие сверху)',
    sorted.map((r) => r.date).join(',') === '2025-05-16,2025-05-09,2025-05-02')
  check('sortReviews: не-массив → []', sortReviews(undefined).length === 0 && sortReviews(null).length === 0)
  check('reviewCount: считает только валидные, строкой', reviewCount(raw) === '3', reviewCount(raw))
  check('reviewCount: ключа нет → null (полоса покажет «—»)', reviewCount(undefined) === null)
  check('reviewCount: пустой массив → «0» (журнал заведён, разборов нет)', reviewCount([]) === '0')
  check('reviewsWord: 1/2/5 и null',
    reviewsWord(1) === 'Разбор' && reviewsWord(2) === 'Разбора' && reviewsWord(5) === 'Разборов' &&
    reviewsWord(null) === 'Разборов')
  check('мок содержит reviews (3 записи, перемешаны)', Array.isArray(data.reviews) && data.reviews.length === 3)
}

console.log('\n=== jsdom: D-19 — полоса Главной и журнал разборов ===')
{
  // счётчик разборов из payload.reviews + тап → под-страница reviews
  localStorage.clear()
  getPayload = { updated: '2025-05-20', sets: {}, stats: { checkups: 2, signals: 3 },
    reviews: [{ date: '2025-05-09' }, { date: '2025-05-16' }] }
  const nav = bundle.useAppNav()
  bundle.clearSubView()
  const { el, app } = mount(bundle.HomeScreen, {})
  await flush()
  const rv = el.querySelector('[data-test="home-reviews"]')
  check('счётчик разборов из журнала: «2 Разбора»',
    !!rv && rv.textContent.includes('2') &&
    el.querySelector('[data-test="home-reviews-word"]').textContent.trim() === 'Разбора',
    el.querySelector('[data-test="home-reviews-word"]')?.textContent.trim())
  check('полоса-счётчик: три кнопки (чекапы/сигналы/разборы)',
    el.querySelectorAll('[aria-label="Открыть Контроль Дня"]').length === 2 && !!rv)
  await fire(rv, 'click')
  check('тап по разборам → под-страница «reviews» (вход только с Главной)',
    nav.subView.value === 'reviews', nav.subView.value)
  bundle.clearSubView()
  app.unmount()
}
{
  // журнал: свежие сверху, подпись «Разбор полёта», title из строки приоритетнее
  getPayload = { updated: '2025-05-20', sets: {},
    reviews: [{ date: '2025-05-02', title: 'Именованный' }, { date: '2025-05-16' }, { date: '2025-05-09' }] }
  const { el, app } = mount(bundle.ReviewsScreen, {})
  await flush()
  const rows = [...el.querySelectorAll('[data-test="review-row"]')]
  check('журнал: строк = записей', rows.length === 3, rows.length)
  check('журнал: свежие сверху (16.05 → 09.05 → 02.05)',
    rows[0].textContent.includes('16.05') && rows[2].textContent.includes('02.05'))
  check('журнал: подпись по умолчанию — «Разбор полёта»', rows[0].textContent.includes('Разбор полёта'))
  check('журнал: title из строки приоритетнее', rows[2].textContent.includes('Именованный'))
  check('журнал: день недели из даты (16.05.2025 — Пятница)', rows[0].textContent.includes('Пятница'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}
{
  // пустой стейт журнала: ключа нет
  getPayload = { updated: '2025-05-20', sets: {} }
  const { el, app } = mount(bundle.ReviewsScreen, {})
  await flush()
  check('журнал без данных: пустой стейт дословно',
    el.textContent.includes('Разборов пока нет') && !el.querySelector('[data-test="review-row"]'))
  app.unmount()
  getPayload = {}
}
{
  // конфиг вкладок живёт внутри <script setup> App.vue — проверяем по исходнику
  const appSrc = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
  check('вкладка «home» подписана «Сегодня»', /id: 'home',\s+label: 'Сегодня'/.test(appSrc))
  check('идентификатор вкладки не менялся (useAppNav/тесты/ссылки)', appSrc.includes("id: 'home'"))
  check('подписи «Главная» в таб-баре не осталось', !/label: 'Главная'/.test(appSrc))
  check('«Главная» осталась подписью кнопки «Назад» на под-страницах',
    (appSrc.match(/backLabel: 'Главная'/g) || []).length >= 3,
    (appSrc.match(/backLabel: 'Главная'/g) || []).length)
  check('TabBar рендерит именно label вкладки',
    readFileSync(resolve(root, 'src/components/TabBar.vue'), 'utf8').includes('tab.label'))
}

// ═══════════════ D-20: шапка Главной, переключатель бизнесов, заявка ═══════════════
console.log('\n=== D-20: имя продукта ушло из шапки Главной ===')
{
  const appSrc = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
  check('у вкладки «home» пустой title (заголовка на Главной нет)', /id: 'home',[\s\S]{0,80}?title: ''/.test(appSrc))
  // слово может остаться в комментарии-объяснении — важно, что его нет в ЗНАЧЕНИЯХ конфига
  check('«Мастерплан» не значится ни заголовком, ни подписью вкладки',
    !/(title|label|eyebrow):\s*'[^']*Мастерплан/.test(appSrc))
  check('чип «БУМБАСТИК» остался (eyebrow)', appSrc.includes("eyebrow: 'БУМБАСТИК'"))

  // Главная: ни крупного h1, ни компактного заголовка; чип на месте
  const { el, app } = mount(bundle.NavigationBar, {
    title: '', collapsed: true, leadingAction: 'hardReload', parkFilter: false, eyebrow: 'БУМБАСТИК',
  })
  await nextTick()
  check('Главная: крупного заголовка нет', !el.querySelector('h1'))
  check('Главная: компактного заголовка нет', !el.querySelector('[data-test="nav-compact-title"]'))
  check('Главная: чип бизнеса в шапке есть', !!el.querySelector('[data-test="business-chip"]'))
  // чип должен жить В ЛИПКОЙ ПОЛОСЕ (header), а не в потоке под ней —
  // иначе контекст экрана уезжает при прокрутке
  check('чип внутри липкой полосы, в левом слоте',
    !!el.querySelector('header [data-test="business-chip"]'))
  check('кнопка перезагрузки уехала в правый слот, к концу строки',
    !!el.querySelector('header [data-test="nav-hard-reload"]') &&
    (() => {
      const bar = el.querySelector('header > div')
      const kids = [...bar.children]
      const iChip = kids.findIndex((k) => k.querySelector('[data-test="business-chip"]'))
      const iRel = kids.findIndex((k) => k.querySelector('[data-test="nav-hard-reload"]'))
      return iChip === 0 && iRel === kids.length - 1
    })())
  check('Главная: слова «Мастерплан» в шапке нет', !el.textContent.includes('Мастерплан'))
  app.unmount()

  // регресс: у разделов с заголовком всё как было
  const nb = mount(bundle.NavigationBar, { title: 'Тренды', collapsed: true })
  await nextTick()
  check('регресс: раздел с заголовком по-прежнему рендерит h1 и компактный заголовок',
    nb.el.querySelector('h1')?.textContent.trim() === 'Тренды' &&
    nb.el.querySelector('[data-test="nav-compact-title"]')?.textContent.trim() === 'Тренды')
  nb.app.unmount()
}

console.log('\n=== D-20: «Мастерплан» → «Ранскейл» в PWA ===')
{
  const banner = readFileSync(resolve(root, 'src/components/home/InstallPwaBanner.vue'), 'utf8')
  // смотрим ВИДИМЫЙ текст: <template> + строки шагов, а не комментарии-объяснения
  const bannerVisible = banner.slice(banner.indexOf('const steps'))
  check('в видимом тексте PWA-баннера «Мастерплана» нет', !bannerVisible.includes('Мастерплан'))
  check('во всех четырёх местах баннера теперь «Ранскейл»',
    (bannerVisible.match(/Ранскейл/g) || []).length === 4, (bannerVisible.match(/Ранскейл/g) || []).length)
  check('баннер зовёт открыть Ранскейл', /Откройте Ранскейл/.test(banner))
  const mf = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8'))
  check('manifest.name / short_name = «Ранскейл»', mf.name === 'Ранскейл' && mf.short_name === 'Ранскейл')
  check('иконки манифеста НЕ трогали (отдельная задача владельца)',
    mf.icons.length === 4 && mf.icons.every((i) => /icon-(192|512)\.png$/.test(i.src)))
}

console.log('\n=== D-21: экран входа — логотип Ранскейл ===')
{
  const { el, app } = mount(bundle.AccessKeyForm, {})
  await nextTick()

  // 1. логотип вместо слогана
  const logo = el.querySelector('[data-test="access-logo"]')
  const chev = el.querySelector('[data-test="access-chevron"]')
  const word = el.querySelector('[data-test="access-wordmark"]')
  check('слогана «Расти с планом» больше нет', !el.textContent.includes('Расти'))
  check('логотип озвучен для скринридера один раз (role=img + aria-label)',
    !!logo && logo.getAttribute('role') === 'img' && logo.getAttribute('aria-label') === 'Ранскейл' &&
    word.getAttribute('aria-hidden') === 'true')
  check('шеврон — SVG-маска, цвет из токена (не хардкод #111)',
    !!chev && /mask-image/i.test(chev.getAttribute('style') || '') &&
    chev.className.includes('bg-[var(--text)]'))
  // 53px — промерено по утверждённому мокапу v2 (780×1500 = 390×750 @2x:
  // знак 106px = 53px CSS). Вариант A на 72px отклонён владельцем 28.07.
  check('шеврон 53px на мобайле и ×1.5 (80px) на ≥768px',
    chev.className.includes('h-[53px]') && chev.className.includes('md:h-[80px]'))
  // РЕГРЕСС-ЧЕК на боевой баг: без явной ширины пустой div во flex-колонке с
  // align-items:center получает ширину 0 — знак пропадал совсем (было видно на проде).
  check('у шеврона ЯВНАЯ ширина (62/94px), а не только aspect-ratio',
    chev.className.includes('w-[62px]') && chev.className.includes('md:w-[94px]'))
  check('ширина совпадает с пропорцией знака 1080:923.72',
    Math.round(53 * 1080 / 923.72) === 62 && Math.round(80 * 1080 / 923.72) === 94)
  check('пропорция шеврона задана явно (бокс = знак, без прозрачных полей)',
    /aspect-ratio:\s*1080\s*\/\s*923\.72/.test(chev.getAttribute('style') || ''))
  check('слово «Ранскейл» — голос бренда, капс, 28px, трекинг 0.06em',
    word.textContent.trim() === 'Ранскейл' && word.className.includes('font-brand') &&
    word.className.includes('uppercase') && word.className.includes('text-[1.75rem]') &&
    word.className.includes('tracking-[0.06em]'))
  check('зазор шеврон→слово 12px, на десктопе 18px (×1.5)',
    word.className.includes('mt-[12px]') && word.className.includes('md:mt-[18px]'))
  check('десктоп: слово ×1.5 = 42px', word.className.includes('md:text-[2.625rem]'))

  // 2. карточка
  const cardLabel = el.querySelector('[data-test="access-card-label"]')
  check('вместо вывески «БУМБАСТИК» — ярлык «ДОСТУП В СИСТЕМУ»',
    !!cardLabel && cardLabel.textContent.trim() === 'ДОСТУП В СИСТЕМУ' &&
    !el.textContent.includes('БУМБАСТИК'))
  check('ярлык — начертание подписей, капс, разрядка 10% (v2), вторичный цвет',
    cardLabel.className.includes('font-label') && cardLabel.className.includes('uppercase') &&
    cardLabel.className.includes('tracking-[0.1em]') &&
    cardLabel.className.includes('text-[var(--text-secondary)]'))
  const login = el.querySelector('[data-test="access-login"]')
  const phrase = el.querySelector('[data-test="access-phrase"]')
  check('логин проставлен значением «b00mbastic», а не placeholder\'ом',
    login.value === 'b00mbastic' && !login.getAttribute('placeholder'))
  check('логин нельзя изменить: readonly (не disabled — поле должно читаться)',
    login.hasAttribute('readonly') && !login.hasAttribute('disabled') &&
    login.getAttribute('aria-readonly') === 'true')
  check('фокус по Tab минует логин и идёт сразу на код доступа',
    login.getAttribute('tabindex') === '-1')
  check('логин приглушён: яркий читался бы как «здесь ждут ввода»',
    login.className.includes('text-[var(--text-secondary)]'))
  check('placeholder пароля — «код доступа»', phrase.getAttribute('placeholder') === 'код доступа')
  check('оба поля — терминальный моно, ввод не мельче 16px (иначе iOS зумит при фокусе)',
    login.className.includes('font-mono') &&
    phrase.className.includes('font-mono') &&
    (phrase.className.includes('text-[1.5rem]') || phrase.className.includes('text-[1rem]')))
  // На ПУСТОМ поле кегль всегда 16px — независимо от состояния глаза. Раньше он
  // зависел только от `show`, и переключение глаза сдвигало placeholder, хотя
  // пользователь ничего не вводил (боевой баг, замечен владельцем).
  check('пустое поле: кегль 16px, крупная маска не включена',
    phrase.className.includes('text-[1rem]') && !phrase.className.includes('text-[1.5rem]'))
  // 29.07: кегль маски вернули к 16px — 24px давал жирные кружки тяжелее букв.
  // Отличается только разрядка, поэтому размер не скачет при переключении глаза.
  check('маска и текст одного кегля: 24px больше нигде нет',
    !readFileSync(resolve(root, 'src/components/AccessKeyForm.vue'), 'utf8')
      .includes("masked ? 'text-[1.5rem]"))
  // Композиция — прежняя, из трёх зон: лого (отступ 13% высоты) / карточка / подвал.
  // Пробовали 29.07 собрать лого с карточкой в одну центрированную группу —
  // владелец вернул как было. Чек стоит, чтобы раскладку не «улучшили» молча.
  check('раскладка из трёх зон: лого с отступом 13svh, карточка и подвал отдельно',
    !el.querySelector('[data-test="access-group"]') &&
    /flex flex-1 items-start justify-center pt-\[13svh\]/
      .test(readFileSync(resolve(root, 'src/components/AccessKeyForm.vue'), 'utf8')))
  // цвет placeholder'у задаём (это токен), а вот РАЗМЕР и разрядку — нет:
  // из-за них он и расходился с полем при переключении глаза
  check('placeholder задаёт только цвет, метрики наследует у поля',
    phrase.className.includes('placeholder:text-[var(--placeholder)]') &&
    !/placeholder:text-\[\d/.test(phrase.className) &&
    !phrase.className.includes('placeholder:tracking-'))
  {
    // ввели символ → включилась крупная маска; щёлкнули глазом → снова 16px
    const t = mount(bundle.AccessKeyForm, {})
    await nextTick()
    const inp = t.el.querySelector('[data-test="access-phrase"]')
    inp.value = 'abc'
    await fire(inp, 'input')
    check('после ввода включилась разрядка маски, кегль тот же 16px',
      inp.className.includes('tracking-[0.14em]') && inp.className.includes('text-[1rem]'))
    await fire(t.el.querySelector('[data-test="access-eye"]'), 'click')
    check('глаз показал код → разрядка снята, кегль не менялся',
      inp.className.includes('tracking-normal') && inp.className.includes('text-[1rem]'))
    // стёрли всё при открытом глазе и закрыли его — placeholder не должен прыгать
    inp.value = ''
    await fire(inp, 'input')
    const a = inp.className
    await fire(t.el.querySelector('[data-test="access-eye"]'), 'click')
    check('на пустом поле переключение глаза НЕ меняет метрики (placeholder не прыгает)',
      inp.className === a, a === inp.className ? 'классы совпали' : inp.className)
    check('высота строки одна в обоих состояниях: 24×1 = 16×1.5 = 24px',
      /leading-\[1\]|leading-\[1\.5\]/.test(inp.className))
    t.app.unmount()
  }
  const submit = el.querySelector('[data-test="access-submit"]')
  check('кнопка «СТАРТ» голосом бренда, капс, разрядка 12% (v2)',
    submit.textContent.trim() === 'СТАРТ' && submit.className.includes('font-brand') &&
    submit.className.includes('uppercase') && submit.className.includes('tracking-[0.12em]'))
  check('высота кнопки 52px; цвет — из токена, а не хардкодом',
    submit.className.includes('bg-[var(--accent)]') &&
    /min-height:\s*52px/.test(submit.getAttribute('style') || ''))
  check('«СТАРТ» центрирован оптически: сдвиг на 2px вниз от геометрии',
    submit.className.includes('items-center') && submit.className.includes('justify-center') &&
    submit.className.includes('pt-[2px]'))
  check('радиусы уменьшены: карточка 20px, поля и кнопка 12px',
    submit.className.includes('rounded-xl') &&
    el.querySelector('[data-test="access-fields"]').className.includes('rounded-xl') &&
    /rounded-\[20px\]/.test(readFileSync(resolve(root, 'src/components/AccessKeyForm.vue'), 'utf8')))
  // кант: карточка на фоне отличается всего на четыре ступени яркости — без
  // обводки и верхнего блика край теряется и блок выглядит плоским пятном
  const card = el.querySelector('[data-test="access-card"]')
  check('у карточки есть кант: обводка --rim и тень из токена',
    !!card && card.className.includes('border-[var(--rim)]') &&
    card.className.includes('shadow-[var(--card-shadow)]'))
  check('блик идёт по ВЕРХНЕЙ кромке (inset 0 1px), а не по всему периметру',
    el.querySelector('[data-test="access-fields"]').className.includes('shadow-[inset_0_1px_0_var(--rim-glow)]'))
  const link = el.querySelector('[data-test="access-footer-link"]')
  check('лого «Модуль Роста» ведёт на runscale.ru в новой вкладке',
    !!link && link.getAttribute('href') === 'https://runscale.ru' &&
    link.getAttribute('target') === '_blank')
  check('внешняя ссылка защищена rel=noopener noreferrer',
    /noopener/.test(link.getAttribute('rel') || '') && /noreferrer/.test(link.getAttribute('rel') || ''))
  check('тач-таргет ссылки ≥44pt', link.className.includes('min-h-[44px]'))

  // 3. подвал
  check('плашки с именем продукта в подвале нет',
    !el.textContent.includes('МАСТЕРПЛАН') && !el.textContent.includes('Мастерплан') &&
    !el.textContent.includes('УЛЬТРА') && !el.querySelector('.rounded-full.border-2'))
  check('логотип «Модуль роста» на месте',
    /Модуль роста/.test(el.querySelector('[data-test="access-footer-link"]')?.getAttribute('aria-label') || ''))

  // 4. v2: тёмная витрина — скоупом, а не глобальной темой
  const rootEl = el.querySelector('[data-test="access-root"]')
  check('тёмная витрина навешена на корень экрана, а не на <html>',
    !!rootEl && rootEl.getAttribute('data-theme') === 'auth-dark' &&
    document.documentElement.getAttribute('data-theme') === null)
  const akSrc = readFileSync(resolve(root, 'src/components/AccessKeyForm.vue'), 'utf8')
  const tpl = akSrc.slice(akSrc.indexOf('<template>'))
  // комментарии-объяснения цитируют значения токенов — смотрим только саму разметку
  const tplCode = tpl.replace(/<!--[\s\S]*?-->/g, '')
  check('в разметке экрана нет ни одного hex — только токены',
    !/#[0-9a-fA-F]{3,8}\b/.test(tplCode), (tplCode.match(/#[0-9a-fA-F]{3,8}\b/) || [])[0])
  check('поля темнее карточки (--surface-2 на --surface), как на мокапе',
    tpl.includes('bg-[var(--surface-2)]') && tpl.includes('bg-[var(--surface)]'))
  // placeholder остался ровно один — у кода доступа: логин теперь фиксирован
  check('placeholder ходит по своему токену (поднят по контрасту отдельно от подписи)',
    (tpl.match(/placeholder:text-\[var\(--placeholder\)\]/g) || []).length === 1)

  // ошибка — единственный цветной элемент
  const er = mount(bundle.AccessKeyForm, { error: true })
  await nextTick()
  const errEl = er.el.querySelector('[data-test="access-error"]')
  check('текст ошибки — «Неверный код доступа» (поле и ошибка одним словом)',
    !!errEl && errEl.textContent.includes('Неверный код доступа'))
  check('ошибка красная — единственный цвет экрана',
    errEl.className.includes('text-[var(--negative)]'))
  const colored = [...er.el.querySelectorAll('*')].filter((n) =>
    /--negative|--positive|--info|--warning|--accent\)/.test(n.className || ''))
  check('красным подсвечена и рамка полей — сообщение говорит ЧТО, рамка ГДЕ',
    (er.el.querySelector('[data-test="access-fields"]').className || '').includes('border-[var(--negative)]'))
  const ok = mount(bundle.AccessKeyForm, { error: false })
  await nextTick()
  check('без ошибки рамка обычная',
    (ok.el.querySelector('[data-test="access-fields"]').className || '').includes('border-[var(--line)]'))
  ok.app.unmount()
  check('цветное — только сигнал ошибки и главная кнопка, больше ничего',
    colored.every((n) => n.closest('[data-test="access-error"]') ||
      n.dataset.test === 'access-submit' || n.dataset.test === 'access-fields'),
    colored.length + ' шт')
  er.app.unmount()
  app.unmount()
}

console.log('\n=== D-21 v2: тёмная витрина входа ===')
{
  const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8')
  const scope = (css.match(/\[data-theme="auth-dark"\]\s*{[^}]*}/) || [])[0] || ''
  check('скоуп auth-dark объявлен в токенах (единственное место с hex)', !!scope)
  const tok = (name) => (scope.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1]
  const want = { bg: '#0A0A0A', surface: '#161616', 'surface-2': '#0F0F0F', line: '#2A2A2A', text: '#F2F2F2', rim: '#383838' }
  for (const [k, v] of Object.entries(want))
    check(`--${k} = ${v} (по палитре v2)`, tok(k) === v, tok(k))
  check('жёлтого на витрине входа нет: --accent переопределён в белый',
    tok('accent') === '#F2F2F2' && tok('accent-ink') === '#0A0A0A')
  check('тёмная тема НЕ разлита по приложению (скоуп на компоненте, html чист)',
    !/^html\[data-theme|:root\s*{[^}]*#0A0A0A/m.test(css))

  const app = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
  check('theme-color переключает App по состоянию гейта, а не форма входа',
    /setThemeColor\(authed\.value \? APP_THEME_COLOR : AUTH_THEME_COLOR\)/.test(app))
  check('экран загрузки тоже тёмный — между ним и входом не мигает',
    /data-theme="auth-dark"[\s\S]{0,160}aria-busy/.test(app))
  const mf = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8'))
  check('сплэш тёмный: theme_color и background_color манифеста = #0A0A0A',
    mf.theme_color === '#0A0A0A' && mf.background_color === '#0A0A0A')
  check('стартовый theme-color в index.html тёмный (приложение открывается входом)',
    /name="theme-color"\s+content="#0A0A0A"/.test(readFileSync(resolve(root, 'index.html'), 'utf8')))
}

console.log('\n=== D-21 v2: контраст тёмной витрины (WCAG, посчитан) ===')
{
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const D = {
    bg: '#0A0A0A', card: '#161616', field: '#0F0F0F', text: '#F2F2F2',
    sec: '#9A9A9A', ph: '#808080', btn: '#F2F2F2', btnInk: '#0A0A0A', err: '#FF5C4D',
  }
  for (const [name, fg, bg] of [
    ['логотип: --text на --bg', D.text, D.bg],
    ['ярлык ДОСТУП В СИСТЕМУ: --text-secondary на карточке', D.sec, D.card],
    ['вводимый текст: --text на поле', D.text, D.field],
    ['логин (readonly): --text-secondary на поле', D.sec, D.field],
    ['placeholder: --placeholder на поле', D.ph, D.field],
    ['кнопка СТАРТ: --accent-ink на --accent', D.btnInk, D.btn],
    ['ошибка: --negative на карточке', D.err, D.card],
  ]) {
    const r = ratio(fg, bg)
    check(`${name} ≥ 4.5:1`, r >= 4.5, r.toFixed(2) + ':1')
  }
  // почему не взяли значения из ТЗ буквально — числа, а не мнение
  check('placeholder из ТЗ (#5C5C5C) провалил бы порог — поднят осознанно',
    ratio('#5C5C5C', D.field) < 4.5, ratio('#5C5C5C', D.field).toFixed(2) + ':1')
  check('брендовый красный #D92D20 на карточке провалил бы порог — поднят осознанно',
    ratio('#D92D20', D.card) < 4.5, ratio('#D92D20', D.card).toFixed(2) + ':1')
}

console.log('\n=== D-21: самохостинг шрифтов и оффлайн ===')
{
  const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8')
  const faces = css.match(/@font-face\s*{[^}]*}/g) || []
  check('объявлены три начертания: бренд, ярлыки, моно', faces.length === 3, faces.length)
  check('у всех font-display: swap (текст виден, пока грузится шрифт)',
    faces.every((f) => /font-display:\s*swap/.test(f)))
  check('все источники — свои файлы из /fonts', faces.every((f) => /url\('\/fonts\//.test(f)))
  // «с CDN ничего не грузится» — проверяем весь текстовый исходник, а не один файл
  const CDN = /fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.bunny|cdn\.jsdelivr[^\s'"]*font/i
  const walk = (dir, acc = []) => {
    for (const name of readdirSync(dir)) {
      const p = resolve(dir, name)
      if (statSync(p).isDirectory()) walk(p, acc)
      else if (/\.(vue|js|css|html|json)$/.test(name)) acc.push(p)
    }
    return acc
  }
  // Автономные пульты в public/*.html — отдельные статические страницы, не часть
  // приложения (свой рендер чисел, открываются напрямую). Требование ТЗ про CDN
  // относится к приложению; пульты считаем отдельно и НЕ прячем — если там появится
  // внешний шрифт, чек это назовёт, а не промолчит.
  const isPult = (p) => /public\/[^/]+\.html$/.test(p)
  const sources = [...walk(resolve(root, 'src')), ...walk(resolve(root, 'public')), resolve(root, 'index.html')]
  const appSources = sources.filter((p) => !isPult(p))
  const cdnHits = appSources.filter((p) => CDN.test(readFileSync(p, 'utf8')))
  check(`приложение: шрифты ниоткуда не подгружаются извне (файлов: ${appSources.length})`,
    cdnHits.length === 0, cdnHits[0] || 'чисто')
  const pultHits = sources.filter((p) => isPult(p) && CDN.test(readFileSync(p, 'utf8')))
  // НЕ роняем приёмку: это не регресс этой задачи, а унаследованное состояние
  // (пульт тянет Inter/Montserrat/Space Mono с Google Fonts — их у нас нет в
  // самохостинге, замена = отдельная задача, заведена в BACKLOG п. 7).
  // Но и молчать нельзя: строка печатается каждый прогон.
  console.log(pultHits.length === 0
    ? '✓  автономные пульты public/*.html: внешних шрифтов нет'
    : `ℹ  автономные пульты грузят шрифты с CDN — вне этой задачи, см. BACKLOG п. 7  (${pultHits.map((p) => p.split('/').pop()).join(', ')})`)
  const fonts = ['UniversLTCYR-67BoldCond.woff2', 'UniversLTCYR-67BoldCond.woff',
    'UniversLTCYR-57Condensed.woff2', 'UniversLTCYR-57Condensed.woff', 'RobotoMono-Regular.woff2']
  check('файлы шрифтов лежат в public/fonts (попадут в сборку и в репо)',
    fonts.every((f) => existsSync(resolve(root, 'public/fonts', f))), fonts.length + ' шт')
  check('шеврон лежит в public (docs/ в .gitignore — оттуда бы не задеплоился)',
    existsSync(resolve(root, 'public/runscale_chevron.svg')))
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
  check('woff2 и шеврон в precache — иначе в оффлайне лого уедет на фолбэк',
    ['UniversLTCYR-67BoldCond.woff2', 'UniversLTCYR-57Condensed.woff2', 'RobotoMono-Regular.woff2',
      'runscale_chevron.svg'].every((f) => sw.includes(f)))
  const tw = readFileSync(resolve(root, 'tailwind.config.js'), 'utf8')
  check('роли начертаний заведены в tailwind (font-brand / font-label / font-mono)',
    /brand:\s*\[/.test(tw) && /label:\s*\[/.test(tw) && /mono:\s*\[/.test(tw))
  check('у каждой роли есть фолбэк на время swap',
    (tw.match(/Ranscale (Display|Label|Mono)"',\s*'/g) || []).length === 3)
}

console.log('\n=== D-20: чип-переключатель бизнесов ===')
{
  check('в списке ровно один бизнес и он активный',
    BUSINESSES.length === 1 && ACTIVE_BUSINESS && ACTIVE_BUSINESS.id === 'bumbastik' && ACTIVE_BUSINESS.active === true)

  const { el, app } = mount(bundle.BusinessChip, { label: 'БУМБАСТИК' })
  await nextTick()
  const chip = el.querySelector('[data-test="business-chip"]')
  check('чип — кнопка с текстом «БУМБАСТИК»', !!chip && chip.tagName === 'BUTTON' && chip.textContent.includes('БУМБАСТИК'))
  check('до тапа выпадашки нет', !el.querySelector('[data-test="business-menu"]'))
  check('тач-таргет чипа ≥44pt (min-h-[44px])', chip.className.includes('min-h-[44px]'))
  // ревизия по референсу money.x.com
  const pill = el.querySelector('[data-test="business-chip-pill"]')
  check('капсула ниже кнопки (26px) — красится она, а не весь тач-таргет',
    !!pill && pill.className.includes('h-[26px]') && pill.className.includes('bg-[var(--graphite)]') &&
    !chip.className.includes('bg-['))
  check('стрелка двойная (вверх-вниз) — «переключить», а не «раскрыть»',
    !!chip.querySelector('svg') && !/rotate-180/.test(chip.innerHTML))
  const bcSrc = readFileSync(resolve(root, 'src/components/business/BusinessChip.vue'), 'utf8')
  check('иконка — ChevronsUpDown, одинарного ChevronDown не осталось',
    bcSrc.includes('ChevronsUpDown') && !/\bChevronDown\b/.test(bcSrc))
  check('ховер-подсветка строк только для мыши (на тач-экране :hover залипает)',
    /@media \(hover: hover\) and \(pointer: fine\)/.test(bcSrc) && /\.bc-menu-item:hover/.test(bcSrc))
  check('первый пункт НЕ фокусируется программно (иначе системное кольцо после тапа)',
    !/querySelector\('\[role="menuitem"\]'\)\?\.focus/.test(bcSrc))
  check('разделителя между пунктами больше нет — каждый пункт плашкой на фоне',
    !/h-px bg-\[var\(--line\)\]/.test(bcSrc) &&
    (bcSrc.match(/bg-\[var\(--surface-2\)\]/g) || []).length === 2)
  check('высота плашек одинаковая (56px), хотя строк текста разное число',
    (bcSrc.match(/min-h-\[56px\]/g) || []).length === 2)
  check('ховер меняет фон на отдельный токен, а не на цвет самой плашки',
    /background: var\(--surface-hover\)/.test(bcSrc))
  check('своё кольцо фокуса вместо системного (оно синее — цвет ОС, не наш токен)',
    (bcSrc.match(/outline-none focus-visible:ring-2/g) || []).length >= 3)

  await fire(chip, 'click')
  const menu = el.querySelector('[data-test="business-menu"]')
  check('тап открыл выпадающий список', !!menu)
  check('в списке активный бизнес «Бумбастик» с галкой',
    !!menu && menu.textContent.includes('Бумбастик') && !!menu.querySelector('[aria-label="Активный бизнес"]'))
  check('есть разделитель между списком и действием', !!menu.querySelector('[aria-hidden="true"]'))
  const connect = el.querySelector('[data-test="business-connect"]')
  check('пункт «Подключить бизнес» с подписью «с экспертом»',
    !!connect && connect.textContent.includes('Подключить бизнес') && connect.textContent.includes('с экспертом'))
  check('aria-expanded переключился', chip.getAttribute('aria-expanded') === 'true')

  await fire(connect, 'click')
  check('пункт закрыл список и открыл модалку',
    !el.querySelector('[data-test="business-menu"]') && !!document.querySelector('[data-test="connect-modal"]'))
  check('пункт виден без ролей + TODO на скрытие заложен комментарием, а не логикой',
    /TODO\(роли\)/.test(readFileSync(resolve(root, 'src/components/business/BusinessChip.vue'), 'utf8')))
  app.unmount()
  document.querySelectorAll('[data-test="connect-modal"]').forEach((n) => n.remove())
}

console.log('\n=== D-20: модалка «Подключить бизнес» ===')
{
  const { buildConnectBody, normalizeBusinessName, BUSINESS_NAME_MAX } = bundle
  check('normalizeBusinessName: обрезка по краям', normalizeBusinessName('  Кофейня  ') === 'Кофейня')
  check('normalizeBusinessName: пусто → пустая строка',
    normalizeBusinessName('   ') === '' && normalizeBusinessName(null) === '' && normalizeBusinessName(undefined) === '')
  check(`normalizeBusinessName: лимит ${BUSINESS_NAME_MAX} символов`,
    normalizeBusinessName('Я'.repeat(300)).length === BUSINESS_NAME_MAX)
  const body = buildConnectBody({ key: 'k', businessName: ' Бар Два ' })
  check('тело запроса: action=connect_request, business_name, source=front по умолчанию',
    body.action === 'connect_request' && body.business_name === 'Бар Два' && body.source === 'front' && body.key === 'k')

  const { el, app } = mount(bundle.ConnectBusinessModal, { open: true })
  await nextTick()
  const dlg = document.querySelector('[data-test="connect-modal"]')
  check('модалка: текст про эксперта Модуля Роста',
    !!dlg && dlg.textContent.includes('Эксперт Модуля Роста свяжется с вами'))
  const input = dlg.querySelector('[data-test="connect-input"]')
  const btn = dlg.querySelector('[data-test="connect-submit"]')
  check('модалка: ровно одно поле ввода', dlg.querySelectorAll('input').length === 1)
  check('модалка: поле «Название бизнеса» обязательное', !!input && input.hasAttribute('required'))
  check('модалка: ни тарифов, ни конфигуратора',
    !/тариф|Тариф|подписк|Подписк/.test(dlg.textContent))
  check('пустое поле → кнопка «Оставить заявку» заблокирована', btn.disabled === true)

  // отправка идёт через @submit.prevent формы; синтетический click по кнопке
  // в jsdom submit НЕ порождает — дёргаем событие формы напрямую
  const form = dlg.querySelector('form')
  const before = postedBodies.length
  await fire(form, 'submit')
  await flush()
  check('пустое название не уходит на бэк (и письма не будет)', postedBodies.length === before)

  // ошибка бэка: плашка есть, введённое название НЕ потеряно
  postMode = 'reject'
  input.value = 'Кофейня на Невском'
  await fire(input, 'input')
  await nextTick()
  check('поле заполнено → кнопка активна', btn.disabled === false)
  await fire(form, 'submit')
  await flush()
  check('ошибка бэка → плашка «Не удалось отправить, попробуйте ещё раз»',
    !!dlg.querySelector('[data-test="connect-error"]') &&
    dlg.querySelector('[data-test="connect-error"]').textContent.includes('Не удалось отправить'))
  check('после ошибки название в поле не потеряно',
    dlg.querySelector('[data-test="connect-input"]').value === 'Кофейня на Невском')

  // успех: тело контракта и состояние «Заявка отправлена»
  postMode = 'ok'
  await fire(dlg.querySelector('form'), 'submit')
  await flush()
  const sentBody = JSON.parse(postedBodies[postedBodies.length - 1])
  check('POST ушёл с action=connect_request и названием бизнеса',
    sentBody.action === 'connect_request' && sentBody.business_name === 'Кофейня на Невском', JSON.stringify(sentBody))
  check('POST несёт source=front и фразу доступа', sentBody.source === 'front' && !!sentBody.key)
  check('успех → «Заявка отправлена. Эксперт свяжется с вами.»',
    !!document.querySelector('[data-test="connect-done"]') &&
    document.querySelector('[data-test="connect-done"]').textContent.includes('Заявка отправлена'))
  check('после успеха форма схлопнулась (закрытие по таймеру)',
    !document.querySelector('[data-test="connect-input"]'))
  app.unmount()
  document.querySelectorAll('[data-test="connect-modal"]').forEach((n) => n.remove())
}

console.log('\n=== D-34: цель месяца в модели (month_goal) ===')
{
  const withGoal = computeDaily(sets['ohta:2025-05'])
  check('computeDaily отдаёт goal из month_goal', withGoal.goal === 1860000, withGoal.goal)
  check('goal ≠ T (цель и план — разные числа)', withGoal.goal !== withGoal.T, `${withGoal.goal} vs ${withGoal.T}`)
  check('planRealized = realizedRev + tailCum (план на сегодня)',
    Math.abs(withGoal.planRealized - (withGoal.realizedRev + withGoal.tailCum)) < 1e-6,
    Math.round(withGoal.planRealized))

  // Цели нет → null, а не 0 и не NaN: виджет должен отличить «нет цели» от «цель ноль».
  const noGoal = computeDaily({ ...sets['ohta:2025-05'], month_goal: undefined })
  check('нет month_goal → goal = null', noGoal.goal === null, String(noGoal.goal))
  const zeroGoal = computeDaily({ ...sets['ohta:2025-05'], month_goal: 0 })
  check('month_goal = 0 → goal = null (0 не цель)', zeroGoal.goal === null, String(zeroGoal.goal))
  const junkGoal = computeDaily({ ...sets['ohta:2025-05'], month_goal: 'нет' })
  check('битый month_goal → goal = null', junkGoal.goal === null, String(junkGoal.goal))

  const n = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
  const sumGoal = 1860000 + 3190000 + 1400000
  check('сеть: goal = Σ по паркам', n.totals.goal === sumGoal, n.totals.goal)
  check('сеть: goalParks = 3, goalPartial = false',
    n.totals.goalParks === 3 && n.totals.goalPartial === false, `${n.totals.goalParks}/${n.totals.goalPartial}`)

  // Ключевая защита: цель есть НЕ у всех парков → сумма врала бы (цель двух против факта трёх).
  const partial = { ...sets, 'iyun:2025-05': { ...sets['iyun:2025-05'], month_goal: undefined } }
  const np = computeNetwork(partial, ['ohta', 'piterland', 'iyun'])
  check('сеть: цель не у всех парков → goal = null (частичную сумму не показываем)',
    np.totals.goal === null, String(np.totals.goal))
  check('сеть: goalPartial = true подсказывает причину', np.totals.goalPartial === true)

  check('сеть: daysDone/daysTotal заполнены',
    Number.isFinite(n.totals.daysDone) && Number.isFinite(n.totals.daysTotal) && n.totals.daysTotal >= n.totals.daysDone,
    `${n.totals.daysDone}/${n.totals.daysTotal}`)
  check('сеть: planRealized = Σ по паркам',
    Math.abs(n.totals.planRealized - n.cards.reduce((a, c) => a + c.planRealized, 0)) < 1e-6,
    Math.round(n.totals.planRealized))
  // Регрессия: расширение totals не должно было тронуть существующие метрики.
  check('регрессия: target/earned/landing/landDev не изменились',
    n.totals.target === n.cards.reduce((a, c) => a + c.target, 0) &&
    n.totals.earned === n.cards.reduce((a, c) => a + c.earned, 0) &&
    Math.abs(n.totals.landDev - (n.totals.landing / n.totals.target - 1)) < 1e-9)
}

console.log('\n=== D-34: геометрия полосы (РЕГЛАМЕНТ-соответствие-полос-числам, И-1…И-7) ===')
{
  const EPS = 1e-9
  const near = (a, b) => Math.abs(a - b) < EPS

  // И-2 на ручном кейсе: проценты считаны отдельно, не «как получилось».
  const L1 = monthLayout({ fact: 1_000_000, plan: 1_550_000, forecast: 1_300_000, goal: 1_860_000 })
  check('И-1 scaleMax = максимум заданных значений', L1.scaleMax === 1_860_000, L1.scaleMax)
  check('И-2 факт: 1,00/1,86 = 53,7634…%', near(L1.factPct, 100_0000 / 1_860_000 * 100), L1.factPct)
  check('И-2 план: 1,55/1,86 = 83,3333…%', near(L1.planPct, 1_550_000 / 1_860_000 * 100), L1.planPct)
  check('И-2 прогноз: 1,30/1,86 = 69,8924…%', near(L1.forecastPct, 1_300_000 / 1_860_000 * 100), L1.forecastPct)
  check('И-5 цель = scaleMax → ровно 100', L1.goalPct === 100, L1.goalPct)
  check('цель = верх шкалы → goalIsEnd (отдельной метки не нужно)', L1.goalIsEnd === true)
  check('И-3 прогноз стыкуется: gapStart = factPct', near(L1.gapStart, L1.factPct))
  check('И-3 прогноз стыкуется: gapStart + gapWidth = forecastPct',
    near(L1.gapStart + L1.gapWidth, L1.forecastPct), L1.gapStart + L1.gapWidth)
  // Недобор до плана — тоже сегмент, и он обязан стыковаться без зазора и нахлёста.
  check('И-3 недобор стыкуется: shortStart = forecastPct', near(L1.shortStart, L1.forecastPct))
  check('И-3 недобор упирается в план: shortStart + shortWidth = planPct',
    near(L1.shortStart + L1.shortWidth, L1.planPct), L1.shortStart + L1.shortWidth)
  check('И-7 цепочка без разрывов: 0 → факт → прогноз → план',
    near(L1.factPct + L1.gapWidth + L1.shortWidth, L1.planPct),
    L1.factPct + L1.gapWidth + L1.shortWidth)

  // И-4/И-6 + вырожденные и инверсные случаи — свойство на случайных наборах.
  // Точечные кейсы ловят то, о чём подумали; свойство — то, о чём не подумали.
  let bad = null, n = 0
  const pick = (r) => (r < 0.12 ? null : r < 0.2 ? 0 : Math.round(r * 4_000_000))
  for (let i = 0; i < 400 && !bad; i++) {
    const v = {
      fact: pick(Math.random()), plan: pick(Math.random()),
      forecast: pick(Math.random()), goal: pick(Math.random()),
    }
    // равенства и «инверсии» подмешиваем намеренно, случайно они почти не выпадут
    if (i % 5 === 0 && v.plan) v.goal = v.plan
    if (i % 7 === 0 && v.fact) v.forecast = v.fact
    if (i % 11 === 0 && v.goal) v.forecast = v.goal * 1.4
    const L = monthLayout(v)
    n++
    const present = [['fact', v.fact], ['plan', v.plan], ['forecast', v.forecast], ['goal', v.goal]]
      .filter(([, x]) => x != null && x > 0)
    const key = { fact: 'factPct', plan: 'planPct', forecast: 'forecastPct', goal: 'goalPct' }
    const fail = (m) => { bad = `${m} · ${JSON.stringify(v)} → ${JSON.stringify(L)}` }

    if (!present.length) { if (!L.empty) fail('пустой набор не помечен empty'); continue }
    if (L.scaleMax !== Math.max(...present.map(([, x]) => x))) fail('И-1 scaleMax ≠ max')
    for (const [k, x] of present) {
      const p = L[key[k]]
      if (!near(p, (x / L.scaleMax) * 100)) fail(`И-2 ${k}: позиция ≠ v/scaleMax`)
      if (p < -EPS || p > 100 + EPS) fail(`И-6 ${k}: позиция вне [0,100]`)
      if (x === L.scaleMax && !near(p, 100)) fail(`И-5 ${k}: v = scaleMax, но позиция ≠ 100`)
    }
    // И-5: не задано → позиция null, а не 0
    for (const [k, x] of [['plan', v.plan], ['forecast', v.forecast], ['goal', v.goal]]) {
      if ((x == null || x <= 0) && L[key[k]] !== null) fail(`И-5 ${k}: нет значения, но позиция не null`)
    }
    // И-4 монотонность: сортировка по значению = сортировка по позиции
    const byVal = [...present].sort((a, b) => a[1] - b[1]).map(([k]) => k)
    const byPos = [...present].sort((a, b) => L[key[a[0]]] - L[key[b[0]]]).map(([k]) => k)
    if (byVal.join() !== byPos.join()) fail('И-4 порядок позиций ≠ порядку значений')
    // И-3/И-7 непрерывность штриховки
    if (L.forecastPct != null && !near(L.gapStart + L.gapWidth, Math.max(L.factPct, L.forecastPct))) {
      fail('И-3 конец штриховки ≠ позиции прогноза')
    }
    if (L.gapWidth < -EPS) fail('И-3 отрицательная ширина сегмента')
    if (L.shortWidth < -EPS) fail('И-3 отрицательная ширина недобора')
    if (L.planPct != null && L.forecastPct != null && L.planPct > L.forecastPct
        && !near(L.shortStart + L.shortWidth, L.planPct)) fail('И-3 недобор не упирается в план')
    if (L.planPct != null && L.forecastPct != null && L.planPct <= L.forecastPct
        && L.shortWidth > EPS) fail('прогноз перерос план, а недобор всё равно нарисован')
  }
  check(`И-1…И-7 держатся на ${n} случайных наборах (равенства, нули, null, инверсии)`, !bad, bad || 'чисто')

  // И-6 в рендере: метка на 100% прижимается ВНУТРЬ, иначе половина её ширины
  // уезжает за overflow и читается как хвост, торчащий из полосы.
  check('метка на 100% прижата внутрь (translateX(-100%))',
    markStyle(100).left === '100%' && markStyle(100).transform === 'translateX(-100%)')
  check('метка в середине центрируется', markStyle(50).transform === 'translateX(-50%)')
  check('метка на 0% не уезжает влево', markStyle(0).transform === 'translateX(0)')
  check('нет позиции → нет стиля', markStyle(null) === null)

  // §2 регламента: арифметики процентов в шаблоне быть не должно.
  const sfc = readFileSync(resolve(root, 'src/components/home/MonthProgressSlide.vue'), 'utf8')
  check('§2 геометрии в шаблоне нет (расчёт только в monthLayout.js)',
    !/\/\s*scaleMax|\*\s*100\b|Math\.min\(100|Math\.max\(0,/.test(sfc))

  // §4.4: числа полосы = агрегату модели, а не «переданы на глаз».
  const nw = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
  const sumF = nw.cards.reduce((a, c) => a + c.earned, 0)
  const sumL = nw.cards.reduce((a, c) => a + c.landing, 0)
  const sumT = nw.cards.reduce((a, c) => a + c.target, 0)
  const sumG = nw.cards.reduce((a, c) => a + c.goal, 0)
  check('§4.4 сетевая полоса строится на суммах парков (факт/прогноз/план/цель)',
    nw.totals.earned === sumF && nw.totals.landing === sumL &&
    nw.totals.target === sumT && nw.totals.goal === sumG,
    `${sumF}/${sumL}/${sumT}/${sumG}`)
}

console.log('\n=== jsdom: D-34 — слайд месяца (полосы и метки) ===')
{
  const P = { fact: 1_000_000, plan: 1_550_000, forecast: 1_300_000, goal: 1_860_000 }
  const app = mount(bundle.MonthProgressSlide, P)
  const card = document.querySelector('[role="img"]')
  check('дорожка денег отрисована с aria-label', !!card && card.getAttribute('aria-label').includes('Цель'))
  const labels = [...document.querySelectorAll('span')].map((n) => n.textContent.trim())
  check('есть все четыре подписи', ['Факт', 'Прогноз', 'План', 'Цель'].every((l) => labels.includes(l)))
  check('процентов на слайде нет (не дублируем виджеты)', !document.body.textContent.includes('%'))
  const fills = [...document.querySelectorAll('div')].filter((n) => n.className.includes('bg-[var(--accent)]'))
  check('заливка факта — жёлтая, ширина = факт/максимум (1,0 из 1,86 млн ≈ 53,8%)',
    fills.length > 0 && fills[0].style.width.startsWith('53.7'), fills[0] && fills[0].style.width)
  check('внутренние края прямые: у заливки нет rounded (иначе серп на стыке)',
    !fills[0].className.includes('rounded'), fills[0].className)
  // Трек — вложенный элемент: внешний контейнер держит воздух для штриха плана,
  // который обязан выходить за полосу, поэтому overflow-hidden только у трека.
  const track = document.querySelector('[data-test="track"]')
  check('скругление и обрезка — у трека, не у внешнего контейнера',
    !!track && track.className.includes('overflow-hidden') && track.className.includes('rounded-full')
    && !document.querySelector('[role="img"]').className.includes('overflow-hidden'))
  check('хардкод hex в слайде отсутствует (только токены)',
    !readFileSync(resolve(root, 'src/components/home/MonthProgressSlide.vue'), 'utf8').match(/#[0-9a-fA-F]{6}\b/))
  const darkMarks = [...document.querySelectorAll('div')].filter((n) => n.className.includes('bg-[var(--text)]'))
  // Тёмного торца у факта больше нет: он спорил с порогом за роль «метка».
  // Границу несёт штриховка прогноза — 3,34:1 на жёлтом (посчитано по WCAG).
  const fseg = document.querySelector('[data-test="seg-forecast"]')
  check('тёмной риски между фактом и прогнозом нет — границу несёт штриховка',
    !darkMarks.some((n) => n.style.left && parseFloat(n.style.left) > 53 && parseFloat(n.style.left) < 54),
    darkMarks.map((n) => n.style.left).join(' '))
  check('прогноз — светло-жёлтая заливка ИЗ ТОКЕНОВ + точечная сыпь',
    !!fseg && fseg.style.backgroundColor.includes('color-mix') && fseg.style.backgroundColor.includes('--accent')
    && fseg.style.backgroundImage.includes('radial-gradient'),
    fseg && fseg.style.backgroundColor)
  // bullet chart: цель = верх шкалы, отдельной метки у неё НЕТ.
  check('цель = верх шкалы → метки цели на полосе нет (длина полосы и есть цель)',
    !document.querySelector('[data-test="mark-goal"]'))
  const pm = document.querySelector('[data-test="mark-plan"]')
  check('план — порог bullet chart: штрих есть и стоит в своей точке (83,33%)',
    !!pm && pm.style.left === (1_550_000 / 1_860_000 * 100) + '%', pm && pm.style.left)
  // Роль кодируется ФОРМОЙ, а не позицией: когда план близок к цели, штрих
  // прижимается к концу шкалы и без каретки читается как торец полосы.
  const pc = document.querySelector('[data-test="caret-plan"]')
  check('у порога есть каретка сверху — опознаётся как метка, а не торец полосы', !!pc)
  check('каретка — SVG со скруглёнными углами (у CSS-бордера углы не скруглить)',
    !!pc && pc.tagName.toLowerCase() === 'svg'
    && pc.querySelector('path').getAttribute('stroke-linejoin') === 'round')
  check('каретка ОТДЕЛЕНА от штриха зазором (не слиплись)',
    !!pc && pc.getAttribute('class').includes('top-0') && pm.className.includes('top-[7px]'),
    pm.className.match(/top-\S+/)?.[0])
  check('каретка стоит РОВНО над штрихом (позиция и transform совпадают)',
    !!pc && pc.style.left === pm.style.left && pc.style.transform === pm.style.transform,
    pc && `${pc.style.left}/${pc.style.transform}`)
  check('штрих плана ВНЕ трека — пересекает полосу, а не спрятан под overflow',
    !!pm && !pm.parentElement.className.includes('overflow-hidden')
    && pm.parentElement.querySelector('[data-test="track"]'))
  check('прогноз начинается ровно на конце факта', fseg.style.left.startsWith('53.7'), fseg.style.left)
  check('ширина прогноза = прогноз − факт (≈16,1 п.п.)', fseg.style.width.startsWith('16.1'), fseg.style.width)
  check('фактура прогноза серая (--text-muted) — она и держит контраст',
    fseg.style.backgroundImage.includes('--text-muted'))
  // НЕДОБОР ДО ПЛАНА — точки от прогноза до порога: пролёт не должен быть «пустотой».
  const sseg = document.querySelector('[data-test="seg-short"]')
  check('пролёт «прогноз → план» закрашен полосками, а не пуст',
    !!sseg && sseg.style.backgroundImage.includes('repeating-linear-gradient'), sseg && sseg.style.backgroundImage)
  check('у зоны недобора есть подложка — иначе не читаются её границы',
    !!sseg && sseg.style.backgroundColor.includes('color-mix') && sseg.style.backgroundColor.includes('--line'),
    sseg && sseg.style.backgroundColor)
  check('недобор начинается на прогнозе и упирается в план',
    !!sseg && sseg.style.left === fseg.style.left.replace(/[\d.]+/, String(parseFloat(fseg.style.left) + parseFloat(fseg.style.width)))
      || (!!sseg && Math.abs(parseFloat(sseg.style.left) - (parseFloat(fseg.style.left) + parseFloat(fseg.style.width))) < 1e-9),
    sseg && `${sseg.style.left} + ${sseg.style.width}`)
  check('фактуры разные: у прогноза точки, у недобора полоски',
    !!sseg && sseg.style.backgroundImage.includes('--text-muted')
    && !sseg.style.backgroundImage.includes('radial-gradient'))
  app.app.unmount(); document.body.innerHTML = ''

  const app2 = mount(bundle.MonthProgressSlide, { ...P, goal: null })
  const labels2 = [...document.querySelectorAll('span')].map((n) => n.textContent.trim())
  check('нет цели → колонки «Цель» нет', !labels2.includes('Цель'))
  check('нет цели → остальные три на месте', ['Факт', 'Прогноз', 'План'].every((l) => labels2.includes(l)))
  const fills2 = [...document.querySelectorAll('div')].filter((n) => n.className.includes('bg-[var(--accent)]'))
  check('нет цели → шкала до плана (1,0 из 1,55 млн ≈ 64,5%)',
    fills2.length > 0 && fills2[0].style.width.startsWith('64.5'), fills2[0] && fills2[0].style.width)
  app2.app.unmount(); document.body.innerHTML = ''

  // План вплотную к цели (случай Питерленда: 7,5 при 7,7) и план = цели (ТЦ Июнь):
  // именно здесь штрих раньше сливался с концом полосы и владелец спросил,
  // что это за чёрная полоска.
  const tight = mount(bundle.MonthProgressSlide, { ...P, plan: 1_840_000, goal: 1_860_000 })
  const tm = document.querySelector('[data-test="mark-plan"]')
  const tc = document.querySelector('[data-test="caret-plan"]')
  check('план вплотную к цели → каретка на месте, метка не сливается с торцом',
    !!tc && tc.style.left === tm.style.left, tm && tm.style.left)
  tight.app.unmount(); document.body.innerHTML = ''

  const flush = mount(bundle.MonthProgressSlide, { ...P, plan: 1_860_000, goal: 1_860_000 })
  const fm = document.querySelector('[data-test="mark-plan"]')
  const fc = document.querySelector('[data-test="caret-plan"]')
  check('план = цели = верх шкалы → штрих и каретка прижаты ВНУТРЬ, не торчат',
    !!fc && fm.style.transform === 'translateX(-100%)' && fc.style.transform === 'translateX(-100%)',
    fc && fc.style.transform)
  flush.app.unmount(); document.body.innerHTML = ''

  const app3 = mount(bundle.MonthProgressSlide, { ...P, forecast: 2_000_000 })
  const marks = [...document.querySelectorAll('div')].filter((n) => n.style.left)
  check('прогноз > цели → все метки в пределах 0–100%',
    marks.length >= 3 && marks.every((n) => parseFloat(n.style.left) <= 100), marks.map((n) => n.style.left).join(' '))
  check('прогноз > цели → метка цели ВОЗВРАЩАЕТСЯ (она больше не верх шкалы)',
    !!document.querySelector('[data-test="mark-goal"]'))
  check('прогноз > цели → цель ушла ВНУТРЬ шкалы (1,86 из 2,0 = 93%)',
    marks.some((n) => n.style.left === '93%' && n.style.transform === 'translateX(-50%)'))
  app3.app.unmount(); document.body.innerHTML = ''
}

console.log('\n=== jsdom: D-34 — состояния порогов (совпадение и достижение) ===')
{
  const B = { fact: 1_000_000, plan: 1_550_000, forecast: 1_300_000, goal: 1_860_000 }
  const cols = () => [...document.querySelectorAll('span')].map((n) => n.textContent.trim())
  const marks = () => [...document.querySelectorAll('div')].filter((n) => n.style.left)

  // ЦЕЛЬ = ПЛАН (штатно у парка без планировщика, так сейчас у ТЦ Июнь).
  const a = mount(bundle.MonthProgressSlide, { ...B, plan: 1_550_000, goal: 1_550_000 })
  check('цель = плану → одна колонка «План и цель», а не две с одним числом',
    cols().includes('План и цель') && !cols().includes('План') && !cols().includes('Цель'))
  a.app.unmount(); document.body.innerHTML = ''

  // ТРИ СОВПАВШИЕ ВЕЛИЧИНЫ — реальный случай ТЦ Июнь: прогноз 3,0 = план 3,0 =
  // цель 3,0. Раньше рядом стояли два чипа с одинаковым «₽3,0 млн».
  const trio = mount(bundle.MonthProgressSlide,
    { fact: 2_700_000, forecast: 3_000_000, plan: 3_000_000, goal: 3_000_000 })
  check('три совпавшие величины → одна колонка «Прогноз, план и цель»',
    cols().includes('Прогноз, план и цель'), cols().filter((x) => x.length > 3).join(' | '))
  check('три совпавшие → колонок ДВЕ, дублей чисел нет',
    document.querySelectorAll('[data-test="legend-chip"]').length === 2,
    document.querySelectorAll('[data-test="legend-chip"]').length)
  const trioChips = [...document.querySelectorAll('[data-test="legend-chip"]')]
  await fire(trioChips[1], 'click')
  check('БАГ ИСПРАВЛЕН: тап по «Прогноз, план и цель» обводит ВЕСЬ трек',
    !!document.querySelector('[data-test="scale-ring"]'))
  trio.app.unmount(); document.body.innerHTML = ''

  const a2 = mount(bundle.MonthProgressSlide, { ...B, plan: 1_550_000, goal: 1_550_000 })
  const mergedChip = [...document.querySelectorAll('[data-test="legend-chip"]')].at(-1)
  await fire(mergedChip, 'click')
  check('БАГ ИСПРАВЛЕН: «План и цель» = вся шкала → обводка трека включается',
    !!document.querySelector('[data-test="scale-ring"]'))
  a2.app.unmount(); document.body.innerHTML = ''

  const a3 = mount(bundle.MonthProgressSlide, { ...B, plan: 1_550_000, goal: 1_550_000 })
  check('цель = плану → колонок три, а не четыре',
    document.querySelectorAll('[data-test="legend-chip"]').length === 3,
    document.querySelectorAll('[data-test="legend-chip"]').length)
  // Считаем именно МЕТКИ (mark-*), каретка — их спутник, а не отдельная метка.
  check('цель = плану → в этой точке одна метка, дубля не рисуем',
    [...document.querySelectorAll('[data-test^="mark-"]')].filter((n) => n.style.left === '100%').length === 1,
    [...document.querySelectorAll('[data-test^="mark-"]')].map((n) => n.dataset.test + '@' + n.style.left).join(' '))
  a3.app.unmount(); document.body.innerHTML = ''

  // ПЛАН ВЗЯТ ФАКТОМ, цель ещё нет.
  const b = mount(bundle.MonthProgressSlide, { ...B, fact: 1_600_000, forecast: 1_700_000 })
  // ВНИМАНИЕ: числа форматируются с русской десятичной запятой («₽1,6 млн»),
  // поэтому регулярки вида /План[^,]*взято/ ломаются на ней. Режем по «, »
  // (запятая+пробел): десятичная запятая всегда идёт перед цифрой, разделитель — перед пробелом.
  const doneOf = (arr, label) => arr.some((x) => x.startsWith(label + ' ') && x.endsWith('взято'))
  const parts2 = document.querySelector('[role="img"]').getAttribute('aria-label').split(', ')
  check('факт ≥ плана → у плана «взято», у цели нет',
    doneOf(parts2, 'План') && !doneOf(parts2, 'Цель'), parts2.join(' | '))
  check('взятый порог помечен галочкой (одна, не две)',
    document.querySelectorAll('svg.lucide-check').length === 1,
    document.querySelectorAll('svg.lucide-check').length)
  b.app.unmount(); document.body.innerHTML = ''

  // ЦЕЛЬ ВЗЯТА ФАКТОМ — шкала обязана растянуться до факта, иначе метка цели у края.
  const c = mount(bundle.MonthProgressSlide, { ...B, fact: 2_000_000, forecast: 2_000_000 })
  const fill = [...document.querySelectorAll('div')].filter((n) => n.className.includes('bg-[var(--accent)]'))[0]
  check('факт перерос цель → шкала до факта, заливка 100%', fill.style.width === '100%', fill.style.width)
  check('факт перерос цель → метка цели ушла ВНУТРЬ (1,86 из 2,0 = 93%)',
    marks().some((n) => n.style.left === '93%'), marks().map((n) => n.style.left).join(' '))
  check('и план, и цель помечены «взято» — две галочки',
    document.querySelectorAll('svg.lucide-check').length === 2,
    document.querySelectorAll('svg.lucide-check').length)
  const parts3 = document.querySelector('[role="img"]').getAttribute('aria-label').split(', ')
  check('состояние «взято» ушло в aria-label (скринридер получает результат, не только числа)',
    doneOf(parts3, 'Цель') && doneOf(parts3, 'План'), parts3.join(' | '))
  check('факт = прогнозу → штриховки нет (добирать нечего)',
    [...document.querySelectorAll('div')].filter((n) => (n.style.backgroundImage || '').includes('repeating')).length === 0)
  c.app.unmount(); document.body.innerHTML = ''

  // Ничего не взято — галочек нет вовсе.
  const d = mount(bundle.MonthProgressSlide, B)
  check('ничего не взято → галочек нет', document.querySelectorAll('svg.lucide-check').length === 0)
  d.app.unmount(); document.body.innerHTML = ''

  // Реальный набор мока: у Июня план и цель совпадают.
  const iy = computeDaily(sets['iyun:2025-05'])
  check('мок: у Июня план = цели (штатный случай, а не дефект данных)', iy.T === iy.goal, `${iy.T}/${iy.goal}`)
  const e = mount(bundle.MonthProgressSlide, {
    fact: iy.realizedRev, plan: iy.T, forecast: iy.landing, goal: iy.goal,
  })
  check('мок Июня → «План и цель» одной колонкой', cols().includes('План и цель'))
  e.app.unmount(); document.body.innerHTML = ''
}

console.log('\n=== jsdom: D-34 — чипы легенды и подсветка по тапу ===')
{
  const app = mount(bundle.MonthProgressSlide,
    { fact: 1_000_000, plan: 1_550_000, forecast: 1_300_000, goal: 1_860_000 })
  const chips = [...document.querySelectorAll('[data-test="legend-chip"]')]
  check('чипов столько же, сколько значений', chips.length === 4, chips.length)
  const boxes = chips.map((c) => c.querySelector('i'))
  check('все глифы — квадраты одного размера с обводкой',
    boxes.every((b) => b.className.includes('h-[14px]') && b.className.includes('w-[14px]') && b.className.includes('border')),
    boxes.map((b) => b.className.match(/h-\[\d+px\]/)?.[0]).join(' '))
  check('чипы — кнопки, по умолчанию не нажаты',
    chips.every((c) => c.tagName === 'BUTTON' && c.getAttribute('aria-pressed') === 'false'))
  check('без выбора ничего не приглушено',
    document.querySelectorAll('.opacity-10').length === 0)

  const glyphBg = (i) => chips[i].querySelector('i').className
  check('глифы порога и эталона — кусок трека, а не пустой чекбокс',
    glyphBg(2).includes('bg-[var(--surface-2)]') && glyphBg(3).includes('bg-[var(--surface-2)]'),
    glyphBg(3))
  // Порог = стрелка (та же каретка, что на полосе); эталон = рамка по периметру
  // (цель — не точка на шкале, а вся её протяжённость).
  // Глиф порога — ТОЧКИ, та же фактура, что у зоны недобора на полосе: чип
  // обозначает путь до плана («сколько ещё нужно»), а не саму риску.
  check('глиф порога — та же фактура, что у зоны недобора (полоски)',
    chips[2].querySelector('i i').style.backgroundImage.includes('repeating-linear-gradient'),
    chips[2].querySelector('i i').style.backgroundImage)
  // Квадрат эталона МЕНЬШЕ чипа: во всю ширину его углы срезала обводка чипа.
  check('глиф эталона — рамка, и она не обрезается обводкой чипа',
    chips[3].querySelector('i i').className.includes('border-[1.5px]')
    && chips[3].querySelector('i i').className.includes('h-2'),
    chips[3].querySelector('i i').className)
  check('выбранный чип получает серую плашку — видно, что тап сработал',
    chips.every((c) => !c.className.includes('bg-[var(--surface-2)]')))
  check('чипы гасят системное кольцо фокуса и ставят своё',
    chips.every((c) => c.className.includes('outline-none') && c.className.includes('focus-visible:ring-2')))

  const track = () => document.querySelector('[data-test="track"]')
  const seg = (n) => document.querySelector(`[data-test="seg-${n}"]`)
  const dimmed = (el) => !!el && el.className.includes('opacity-10')
  check('без выбора трек обычной высоты', track().className.includes('h-3'))

  await fire(chips[1], 'click') // второй по шкале — прогноз
  check('тап по чипу → он помечен нажатым', chips[1].getAttribute('aria-pressed') === 'true')
  check('тап по чипу → обводка чипа стала контрастной',
    chips[1].querySelector('i').className.includes('border-[var(--text)]'))
  check('тап по чипу → под ним появилась серая плашка (тап явно сработал)',
    chips[1].className.includes('bg-[var(--surface-2)]'), chips[1].className)
  // РАЗМЕРЫ НЕ МЕНЯЮТСЯ: рост полосы перестраивал масштаб, глаз терял опору.
  check('подсветка НЕ меняет высоту полосы (размеры постоянны)',
    track().className.includes('h-3') && !track().className.includes('h-[18px]'),
    track().className.match(/h-\S+/)?.[0])
  // НАКОПЛЕННАЯ ДЛИНА: чип «Прогноз» = ₽4,5 млн, это вся выручка месяца по
  // прогнозу, а не прирост над фактом. Значит гореть должен и факт тоже.
  check('подсветка прогноза светит ОТ НУЛЯ: факт горит вместе с ним',
    !dimmed(document.querySelector('[data-test="track"] div')))
  check('подсветка прогноза гасит то, что ЗА ним (недобор до плана)', dimmed(seg('short')))
  check('сам прогноз не приглушён', !dimmed(seg('forecast')))
  await fire(chips[1], 'click')
  check('повторный тап снимает подсветку',
    chips[1].getAttribute('aria-pressed') === 'false' && document.querySelectorAll('.opacity-10').length === 0)

  await fire(chips[2], 'click') // план
  check('подсветка плана светит от нуля: факт, прогноз и недобор — все горят',
    !dimmed(seg('forecast')) && !dimmed(seg('short')))
  await fire(chips[2], 'click')

  await fire(chips[0], 'click') // факт
  check('подсветка факта гасит и прогноз, и недобор (они ЗА фактом)',
    dimmed(seg('forecast')) && dimmed(seg('short')))
  await fire(chips[0], 'click')

  // ГЛАВНЫЙ ДЕФЕКТ ПЕРВОЙ ВЕРСИИ: у цели нет метки (она = длина шкалы), поэтому
  // тап по ней гасил всё и не зажигал ничего — выглядел как сломанный.
  await fire(chips[3], 'click') // цель
  // Обводка — отдельный слой ВНУТРИ трека: ring на самом треке — это box-shadow
  // снаружи, и у полосы, прижатой к краю карты, он вылезал за её границы.
  const ring = () => document.querySelector('[data-test="scale-ring"]')
  check('тап по ЦЕЛИ → шкала обведена (она и есть цель)', !!ring())
  check('обводка рисуется ВНУТРЬ и не вылезает за карту',
    !!ring() && ring().className.includes('ring-inset') && ring().parentElement.className.includes('overflow-hidden'),
    ring() && ring().className)
  check('тап по ЦЕЛИ → метки на конце НЕТ: обводки достаточно, метка читалась артефактом',
    !document.querySelector('[data-test="mark-goal"]'))
  await fire(chips[3], 'click')
  check('снятие выбора убирает обводку', !ring())

  await fire(chips[2], 'click') // план
  const pmk = document.querySelector('[data-test="mark-plan"]')
  check('подсветка НЕ утолщает штрих порога — размеры элементов постоянны',
    pmk.className.includes('w-[2px]') && !pmk.className.includes('w-[4px]'), pmk.className)
  await fire(chips[2], 'click')
  app.app.unmount(); document.body.innerHTML = ''
}

console.log('\n=== D-34: порядок парков в деке (ближе к плану — раньше) ===')
{
  const nw = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
  const rank = (c) => (c.target ? c.landing / c.target : -Infinity)
  const sorted = [...nw.cards].sort((a, b) => rank(b) - rank(a))
  const ranks = sorted.map((c) => rank(c))
  check('порядок убывающий по прогноз/план (последний — самый отстающий)',
    ranks.every((v, i) => i === 0 || ranks[i - 1] >= v), ranks.map((v) => (v * 100).toFixed(1) + '%').join(' → '))
  check('сортировка не теряет и не дублирует парки',
    sorted.length === nw.cards.length && new Set(sorted.map((c) => c.park)).size === nw.cards.length)
  // Парк без плана сравнивать не с чем — уходит в конец, но не пропадает.
  const noPlan = [...nw.cards, { park: 'x', target: 0, landing: 5 }]
  const s2 = [...noPlan].sort((a, b) => rank(b) - rank(a))
  check('парк без плана уходит в конец, а не выпадает',
    s2[s2.length - 1].park === 'x' && s2.length === noPlan.length)
}

console.log('\n=== jsdom: D-34 — дека месяца (свайп «Вся сеть → парки») ===')
{
  const netSlides = computeNetwork(sets, ['ohta', 'piterland', 'iyun'])
  const parkSlides = netSlides.cards.map((c) => ({
    key: c.park, title: c.parkName, fact: c.earned, plan: c.target, forecast: c.landing,
    goal: c.goal, daysDone: c.daysDone, daysTotal: c.daysTotal,
  }))
  const t0 = netSlides.totals
  const slides = [{ key: 'network', title: 'Вся сеть', fact: t0.earned, plan: t0.target,
    forecast: t0.landing, goal: t0.goal, daysDone: t0.daysDone, daysTotal: t0.daysTotal }, ...parkSlides]

  const app = mount(bundle.MonthProgressCard, { slides, month: '2025-05', loading: false })
  check('деку собрали: 1 сеть + 3 парка = 4 экрана', slides.length === 4, slides.length)
  const track = document.querySelector('[data-test="month-deck-track"]')
  check('лента прокрутки со снапом существует',
    !!track && track.className.includes('snap-x') && track.className.includes('snap-mandatory'))
  check('в ленте ровно 4 слайда', track && track.children.length === 4, track && track.children.length)
  check('главное в шапке — МЕСЯЦ (карта про месяц, парк лишь уточняет срез)',
    document.querySelector('h3').textContent.trim() === 'Май\u00A02025', document.querySelector('h3').textContent.trim())
  check('парк — второй строкой, не заголовком',
    document.querySelector('[data-test="month-deck-scope"]').textContent.trim() === 'Вся сеть')
  const badge = document.querySelector('[data-test="month-deck-days"]')
  check('дни — бейджем и про ОСТАТОК, а не про пройденное',
    !!badge && /^Осталось \d+ (день|дня|дней)$/.test(badge.textContent.trim()), badge && badge.textContent.trim())
  check('верхней дорожки времени больше нет (мешала основной полосе)',
    document.querySelectorAll('.h-1').length === 0)
  const dots = document.querySelector('[data-test="month-deck-dots"]')
  check('точек столько же, сколько экранов', !!dots && dots.children.length === 4, dots && dots.children.length)
  check('активна первая точка', !!dots && dots.children[0].getAttribute('aria-current') === 'true')
  check('каждый слайд подписан для скринридера («N из M»)',
    [...track.children].every((n, i) => (n.getAttribute('aria-label') || '').endsWith(`${i + 1} из 4`)),
    track.children[1].getAttribute('aria-label'))
  check('область тапа точки ≥24px (HIG: точка мелкая, кнопка растянута)',
    dots.children[0].className.includes('h-6') && dots.children[0].className.includes('w-6'))

  // Заголовок обязан следовать за прокруткой — иначе подпись врёт про числа.
  Object.defineProperty(track, 'clientWidth', { value: 400, configurable: true })
  track.scrollLeft = 800
  track.dispatchEvent(new dom.window.Event('scroll', { bubbles: true }))
  await nextTick()
  check('прокрутка на 3-й экран → срез сменился на имя парка',
    document.querySelector('[data-test="month-deck-scope"]').textContent.trim() === slides[2].title,
    document.querySelector('[data-test="month-deck-scope"]').textContent.trim())
  check('прокрутка → активная точка переехала',
    document.querySelector('[data-test="month-deck-dots"]').children[2].getAttribute('aria-current') === 'true')

  // Выделение относится к КОНКРЕТНОЙ полосе: таскать его на соседний парк —
  // врать про то, что выбрано. Дека сбрасывает подсветку при смене экрана.
  const firstChip = track.children[2].querySelector('[data-test="legend-chip"]')
  await fire(firstChip, 'click')
  check('на экране можно выбрать величину', firstChip.getAttribute('aria-pressed') === 'true')
  track.scrollLeft = 400
  track.dispatchEvent(new dom.window.Event('scroll', { bubbles: true }))
  await nextTick()
  check('смена экрана свайпом СБРАСЫВАЕТ подсветку',
    firstChip.getAttribute('aria-pressed') === 'false')
  await fire(firstChip, 'click')
  // jsdom не реализует Element.scrollTo — в браузере он есть, здесь глушим,
  // иначе тап в точку падает на плавной прокрутке, а не на проверяемой логике.
  track.scrollTo = () => {}
  document.querySelector('[data-test="month-deck-dots"]').children[0].click()
  await nextTick()
  check('тап в точку тоже сбрасывает подсветку', firstChip.getAttribute('aria-pressed') === 'false')
  app.app.unmount(); document.body.innerHTML = ''

  // Один парк — карусель из одного экрана обман: сетевой слайд и точки не нужны.
  const one = mount(bundle.MonthProgressCard, { slides: [parkSlides[0]], month: '2025-05', loading: false })
  check('один парк → точек нет', !document.querySelector('[data-test="month-deck-dots"]'))
  check('один парк → в срезе имя парка, в заголовке месяц',
    document.querySelector('[data-test="month-deck-scope"]').textContent.trim() === parkSlides[0].title
    && document.querySelector('h3').textContent.trim() === 'Май\u00A02025')
  one.app.unmount(); document.body.innerHTML = ''

  const load = mount(bundle.MonthProgressCard, { slides: [], month: '', loading: true })
  check('loading → скелетоны, ленты со снапом нет (пустая ловила бы жесты)',
    document.querySelectorAll('.bc-skeleton').length > 0 && !document.querySelector('[data-test="month-deck-track"]'))
  load.app.unmount(); document.body.innerHTML = ''
}

console.log('\n=== jsdom: D-34 — пилюли парков сняты с Главной ===')
{
  const src = readFileSync(resolve(root, 'src/screens/HomeScreen.vue'), 'utf8')
  check('в HomeScreen не осталось строки пилюль (parkNames)', !src.includes('parkNames'))
  check('месяц в шапке деки, monthCap из HomeScreen убран', !src.includes('monthCap'))
  check('дека получает слайды и месяц', src.includes(':slides="monthSlides"') && src.includes(':month="t.month'))
}

console.log('\n=== Vue warnings ===')
check('нет [Vue warn]', vueWarns.length === 0, vueWarns[0] || 'чисто')
console.warn = origWarn
rmSync(tmp, { recursive: true, force: true })

console.log('\n=== Итог ===')
console.log(ok ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(ok ? 0 : 1)
