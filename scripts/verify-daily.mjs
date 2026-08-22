// Локальная проверка приёмки под-страницы «Контроль дня».
// Запуск: `node scripts/verify-daily.mjs`.
//
// Работает на ВЫДУМАННОМ src/data/daily.mock.json (как verify-analytics.mjs на своём
// моке) — пинует МАТ-ИНВАРИАНТЫ модели, не реальные бизнес-числа (граница: реальные
// значения в публичный scripts/ не кладутся; сверка с пультами — приватный шаг «уровня B»).
//
// Инварианты: Σплан=цель (РОВНО без замка плана; с ним — допуск округления контура B) ·
// план закрытого дня не переписывается при переснятии погоды (NET-87) ·
// sigClass 1.00/0.85 (зел/жёлт/крас) ·
// journal[-1].landing === round(model.landing) · адаптивные колонки метрик ·
// goalState v2.1 §5 (out/record/ok, границы ×1.001 к maxObs и ×1.25 к implied).

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { computeDaily, computeNetwork, sigClass, isMeasuring, eventKind as bundleEventKind } from '../src/composables/dailyModel.js'
import { monthLayout, markStyle } from '../src/composables/monthLayout.js'
import { daysInMonth, daysLeftInMonth, mskToday } from '../src/composables/monthDays.js'
import { driversMeasureSignal, driversSwitches, markTitle, ths, thsSigned } from '../src/i18n/daily.js'
import {
  sortSignals, latestSignal, feedSignals, statusOf, markState, stateKey,
  buildSignalReadBody, postSignalRead, normalizeReads, readFor, readDay,
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
// Тексты сетевых сбоев — чистый модуль без vue и DOM, статический импорт безопасен.
import { networkHint, NET_HINTS } from '../src/i18n/net.js'

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

console.log('\n=== Подсказка при сетевом сбое (05.08): развилка офлайн / VPN / отказ бэка ===')
// Совет «выключите VPN» верен ТОЛЬКО для транспортной осечки. При отказе бэка по
// существу (400, 500 с телом, протухшая фраза) он отправит человека крутить
// настройки впустую и спрячет настоящую причину.
check('офлайн → про связь, а не про VPN',
  networkHint({ retriable: true, online: false }) === NET_HINTS.offline)
check('офлайн ПЕРЕВЕШИВАЕТ транспортную осечку (иначе человек без интернета ищет VPN)',
  networkHint({ retriable: true, online: false }) !== NET_HINTS.vpn)
check('транспортная осечка онлайн → про VPN',
  networkHint({ retriable: true, online: true }) === NET_HINTS.vpn)
check('осознанный отказ бэка → подсказки НЕТ (показываем причину)',
  networkHint({ retriable: false, online: true }) === '')
check('отказ бэка в офлайне → всё равно про связь',
  networkHint({ retriable: false, online: false }) === NET_HINTS.offline)
check('без аргументов не падает и молчит', networkHint() === '')
check('текст про VPN — дословно', NET_HINTS.vpn === 'Похоже, включён VPN — выключите его и нажмите «Повторить»', NET_HINTS.vpn)

console.log('\n=== Инварианты по наборам ===')
const expectFc = { 'ohta:2025-05': 'good', 'piterland:2025-05': 'warn', 'iyun:2025-05': 'bad' }
for (const [key, set] of Object.entries(sets)) {
  const m = computeDaily(set)
  console.log(`\n— ${key} —`)

  // 1) Σплан = цель. РОВНО — пока у набора нет замка плана (plan_lock, D-132). С замком
  // допуск ТОТ ЖЕ, что в контуре B (tools/verify_daily.py): max(1, число замков / 2) ₽ —
  // замок хранит целые рубли, и на этом одном источнике расхождение и заканчивается.
  // Допуск шире брать нельзя: он перестанет ловить рассинхрон замка с целью месяца.
  const nLock = Object.keys(set.plan_lock || {}).length
  const tol = nLock ? Math.max(1, nLock / 2) : 1e-6 * (m.T || 1) + 1e-6
  const sumPlan = m.days.reduce((a, x) => a + x.plan, 0)
  check(`Σплан = цель (${Math.round(sumPlan)} vs ${m.T}${nLock ? `, замков ${nLock}, допуск ${tol} ₽` : ', РОВНО'})`,
    Math.abs(sumPlan - m.T) <= tol)

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

console.log('\n=== NET-87: погодный множитель веса дня и замок плана (D-13 / D-132) ===')
{
  const set = sets['ohta:2025-05']
  const m = computeDaily(set)
  const day = (iso) => m.days.find((x) => x.iso === iso)
  const COEF_SAT = set.dow_coef[5] // 17.05.2025 — суббота

  // множитель меняет ВЕС дня, а вес — всё остальное; пороги (t_max) во фронт не переносятся
  check('вес незакрытого дня = коэф. дня недели × mult (17.05: ×0.80)',
    Math.abs(day('2025-05-17').weight - COEF_SAT * 0.8) < 1e-9, day('2025-05-17').weight)
  check('дня нет в day_factors → множитель 1 (вес = коэф. дня недели)',
    Math.abs(day('2025-05-19').weight - set.dow_coef[0]) < 1e-9, day('2025-05-19').weight)
  check('у закрытых дней множителя нет по построению (контур ставит его только на незакрытые)',
    Object.keys(set.day_factors).every((iso) => (set.days.find((d) => d.date === iso) || {}).status !== 'full'))

  // замок: план закрытого дня берётся из payload как есть, а не считается
  check('план закрытого дня = значение из plan_lock РОВНО (15.05)',
    day('2025-05-15').plan === set.plan_lock['2025-05-15'], day('2025-05-15').plan)
  check('все закрытые дни взяты из замка, ни один не пересчитан',
    m.days.filter((x) => x.full).every((x) => x.plan === set.plan_lock[x.iso]))
  check('незакрытый день в замке НЕ лежит и считается по формуле',
    !('2025-05-20' in set.plan_lock) && Math.abs(day('2025-05-20').plan - (m.T * day('2025-05-20').weight) /
      m.days.reduce((a, x) => a + x.weight, 0)) < 1e-6)

  // ГЛАВНОЕ СВОЙСТВО ЗАМКА: переснятие погоды на БУДУЩЕЕ не переписывает историю.
  // Контрольная группа тут обязательна: без неё тест зелёный и когда замок не работает.
  const shifted = JSON.parse(JSON.stringify(set))
  shifted.day_factors['2025-05-20'] = { mult: 0.8, why: 'жара пришла в прогноз позже' }
  shifted.day_factors['2025-05-21'] = { mult: 0.8, why: 'жара пришла в прогноз позже' }
  shifted.day_factors['2025-05-22'] = { mult: 0.8, why: 'жара пришла в прогноз позже' }
  shifted.day_factors['2025-05-23'] = { mult: 0.8, why: 'жара пришла в прогноз позже' }
  const mShift = computeDaily(shifted)
  const planOf = (mm, iso) => mm.days.find((x) => x.iso === iso).plan
  check('замок держит: после смены множителей 4 будущих дней план закрытых дней НЕ изменился',
    m.days.filter((x) => x.full).every((x) => planOf(mShift, x.iso) === x.plan))
  check('«% плана дня» закрытого дня тоже не поехал (15.05)',
    mShift.days.find((x) => x.iso === '2025-05-15').fact / planOf(mShift, '2025-05-15') ===
    day('2025-05-15').fact / day('2025-05-15').plan)
  check('план БУДУЩИХ дней при этом изменился (иначе тест выше ничего не проверяет)',
    planOf(mShift, '2025-05-20') !== planOf(m, '2025-05-20'))

  const noLock = JSON.parse(JSON.stringify(shifted))
  delete noLock.plan_lock
  const mNoLock = computeDaily(noLock)
  check('контрольная группа: БЕЗ замка план закрытого дня уехал бы задним числом',
    planOf(mNoLock, '2025-05-15') !== planOf(m, '2025-05-15'))
  check('без замка Σплан = цель РОВНО (старое поведение цело)',
    Math.abs(mNoLock.days.reduce((a, x) => a + x.plan, 0) - mNoLock.T) < 1e-6 * mNoLock.T + 1e-6)

  // деградация: ключей нет вовсе → модель считает как до NET-87
  const bare = JSON.parse(JSON.stringify(set))
  delete bare.day_factors; delete bare.plan_lock
  const mBare = computeDaily(bare)
  check('нет обоих ключей → веса чисто по дню недели',
    mBare.days.every((x) => Math.abs(x.weight - x.coef) < 1e-9))
  check('нет обоих ключей → Σплан = цель РОВНО',
    Math.abs(mBare.days.reduce((a, x) => a + x.plan, 0) - mBare.T) < 1e-6 * mBare.T + 1e-6)
  check('нет обоих ключей → модель не падает и считает прогноз', Number.isFinite(mBare.landing))
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

console.log('\n=== Драйверы в «Контроле дня» (06.08, D-41/D-42/D-75/D-76) ===')
// Числа приёмки задания — реальные (Охта авг: 1 маркер; Питерленд/Июнь авг: 0;
// Охта июль: 5). Реальные данные в публичный scripts/ не кладём, поэтому здесь
// воспроизведена их ФОРМА на выдуманных кодах и датах: те же ветки, те же границы.
const act = (code, start, end, accuracy, measure, days) =>
  ({ code, name: `Драйвер ${code}`, days: days || [], start, end, accuracy, measure })
const setWith = (activities, month = '2025-05') => ({ ...sets['ohta:2025-05'], month, activities })

{
  console.log('\n— агрегат «замер идёт у N»: measure НЕ парсим, спрашиваем «начинается с идёт» —')
  check("'идёт' → считается", isMeasuring('идёт'))
  check("'идёт (обратный эффект зафиксирован)' → считается (реальное значение в данных)",
    isMeasuring('идёт (обратный эффект зафиксирован)'))
  check("'заблокирован' → НЕ считается", !isMeasuring('заблокирован'))
  check("'невозможен' → НЕ считается", !isMeasuring('невозможен'))
  check("'Идет' (без ё, с заглавной) → считается — мастера правятся руками", isMeasuring('Идет'))
  check("пусто/undefined → не считается и не падает", !isMeasuring('') && !isMeasuring(undefined))
}

{
  console.log('\n— фон месяца vs включение этого месяца: различает ТОЛЬКО start —')
  const m = computeDaily(setWith([
    act('DRV-01', '2025-05-13', '', 'день', 'идёт', ['2025-05-13', '2025-05-14']),
    act('DRV-02', '2025-04-01', '', 'месяц', 'заблокирован', ['2025-05-01']),
  ]))
  const d = m.drivers
  check('включений внутри месяца = 1 (фон с апреля не событие мая)', d.starts.length === 1, d.starts.length)
  check('работают = все строки набора (2)', d.total === 2, d.total)
  check('замер идёт у 1', d.measuring === 1, d.measuring)
  check('маркер стоит в дне start', m.days.find((x) => x.iso === '2025-05-13').mark === 'on')
  check('в дне работы БЕЗ переключения маркера нет (D-42: не 31 значок, а 1)',
    m.days.find((x) => x.iso === '2025-05-14').mark === null)
  check('драйвер-фон в таблице дней не появляется вовсе',
    m.days.find((x) => x.iso === '2025-05-01').mark === null)
  check('driversSwitches остаётся источником «что переключили» для модели и title',
    driversSwitches(d, '2025-05') === 'Включён 1: DRV-01 с 13.05', driversSwitches(d, '2025-05'))
}

{
  console.log('\n— «маркеров ноль»: два парка из трёх прямо сейчас, строка обязана читаться —')
  const m = computeDaily(setWith([
    act('DRV-07', '2025-04-01', '', 'unknown', 'идёт (обратный эффект зафиксирован)', ['2025-05-02']),
    act('DRV-08', '2025-04-01', '', 'месяц', 'невозможен', ['2025-05-02']),
  ]))
  check('маркеров в месяце нет', m.days.every((x) => x.mark === null))
  check('подводка читается нормально, а не как сломанный шаблон',
    driversSwitches(m.drivers, '2025-05') === 'Включений в мае не было',
    driversSwitches(m.drivers, '2025-05'))
  check('месяц в предложном падеже (август → «в августе»)',
    driversSwitches(m.drivers, '2025-08') === 'Включений в августе не было')
}

{
  console.log('\n— выключение, «~» у неточной даты, «и ещё N», свежие первыми —')
  const m = computeDaily(setWith([
    act('DRV-01', '2025-05-13', '', 'день', '', ['2025-05-13']),
    act('DRV-03', '2025-05-17', '', 'день', '', ['2025-05-17']),
    act('DRV-05', '2025-05-20', '', 'месяц', '', ['2025-05-20']),
    act('DRV-06', '2025-05-16', '', 'день', '', ['2025-05-16']),
    act('DRV-04', '2025-04-16', '2025-05-31', 'день', '', ['2025-05-01']),
  ]))
  const d = m.drivers
  const txt = driversSwitches(d, '2025-05')
  check('включений 4, выключение 1 → маркеров 5 (13,16,17,20 + 31)',
    m.days.filter((x) => x.mark).length === 5, m.days.filter((x) => x.mark).map((x) => x.dd).join(','))
  check('20 — включение (залитый маркер)', m.days.find((x) => x.dd === 20).mark === 'on')
  check('31 — выключение (пунктирный маркер)', m.days.find((x) => x.dd === 31).mark === 'off')
  check('свежие первыми: DRV-05 (20.05) впереди DRV-03 (17.05)',
    d.starts[0].code === 'DRV-05' && d.starts[1].code === 'DRV-03', d.starts.map((e) => e.code).join(','))
  check('кодов максимум два, остаток → «и ещё N»', txt.includes('и ещё 2'), txt)
  check('accuracy «месяц» → «~» у даты старта', txt.includes('DRV-05 с ~20.05'), txt)
  check('accuracy «день» → «~» НЕ ставится', txt.includes('DRV-03 с 17.05'), txt)
  check('выключение печатается отдельной частью', txt.includes('выключен DRV-04 с 31.05'), txt)
  check('счётчики работающих/замера в подводку НЕ лезут — они не про этот месяц',
    !txt.includes('работают') && !txt.includes('замер'), txt)
  check('полная строка', txt === 'Включено 4: DRV-05 с ~20.05, DRV-03 с 17.05 и ещё 2 · выключен DRV-04 с 31.05',
    txt)
}

{
  console.log('\n— несколько переключений в один день → ОДИН маркер, подписи все (D-76) —')
  const m = computeDaily(setWith([
    act('DRV-01', '2025-05-10', '', 'день', '', ['2025-05-10']),
    act('DRV-02', '2025-04-01', '2025-05-10', 'день', '', ['2025-05-10']),
  ]))
  const day = m.days.find((x) => x.dd === 10)
  check('маркер один', m.days.filter((x) => x.mark).length === 1)
  check('включение перевешивает выключение', day.mark === 'on', day.mark)
  check('в title обе подписи через перенос строки', markTitle(day.markEvents).split('\n').length === 2)
  check('в подписи есть код и название, на маркере кода нет',
    markTitle(day.markEvents).startsWith('DRV-01 · Драйвер DRV-01 · включён 10.05'),
    markTitle(day.markEvents).split('\n')[0])
}

{
  console.log('\n— ТИП СОБЫТИЯ: включён · перестроен · выключен (NET-33, задание 07.08) —')
  // Повод: у Охты Молл строка писала «Включён 1: DRV-04 с 01.08» про обход зала,
  // который идёт непрерывно с 16.07 — 01.08 его ПЕРЕСТРОИЛИ. Слово было ложное,
  // потому что типа события в схеме не было: всякое начало периода = запуск.
  const evk = (v) => bundleEventKind(v)
  check("'перестроен' → rebuilt", evk('перестроен') === 'rebuilt', evk('перестроен'))
  check("'выключен' → off", evk('выключен') === 'off', evk('выключен'))
  check("'включён' → on", evk('включён') === 'on', evk('включён'))
  check("'Перестроен' / без ё — мастера правятся руками", evk('Перестроен') === 'rebuilt' && evk('включен') === 'on')
  check('поля нет вовсе → on (поведение до правки, обратная совместимость)',
    evk(undefined) === 'on' && evk('') === 'on')
  check('незнакомое значение → on, а не потеря маркера', evk('переименован') === 'on')

  const m = computeDaily(setWith([
    { ...act('DRV-04', '2025-05-01', '', 'день', 'идёт', ['2025-05-01']), event: 'перестроен' },
    { ...act('DRV-03', '2025-04-01', '', 'день', 'заблокирован', ['2025-05-01']), event: 'включён' },
  ]))
  const day1 = m.days.find((x) => x.dd === 1)
  check('маркер дня перестройки — свой вид, не «включён»', day1.mark === 'rebuilt', day1.mark)
  check('в подписи стоит слово «перестроен»',
    markTitle(day1.markEvents) === 'DRV-04 · Драйвер DRV-04 · перестроен 01.05', markTitle(day1.markEvents))
  check('фон с апреля маркера не даёт (перестройка не размножилась)',
    m.days.filter((x) => x.mark).length === 1)
  check('перестройка НЕ печатается как включение (это и был баг)',
    driversSwitches(m.drivers, '2025-05') === 'Включений в мае не было · перестроен DRV-04 с 01.05',
    driversSwitches(m.drivers, '2025-05'))
  check('«работают N» перестройка не меняет — драйвер и был включён', m.drivers.total === 2, m.drivers.total)

  const mixDay = computeDaily(setWith([
    { ...act('DRV-01', '2025-05-10', '', 'день', '', ['2025-05-10']), event: 'включён' },
    { ...act('DRV-04', '2025-05-10', '', 'день', '', ['2025-05-10']), event: 'перестроен' },
    { ...act('DRV-02', '2025-04-01', '2025-05-10', 'день', '', ['2025-05-10']), event: 'включён' },
  ]))
  const d10 = mixDay.days.find((x) => x.dd === 10)
  check('три события в один день → ОДИН маркер (D-76)', mixDay.days.filter((x) => x.mark).length === 1)
  check('приоритет включение > перестройка > выключение', d10.mark === 'on', d10.mark)
  check('в title все три подписи, каждая своим глаголом',
    markTitle(d10.markEvents).split('\n').map((s) => s.split(' · ')[2].split(' ')[0]).join(',')
      === 'включён,перестроен,выключен',
    markTitle(d10.markEvents).replace(/\n/g, ' | '))
  const onlyReb = computeDaily(setWith([
    { ...act('DRV-04', '2025-05-10', '2025-05-20', 'день', '', ['2025-05-10']), event: 'перестроен' },
  ]))
  check('перестройка перевешивает выключение',
    onlyReb.days.find((x) => x.dd === 10).mark === 'rebuilt'
    && onlyReb.days.find((x) => x.dd === 20).mark === 'off')
}

{
  console.log('\n— обратная совместимость: старый payload (боевой Apps Script до v3.14) —')
  const old = computeDaily(setWith([{ code: 'Г1', name: 'Старая активность', days: ['2025-05-13'] }]))
  check('ready=false → сводка и маркеры СКРЫТЫ (не врём «включений не было»)',
    old.drivers.ready === false, old.drivers.ready)
  check('маркеров нет', old.days.every((x) => x.mark === null))
  check('дневной слой при этом жив (дни и план на месте)', old.days.length === 31 && old.T > 0)
  const empty = computeDaily(setWith([]))
  check('пустая вкладка daily_activities → total 0, ничего не рисуем',
    empty.drivers.total === 0 && empty.drivers.ready === false)
  check('без ключа activities вовсе — не падает',
    computeDaily({ ...sets['ohta:2025-05'], activities: undefined }).drivers.total === 0)
}

{
  console.log('\n— чего в «Контроле дня» больше НЕТ —')
  const m = computeDaily(sets['ohta:2025-05'])
  check('модель не отдаёт activities[] с процентом «к плану» (D-41)', m.activities === undefined)
  check('в строках дней нет acts[] (бейджи под каждым днём убраны, D-42)',
    m.weeks.every((w) => w.rows.every((r) => r.acts === undefined)))
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
    fetchImpl: async (url, opts) => { cap = { url, opts }; return { ok: true, status: 200, json: async () => ({ ok: true, read: 'added', score: 'added' }) } },
  })
  // Контракт ответа больше не выбрасывается: по полю score фронт отличает
  // «оценка записана» от «оценка не сохранилась» и досылает недостающую половину.
  check('postSignalRead отдаёт контракт {read, score}, а не true',
    okres && okres.read === 'added' && okres.score === 'added', JSON.stringify(okres))
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

console.log('\n=== D-36: проекция отметок payload.signal_reads (чистые функции) ===')
{
  const proj = [
    { park: 'ohta', signal_date: '2025-05-14', read_at: '2025-05-14 11:36', score: null },
    { park: 'piterland', signal_date: '2025-05-12', read_at: '2025-05-12 09:41', score: 7 },
    { park: 'iyun', signal_date: 'не-дата', read_at: '', score: null }, // битая — отбросить
    null, 'мусор',
  ]
  check('normalizeReads: битые записи и не-объекты отброшены', normalizeReads(proj).length === 2,
    normalizeReads(proj).length)
  check('normalizeReads: не массив → []',
    normalizeReads(undefined).length === 0 && normalizeReads(null).length === 0)
  check('readFor: пара парк+дата найдена', readFor(proj, 'piterland', '2025-05-12')?.score === 7)
  check('readFor: ДРУГАЯ дата того же парка → null (вчерашняя отметка не гасит сегодняшнюю кнопку)',
    readFor(proj, 'piterland', '2025-05-16') === null)
  check('readFor: чужой парк → null', readFor(proj, 'ohta', '2025-05-12') === null)
  check('readFor: пустая проекция → null (поле не доехало = живём на локальном состоянии)',
    readFor([], 'ohta', '2025-05-14') === null && readFor(undefined, 'ohta', '2025-05-14') === null)
  check('readDay: штамп → дата', readDay({ read_at: '2025-05-14 11:36' }) === '2025-05-14')
  check('readDay: битый/пустой штамп → пусто',
    readDay({ read_at: 'нет' }) === '' && readDay({}) === '' && readDay(null) === '')
}
{
  const mock = JSON.parse(readFileSync(resolve(here, '../src/data/daily.mock.json'), 'utf8'))
  check('мок несёт signal_reads массивом (контракт бэка v3.9)', Array.isArray(mock.signal_reads))
  // Б-2 (04.08): проекция отдаёт строку на КАЖДУЮ пару (парк, день), а не одну на
  // парк. Мок обязан это отражать — иначе dev-режим не покажет ленту с отметками, а
  // проверка «одна строка на парк» закрепляла бы ровно тот дефект, который чиним.
  check('в моке есть парк с несколькими днями (проекция по парам, не по паркам)',
    mock.signal_reads.length > new Set(mock.signal_reads.map((r) => r.park)).size)
  check('пары (парк, день) в моке уникальны',
    new Set(mock.signal_reads.map((r) => r.park + '|' + r.signal_date)).size === mock.signal_reads.length)
  check('в моке нет реальных данных: даты — из выдуманного мая 2025',
    mock.signal_reads.every((r) => r.signal_date.startsWith('2025-05')))
}

// ═══════════════ jsdom: живой рендер полос A/B и сети ═══════════════
console.log('\n=== jsdom: сборка тестового бандла ===')
const tmp = resolve(root, '.tmp-verify-daily')
// Уборка «мягкая»: macOS заводит в папке сборки .DS_Store, и если его удаление
// запрещено средой (песочница, сетевой диск), весь прогон падал ЗДЕСЬ — до единой
// проверки, и выглядело это как сломанная приёмка. Папка в .gitignore; не убралась —
// не беда, содержимое перезапишется следующей сборкой.
const rmTmp = () => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* остаётся */ } }
rmTmp()
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
export { default as DailyScreen } from '${root}/src/screens/DailyScreen.vue'
export { useNavTrailing } from '${root}/src/composables/useNavTrailing.js'
export { setPark } from '${root}/src/composables/useParkContext.js'
export { pickMonth, monthsForPicker, DAILY_FIRST_MONTH, computeNetwork as computeNetworkB } from '${root}/src/composables/dailyModel.js'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
export { useSignalRead } from '${root}/src/composables/useSignalRead.js'
export { collectSignals, isMarkable, signalAgeDays, SIGNAL_MARKABLE_DAYS, enqueueRead, resolveItem, isPermanentError, scoreOf, normalizeScore, signalPlainText, copyText } from '${root}/src/composables/dailySignals.js'
export { buildConnectBody, normalizeBusinessName, BUSINESS_NAME_MAX } from '${root}/src/composables/useConnectRequest.js'
export { useParkContext } from '${root}/src/composables/useParkContext.js'
export { useAppNav, clearSubView, setSubView } from '${root}/src/composables/useAppNav.js'
export { default as DailyDrivers } from '${root}/src/components/daily/DailyDrivers.vue'
export { default as DailyWeeks } from '${root}/src/components/daily/DailyWeeks.vue'
export { default as DriverCard } from '${root}/src/components/drivers/DriverCard.vue'
export { default as DriversSection } from '${root}/src/components/drivers/DriversSection.vue'
export { computeDaily as computeDailyB } from '${root}/src/composables/dailyModel.js'
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

// мок fetch: GET → гейт «ок», POST → сценарий из postMode.
// v3.13: бэк отвечает КОНТРАКТОМ {ok, read, score}, и фронт его читает. Мок обязан
// отдавать те же поля — иначе проверки пройдут на ответе, которого в бою не бывает
// (ровно этот класс ошибки — «тест создаёт состояние, недостижимое в бою» — уже
// давал неверный вывод в отчёте владельцу, см. §2.2 задания D-36).
let postMode = 'ok' // 'ok' | 'reject' | 'neterror' | 'score-fail'
let getPayload = {} // что отдаёт GET (гейт + ?action=daily); меняется в кейсах сводок
// v2.4 (05.08): режим и счётчик GET-ов. 400 выбран сознательно — он НЕ повторяемый
// (isRetriableStatus), поэтому ошибка всплывает сразу и проверка не ждёт 5,5 с пауз.
let getMode = 'ok' // 'ok' | 'fail400' | 'throw'
let getCalls = 0
const postedBodies = []
global.fetch = async (url, opts = {}) => {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj })
  if ((opts.method || 'GET') === 'POST') {
    const raw = String(opts.body || '')
    postedBodies.push(raw)
    if (postMode === 'neterror') return { ok: false, status: 500, json: async () => ({}) }
    if (postMode === 'reject') return json({ ok: false, error: 'bad key' })
    const sent = (() => { try { return JSON.parse(raw) } catch { return {} } })()
    const hasScore = sent.score != null
    // 'score-fail': прочтение записано, оценка нет — частичный результат, ради
    // различимости которого и заводился контракт.
    if (postMode === 'score-fail') return json({ ok: true, read: 'added', score: hasScore ? 'failed' : null })
    return json({ ok: true, read: 'added', score: hasScore ? 'added' : null })
  }
  getCalls++
  if (getMode === 'fail400') return { ok: false, status: 400, json: async () => ({}) }
  // Транспортная осечка: ровно так падает fetch без сети и через кривой VPN.
  if (getMode === 'throw') throw new TypeError('Failed to fetch')
  return json(getPayload) // гейт: 200 без error → фраза ок
}

const vueWarns = []
const origWarn = console.warn
console.warn = (...a) => {
  const s = a.join(' ')
  if (s.includes('[Vue warn]')) vueWarns.push(s)
  else if (!s.startsWith('signal_read failed') && !s.startsWith('daily reload retry')) origWarn(...a)
}

const bundle = await import(pathToFileURL(resolve(tmp, 'bundle.js')).href)
const { createApp, nextTick, h, ref: vRef, KeepAlive } = await import('vue')

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
  // 04.08: кнопка и статус — РАЗНЫЕ строки. До этого обе были «Прочитано», и кнопка
  // обещала результат вместо действия; состояния отличались только галочкой.
  // 15.08 (NET-61): кнопка одна и зовёт к обоим действиям сразу.
  check('кнопка зовёт к действию, а не сообщает результат',
    !!btn && btn.disabled === false &&
    btn.textContent.includes('Прочитать и оценить') && !el.textContent.includes('Прочитано ✓'))
  check('«Как идёт день» влит в блок', el.textContent.includes('Как идёт день'))
  check('день-строки влиты (4 на моке)', el.querySelectorAll('[data-test="day-line"]').length === 4,
    el.querySelectorAll('[data-test="day-line"]').length)
  check('лента свёрнута: старые сигналы не в DOM', !el.textContent.includes('Среда провалилась по будням'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))

  // ── Окраска и перестройка блока (06.08, жалоба «прилистываем и не замечаем») ──
  const card = el.querySelector('[data-test="signal-card"]')
  const feedBlock = el.querySelector('[data-test="signal-feed"]')
  check('карточка окрашена в тон статуса дня',
    /color-mix\(in srgb, var\(--(positive|warning|negative)\) 12%, var\(--surface\)\)/
      .test(card.getAttribute('style') || ''), card.getAttribute('style'))
  check('тон берётся ИМЕННО у статуса свежего сигнала',
    (card.getAttribute('style') || '').includes(
      { ok: '--positive', warn: '--warning', focus: '--negative' }[card.dataset.status]),
    card.dataset.status)
  check('текст на цветной подложке остался монохромным (цвет только в заливке и точках)',
    !/text-\[var\(--(positive|negative|warning)\)\]/.test(card.innerHTML))
  check('«Как идёт день» ВНУТРИ окрашенной карточки',
    !!card.querySelector('[data-test="day-line"]'))
  check('«Ранее» — ОТДЕЛЬНЫЙ блок, а не часть карточки',
    !!feedBlock && !card.contains(feedBlock))
  // Отдельных карточек на прошлые дни на экране БЫТЬ НЕ ДОЛЖНО: все они живут
  // внутри свёрнутого «Ранее». Проверяем явно — на превью это место читалось
  // неоднозначно, и цена ошибки тут высокая (экран управляющего).
  check('карточка «Сигнал Дня» на экране ровно одна — за сегодня',
    el.querySelectorAll('[data-test="signal-card"]').length === 1,
    el.querySelectorAll('[data-test="signal-card"]').length)
  check('сигналы прошлых дней — только внутри «Ранее», отдельными блоками не стоят',
    [...el.querySelectorAll('[data-test="signal-feed-row"]')].every((r) => feedBlock.contains(r)))
  check('заголовок «Сигнал Дня» — отдельной строкой по центру, крупно и жирно',
    (() => {
      const t = el.querySelector('[data-test="signal-title"]')
      return !!t && t.className.includes('text-center') && t.className.includes('font-bold')
        && t.textContent.trim() === 'Сигнал Дня'
    })())
  check('заголовку нечем переноситься: он не делит строку с датой и бейджем',
    el.querySelector('[data-test="signal-title"]').children.length === 0)
  check('черты под кнопкой отметки нет — карточку держит заливка',
    !/border-t/.test([...card.children].map((c) => c.className).join(' ')))
  check('блок «Ранее» НЕ окрашен: у прошлых дней свои статусы',
    !/color-mix/.test(feedBlock.getAttribute('style') || '')
    && feedBlock.className.includes('bg-[var(--surface)]'))
  const dayIdx = [...card.querySelectorAll('*')].indexOf(card.querySelector('[data-test="day-line"]'))
  const markIdx = [...card.querySelectorAll('*')].indexOf(card.querySelector('[data-test="signal-read"]'))
  check('«Как идёт день» поднят под разбор и кнопку, а не уехал в хвост',
    markIdx > -1 && dayIdx > markIdx, `кнопка ${markIdx} → день ${dayIdx}`)
  // Бейдж «новое» на цветной подложке. Жёлтый на карточке warn пропадает
  // (граница 1,46:1) — поэтому он тёмный, как активный парк-фильтр.
  const badge = [...card.querySelectorAll('span')].find((s) => s.textContent.trim() === 'новое')
  check('бейдж «новое» тёмный, а не жёлтый (на warn-карточке жёлтый пропадал)',
    !!badge && badge.className.includes('bg-[var(--text)]')
    && badge.className.includes('text-[var(--ink-on-color)]'), badge && badge.className)
  check('подпись «разбор аналитика от» на тон темнее (--text-muted на focus = 4,32:1 < 4,5)',
    !![...card.querySelectorAll('span')]
      .find((s) => s.textContent.includes('разбор аналитика')
        && s.className.includes('text-[var(--text-secondary)]')))
  app.unmount()
}
{
  // Сигнала нет — красить нечем. Серый тон читался бы как «статус никакой».
  // localStorage НЕ чистим: следующая проверка ждёт «viewed» с прошлого захода.
  const { el, app } = mount(bundle.DailySignalCard, { m: { ...mOhta, signals: [] }, now: NOW_MID, signals: [] })
  await nextTick()
  const card = el.querySelector('[data-test="signal-card"]')
  check('без сигнала карточка обычная белая, без тона',
    !/color-mix/.test(card.getAttribute('style') || '')
    && card.className.includes('bg-[var(--surface)]'))
  check('«Как идёт день» живёт и без сигнала', !!card.querySelector('[data-test="day-line"]'))
  check('блока «Ранее» нет', !el.querySelector('[data-test="signal-feed"]'))
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

// v3.13: отправка стала фоновой очередью с задержкой ~2 с. Ждать её таймером в тестах
// бессмысленно и флаки — дёргаем flush напрямую. Это публичный метод композабла,
// тот же, которым ходят события online/visibilitychange.
const sr = bundle.useSignalRead()
const drainOutbox = async () => { await sr.flush({ force: true }); await nextTick() }
// Очередь живёт на уровне модуля и localStorage.clear() её из памяти не выбьет —
// сбрасываем явно, иначе сценарии протекают друг в друга.
const resetSignals = () => { localStorage.clear(); sr.reloadOutbox() }
{
  // NET-61: ОДИН шаг. Нажатие на карточке открывает шкалу, подтверждение отправляет
  // прочтение и оценку одним запросом. Двух кнопок на карточке больше нет — с ними
  // терялся второй шаг (84 % → 58 % отметок с оценкой после релиза 04.08 17:04 МСК).
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('до клика модалки нет', !rateSheet())
  // Кнопка на карточке РОВНО ОДНА во всех состояниях — иначе вернётся жалоба 04.08:
  // не на окно оценки, а на вторую кнопку, дорисованную после его закрытия.
  const card0 = el.querySelector('[data-test="signal-card"]')
  check('на карточке одна кнопка действия, и она называет оба действия сразу',
    card0.querySelectorAll('[data-test="signal-read"]').length === 1 &&
    !el.querySelector('[data-test="signal-rate-cta"]') &&
    card0.querySelector('[data-test="signal-read"]').textContent.includes('Прочитать и оценить'))
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  check('нажатие открывает шкалу — второго действия искать не нужно', !!rateSheet())
  check('POST ещё не ушёл: прочтение и оценка уедут одним телом', postedBodies.length === 0)
  check('вопрос модалки дословно (28.07: без «?», сигнала со строчной)',
    rateSheet().textContent.includes('Оцените пользу сигнала') && !rateSheet().textContent.includes('Сигнала?'))
  const slider = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  check('ползунок 0–10 шаг 1', !!slider && slider.min === '0' && slider.max === '10' && slider.step === '1')
  // КОНТУР А защиты от дурака: дефолта «5» больше нет. Раньше 7 оценок из 19
  // оказывались ровно пятёрками — то есть стартовым положением ползунка.
  check('до касания шкалы значения нет («—»)',
    rateSheet().querySelector('[data-test="signal-rate-value"]').textContent.trim() === '—')
  check('до касания шкалы «Отправить» неактивна',
    rateSheet().querySelector('[data-test="signal-rate-submit"]').disabled === true)
  check('подсказка объясняет, чего ждут', !!rateSheet().querySelector('[data-test="signal-rate-hint"]'))
  slider.value = '8'
  await fire(slider, 'input')
  await nextTick()
  check('после касания значение видно крупно',
    rateSheet().querySelector('[data-test="signal-rate-value"]').textContent.trim() === '8')
  check('после касания «Отправить» активна',
    rateSheet().querySelector('[data-test="signal-rate-submit"]').disabled === false)
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await nextTick()
  check('модалка закрывается сразу — человек не ждёт сеть', !rateSheet())
  // ТРЕТЬЕ СОСТОЯНИЕ: нажатие принято, но бэк ещё не подтвердил. Без него нельзя
  // одновременно зафиксировать нажатие сразу и не врать «✓» до ответа.
  check('пока ответа нет — «отправляем», а не «✓»',
    el.querySelector('[data-test="signal-read"]').dataset.state === 'sending' &&
    !!el.querySelector('[data-test="signal-read-sending"]') &&
    el.querySelector('[data-test="signal-read"]').disabled === true &&
    !el.textContent.includes('Прочитано ✓'))
  await drainOutbox()
  check('POST ушёл ровно один: прочтение и оценка одним телом',
    postedBodies.length === 1, String(postedBodies.length))
  const body = JSON.parse(postedBodies[0] || '{}')
  check('тело signal_read по контракту §2 + score из ползунка',
    body.key === 'test-phrase' && body.type === 'signal_read' && body.park === 'ohta' &&
    body.signal_date === '2025-05-16' && body.score === 8)
  // NET-61 §2.2: подтверждение называет ЗАПИСАННОЕ ЧИСЛО. «Оценка отправлена» не
  // годится — именно неразличимость «отправлено» и «записано» породила дубли.
  check('на экране осталось записанное число, а не факт отправки',
    el.querySelector('[data-test="signal-read"]').textContent.includes('Ваша оценка') &&
    el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '8',
    el.querySelector('[data-test="signal-read"]').textContent)
  check('прочтение подтверждено отдельной строкой статуса',
    el.textContent.includes('Прочитано ✓') && !!el.querySelector('[data-test="signal-read-state"]'))
  // Переоценка разрешена (§2.3): у signal_scores побеждает последняя оценка, строка
  // остаётся одна. Гасить кнопку — значит закрыть штатный сценарий.
  check('кнопка осталась активной: оценку можно изменить',
    el.querySelector('[data-test="signal-read"]').disabled === false &&
    !!el.querySelector('[data-test="signal-score-change"]'))
  // Дата и оценка — бейджи, а не «· 04.08» посреди строки: точка-разделитель
  // читалась как случайный символ (правка владельца 04.08).
  check('дата отметки — бейдж без точки-разделителя',
    !el.querySelector('[data-test="signal-read-state"]').textContent.includes('·'))
  check('очередь пуста — долгов не осталось', sr.queue.value.length === 0, String(sr.queue.value.length))
  app.unmount()
  // Эхо записанного значения переживает перезагрузку: проекция приедет только со
  // следующим payload, а до неё экран обязан помнить, что записано.
  const re = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('прочитано и при следующих заходах', re.el.textContent.includes('Прочитано ✓'))
  check('записанная оценка видна и после перезагрузки, без обновления payload',
    re.el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '8')
  re.app.unmount()
}
{
  // Отказ от оценки: закрыть шкалу. Прочтение при этом записывается — отметка не
  // должна становиться заложником оценки (§2.1). Ноль не отправляется: поля score в
  // теле нет вовсе.
  //
  // Отдельной кнопки «Отметить без оценки» в шкале НЕТ (решение владельца 15.08): она
  // дублировала крестик, а читалась как приглашение пропустить оценку — то есть звала
  // мимо шага, ради которого весь релиз. Выход остаётся, но не конкурирует с отправкой.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  check('модалка открыта', !!rateSheet())
  check('шкала не предлагает пропустить оценку отдельной кнопкой',
    !rateSheet().querySelector('[data-test="signal-rate-skip"]') &&
    !rateSheet().textContent.includes('без оценки'))
  await fire(rateSheet().querySelector('[aria-label="Закрыть"]'), 'click')
  await nextTick()
  await drainOutbox()
  check('отказ от оценки: прочтение всё равно ушло', postedBodies.length === 1, String(postedBodies.length))
  check('ушло БЕЗ поля score (оценки не было — врать нечем)',
    JSON.parse(postedBodies[0] || '{}').score === undefined)
  check('«Прочитано ✓» — факт контакта зафиксирован',
    !rateSheet() && el.textContent.includes('Прочитано ✓'))
  // Долг по оценке виден, а не спрятан: «не оценил» обязано отличаться от «оценил,
  // но не долетело». Ноль в этом месте не рисуем ни при каких условиях (NET-62).
  check('оценки нет: бейджа с числом нет, ноль не нарисован',
    !el.querySelector('[data-test="signal-score-badge"]') &&
    !/Ваша оценка/.test(el.textContent) && !/\b0\b/.test(
      el.querySelector('[data-test="signal-read"]').textContent))
  check('состояние названо словами: «оценка не поставлена»',
    !!el.querySelector('[data-test="signal-score-none"]') &&
    el.textContent.includes('оценка не поставлена'))
  check('кнопка зовёт вернуться к оценке',
    el.querySelector('[data-test="signal-read"]').textContent.includes('Оценить') &&
    el.querySelector('[data-test="signal-read"]').disabled === false)
  app.unmount()
}
{
  // Тап по фону — тот же смысл, что и крестик: прочтение записывается. Иначе «закрыл
  // окно» снова означало бы потерю отметки, ради которой кнопки и разделяли 04.08.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  await fire(rateSheet(), 'click') // клик по скриму (@click.self)
  await nextTick()
  await drainOutbox()
  check('закрытие тапом по фону: прочтение всё равно ушло, score не отправлен',
    postedBodies.length === 1 && JSON.parse(postedBodies[0] || '{}').score === undefined,
    postedBodies[0])
  check('после закрытия на карточке по-прежнему ОДНА кнопка',
    el.querySelector('[data-test="signal-card"]').querySelectorAll('[data-test="signal-read"]').length === 1)
  app.unmount()
}
{
  // Ф-5: переоценка. Бэк умеет «последняя оценка побеждает» с 28.07, но из UI это
  // было недостижимо — onRead/onRateSubmit выходили при latestRead === true.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const reads = [{ park: 'ohta', signal_date: '2025-05-16', read_at: '2025-05-16 11:36', score: 4 }]
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads })
  await nextTick()
  const cta = el.querySelector('[data-test="signal-read"]')
  check('у оценённого сигнала кнопка называет записанное число и пускает изменить',
    !!cta && cta.textContent.includes('Ваша оценка') && cta.disabled === false &&
    !!el.querySelector('[data-test="signal-score-change"]') &&
    el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '4')
  check('оценка — бейдж, точки-разделителя нет', !cta.textContent.includes('·'))
  await fire(cta, 'click')
  await nextTick()
  check('модалка открывается на текущей оценке и сразу готова к отправке',
    rateSheet().querySelector('[data-test="signal-rate-value"]').textContent.trim() === '4' &&
    rateSheet().querySelector('[data-test="signal-rate-submit"]').disabled === false)
  const sl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  sl.value = '9'; await fire(sl, 'input')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('переоценка уходит на бэк с новым значением',
    postedBodies.length === 1 && JSON.parse(postedBodies[0]).score === 9,
    postedBodies[0])
  check('на экране новое записанное значение, а не прежнее из проекции',
    el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '9')
  app.unmount()
}
{
  // Частичный результат: прочтение записано, оценка нет (score:'failed'). Раньше
  // фронт выбрасывал поле score и рапортовал успех — долг был невидим и невосполним.
  resetSignals()
  postMode = 'score-fail'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  sl.value = '6'; await fire(sl, 'input')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('прочтение подтверждено: «Прочитано ✓»', el.textContent.includes('Прочитано ✓'))
  check('фронт ЗАМЕТИЛ, что оценка не сохранилась',
    el.textContent.includes('Оценка не сохранилась') && !!el.querySelector('[data-test="signal-score-debt"]'))
  // Эхо — только про ЗАПИСАНО. score:'failed' его не пишет, иначе на экране осталась
  // бы «Ваша оценка: 6» при пустой строке в листе — та же ложь, только новая.
  check('несохранённая оценка на экране не выдаётся за записанную',
    !el.querySelector('[data-test="signal-score-badge"]') && !/Ваша оценка/.test(el.textContent))
  check('долг остался в очереди для досылки',
    sr.queue.value.length === 1 && sr.queue.value[0].score === 6 && sr.queue.value[0].read_ok === true,
    JSON.stringify(sr.queue.value))
  app.unmount()
  postMode = 'ok'
}
{
  // Ф-1: кнопка в КАЖДОЙ строке ленты. Её отсутствие и есть корень потерь — сигнал,
  // уехавший в ленту, нельзя было отметить никогда (12 дыр из 42 за 22.07–04.08).
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-feed-toggle"]'), 'click')
  await nextTick()
  const row = el.querySelectorAll('[data-test="signal-feed-row"]')[0]
  check('лента раскрыта, строки есть', !!row)
  await fire(row.querySelector('button'), 'click') // раскрыть строку
  await nextTick()
  const rowBtn = row.querySelector('[data-test="signal-read"]')
  check('в раскрытой строке ленты ЕСТЬ кнопка отметки', !!rowBtn && rowBtn.disabled === false)
  await fire(rowBtn, 'click')
  await nextTick()
  check('строка ленты открывает ту же шкалу — поведение одно на все дни', !!rateSheet())
  await fire(rateSheet().querySelector('[aria-label="Закрыть"]'), 'click')
  await nextTick()
  await drainOutbox()
  check('отметка из ленты ушла на СВОЮ дату, не на дату свежего сигнала',
    postedBodies.length === 1 && JSON.parse(postedBodies[0]).signal_date === '2025-05-14',
    postedBodies[0])
  // Раньше в ленте дата отметки пряталась (show-date=false) — оставалась только
  // дата сигнала слева, и подтверждения записи в ленте не было вовсе.
  check('в ленте видны и галочка, и дата отметки бейджем',
    row.textContent.includes('Прочитано ✓') && !!row.querySelector('[data-test="signal-read-date"]'))
  app.unmount()
}
{
  // Окно ДЕЙСТВИЯ (14 дней) внутри горизонта ЗНАНИЯ (45 дней у бэка): статус старого
  // сигнала виден, но отмечать поздно — read_at меряет скорость реакции.
  resetSignals()
  const old = { park: 'ohta', month: '2025-05', signals: [{ date: '2025-03-01', status: 'ok', headline: 'старый', action: '' }] }
  const { el, app } = mount(bundle.DailySignalCard, { m: { ...mOhta, ...old }, now: NOW_MID, signals: old.signals })
  await nextTick()
  check('сигнал старше окна: кнопка неактивна и помечена «архив»',
    el.querySelector('[data-test="signal-read"]').disabled === true &&
    !!el.querySelector('[data-test="signal-archive"]'))
  app.unmount()
}
{
  // Постоянная ошибка бэка (bad key) → плашка, кнопка активна, вечной петли нет.
  resetSignals()
  postMode = 'reject'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  sl.value = '5'; await fire(sl, 'input')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('красная плашка дословно', el.textContent.includes('Не удалось отметить. Проверьте связь и попробуйте ещё раз.'))
  check('кнопка осталась активной (повтор разрешён), «✓» нет',
    !rateSheet() && el.querySelector('[data-test="signal-read"]').disabled === false &&
    el.textContent.includes('Прочитать и оценить') && !el.textContent.includes('Прочитано ✓'))
  // 'bad key' не станет валиднее сам собой: ретраить вечно — уйти в петлю.
  check('постоянная ошибка помечена как невосстановимая',
    sr.queue.value[0]?.dead === true, JSON.stringify(sr.queue.value[0]))
  app.unmount()
  postMode = 'ok'
}
{
  // Сеть отвалилась — намерение НЕ теряется: элемент ждёт в очереди и уходит сам,
  // когда связь вернулась. Раньше упавший POST терял отметку безвозвратно.
  resetSignals()
  postMode = 'neterror'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  sl.value = '7'; await fire(sl, 'input')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('сетевой сбой: намерение осталось в очереди, не выброшено',
    sr.queue.value.length === 1 && sr.queue.value[0].dead === false &&
    sr.queue.value[0].score === 7)
  check('«✓» при этом НЕ показываем', !el.textContent.includes('Прочитано ✓'))
  // Сорвавшаяся отправка не должна выглядеть как идущая: молчащий экран и породил
  // повторные нажатия. Сообщение есть, и кнопка снова активна — повторить можно руками.
  check('сбой связи назван словами, а не молчанием',
    !!el.querySelector('[data-test="signal-retry"]') &&
    el.textContent.includes('Не удалось отправить') &&
    el.querySelector('[data-test="signal-read"]').dataset.state === 'retry')
  check('повторить можно сразу: кнопка не заблокирована ожиданием бэкоффа',
    el.querySelector('[data-test="signal-read"]').disabled === false)
  // Очередь переживает перезагрузку страницы: она на устройстве, а не в памяти.
  sr.reloadOutbox()
  check('очередь пережила перезагрузку (лежит в localStorage)',
    sr.queue.value.length === 1 && sr.queue.value[0].signal_date === '2025-05-16')
  postMode = 'ok'
  await drainOutbox()
  check('связь вернулась → отметка доехала сама, очередь пуста',
    postedBodies.length === 2 && sr.queue.value.length === 0, String(sr.queue.value.length))
  app.unmount()
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

console.log('\n=== jsdom: D-36 — отметка из payload переживает перезагрузку и смену устройства ===')
{
  // Чистое устройство (localStorage пуст) + отметка в проекции бэка → кнопка сразу
  // в состоянии «Прочитано», POST не нужен. Это и есть §2.4 задания.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const reads = [{ park: 'ohta', signal_date: '2025-05-16', read_at: '2025-05-16 11:36', score: 8 }]
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads })
  await nextTick()
  check('пустой localStorage + отметка в payload → «Прочитано ✓» сразу',
    el.textContent.includes('Прочитано ✓'))
  check('дата отметки видна рядом со статусом (16.05)',
    el.querySelector('[data-test="signal-read-date"]')?.textContent.includes('16.05'))
  check('оценка из проекции названа числом, повторный POST не уходит',
    el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '8' &&
    postedBodies.length === 0)
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}
{
  // Отметка ВЧЕРАШНЕГО сигнала не должна гасить кнопку у сегодняшнего.
  resetSignals()
  const reads = [{ park: 'ohta', signal_date: '2025-05-14', read_at: '2025-05-14 11:36', score: null }]
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads })
  await nextTick()
  check('отметка другого сигнала → кнопка активна, «✓» нет',
    el.querySelector('[data-test="signal-read"]').disabled === false &&
    !el.textContent.includes('Прочитано ✓') && !el.querySelector('[data-test="signal-read-date"]'))
  app.unmount()
}
{
  // Чужой парк в проекции — не наш случай.
  resetSignals()
  const reads = [{ park: 'piterland', signal_date: '2025-05-16', read_at: '2025-05-16 09:41', score: 7 }]
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads })
  await nextTick()
  check('отметка чужого парка кнопку не гасит',
    el.querySelector('[data-test="signal-read"]').disabled === false)
  app.unmount()
}
{
  // Старый деплой бэка: поля нет вовсе → поведение ровно как до D-36.
  resetSignals()
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  check('нет проекции (старый деплой) → кнопка активна, карточка живёт как раньше',
    el.querySelector('[data-test="signal-read"]').disabled === false &&
    el.textContent.includes('Прочитать и оценить') && !el.textContent.includes('Прочитано ✓'))
  app.unmount()
}
{
  // Успешная отправка: дата появляется сразу, не дожидаясь следующего payload.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads: [] })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = document.querySelector('[data-test="signal-rate-slider"]')
  sl.value = '5'; await fire(sl, 'input')
  await fire(document.querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('после подтверждения дата отметки видна сразу (16.05, до обновления payload)',
    el.textContent.includes('Прочитано ✓') &&
    el.querySelector('[data-test="signal-read-date"]')?.textContent.includes('16.05'))
  app.unmount()
}
{
  // Сбой отправки: «✓» и даты нет — «не нажали» отличимо от «не долетело».
  resetSignals()
  postMode = 'neterror'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads: [] })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = document.querySelector('[data-test="signal-rate-slider"]')
  sl.value = '5'; await fire(sl, 'input')
  await fire(document.querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('сетевой сбой: «✓» нет, даты нет (молча не гасим)',
    !el.textContent.includes('Прочитано ✓') &&
    !el.querySelector('[data-test="signal-read-date"]'))
  app.unmount()
  postMode = 'ok'
}
console.log('\n=== jsdom: NET-62 — «не оценил» это null, а не ноль ===')
{
  // Дефект прожил одиннадцать дней при ЗЕЛЁНОЙ приёмке: фикстуры со `score: null`
  // были про ДРУГИЕ даты, и до формулы дело не доходило. Поэтому здесь всё — на
  // СОВПАДАЮЩЕЙ строке проекции, той самой, которую карточка и рисует.
  check('scoreOf: пустота — это null, а не ноль', [
    [{ score: null }, null], [{ score: '' }, null], [{ score: undefined }, null],
    [{}, null], [null, null], [undefined, null],
    [{ score: 0 }, 0], [{ score: 7 }, 7], [{ score: '3' }, 3],
    [{ score: 11 }, null], [{ score: -1 }, null], [{ score: 2.5 }, null], [{ score: 'ага' }, null],
  ].every(([input, want]) => bundle.scoreOf(input) === want))
}
{
  // Ядро NET-62. Пара «прочитал, но не оценил» — ровно случай (piterland, 12.08):
  // отметка есть, строки оценки нет, проекция отдаёт score: null.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const reads = [{ park: 'ohta', signal_date: '2025-05-16', read_at: '2025-05-16 11:36', score: null }]
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads })
  await nextTick()
  const btn = el.querySelector('[data-test="signal-read"]')
  check('прочитано без оценки: ноль НЕ нарисован нигде на карточке',
    btn.dataset.scored === '0' && !el.querySelector('[data-test="signal-score-badge"]') &&
    !/Ваша оценка/.test(el.textContent) && !/\b0\b/.test(btn.textContent),
    btn.textContent.trim())
  check('состояние названо словами, как в пульте владельца: «оценка не поставлена»',
    !!el.querySelector('[data-test="signal-score-none"]') &&
    el.textContent.includes('оценка не поставлена'))
  check('кнопка зовёт оценить, а не «изменить оценку»',
    btn.textContent.includes('Оценить') && !el.querySelector('[data-test="signal-score-change"]'))
  // Вторая половина дефекта: из этого же null модалка открывалась на нуле УЖЕ
  // тронутой, и одно нажатие «Отправить» записывало ноль в signal_scores.
  await fire(btn, 'click')
  await nextTick()
  check('шкала открывается БЕЗ значения — ноль не предзаполнен',
    rateSheet().querySelector('[data-test="signal-rate-value"]').textContent.trim() === '—')
  check('«Отправить» заблокирована: нажатием ноль не записать',
    rateSheet().querySelector('[data-test="signal-rate-submit"]').disabled === true)
  await fire(rateSheet().querySelector('[aria-label="Закрыть"]'), 'click')
  await drainOutbox()
  check('закрытие шкалы у уже отмеченного дня лишнего POST не шлёт',
    postedBodies.length === 0, String(postedBodies.length))
  app.unmount()
}
{
  // Настоящий ноль обязан остаться возможным: управляющий вправе сказать «не полезно»,
  // и запрещать это — значит потерять настоящие нули вместе с ложными (§4.3 задания).
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads: [] })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  sl.value = '0'; await fire(sl, 'input')
  await nextTick()
  check('осознанный ноль виден на шкале и разрешён к отправке',
    rateSheet().querySelector('[data-test="signal-rate-value"]').textContent.trim() === '0' &&
    rateSheet().querySelector('[data-test="signal-rate-submit"]').disabled === false)
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('осознанный ноль уходит на бэк как score: 0',
    postedBodies.length === 1 && JSON.parse(postedBodies[0]).score === 0, postedBodies[0])
  check('и подтверждается на экране числом «0», а не пустотой',
    el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '0' &&
    el.textContent.includes('Ваша оценка'))
  app.unmount()
}
{
  // Повторное подтверждение той же пары не плодит элементов: ключ очереди — (парк,
  // дата), тот же, что ключ дедупликации на бэке. Строка в signal_scores остаётся одна.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID, reads: [] })
  await nextTick()
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  const sl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  sl.value = '7'; await fire(sl, 'input')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await nextTick()
  // Первопричина дублей: экран не отвечал, и оценку ставили второй раз. Пока запрос
  // в пути, второе нажатие физически невозможно — кнопка заблокирована.
  check('пока отправляем — второе нажатие невозможно',
    el.querySelector('[data-test="signal-read"]').disabled === true && !rateSheet())
  check('очередь на пару одна', sr.queue.value.length === 1, JSON.stringify(sr.queue.value))
  await drainOutbox()
  // Осознанный повтор той же оценки: шкала открывается на записанном значении и
  // сразу готова к отправке — переоценка это штатный сценарий, а не ошибка.
  await fire(el.querySelector('[data-test="signal-read"]'), 'click')
  await nextTick()
  check('повторное открытие: шкала на записанном значении',
    rateSheet().querySelector('[data-test="signal-rate-value"]').textContent.trim() === '7')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await drainOutbox()
  check('повтор не оставил долгов и не размножил элементы очереди',
    sr.queue.value.length === 0 && postedBodies.length === 2,
    `очередь ${sr.queue.value.length}, POST ${postedBodies.length}`)
  check('на экране по-прежнему записанное число',
    el.querySelector('[data-test="signal-score-badge"]')?.textContent.trim() === '7')
  app.unmount()
}

console.log('\n=== jsdom: копирование сигнала в буфер (15.08) ===')
{
  // Формат проверяем отдельно от буфера: текст должен быть пригоден для пересылки в
  // чат смены, без подписей кнопок и служебных строк карточки.
  const S = { date: '2025-05-16', status: 'ok', headline: 'Темп восстановлен', action: 'Держим утренний слот' }
  const txt = bundle.signalPlainText(S, { title: 'Сигнал Дня', by: 'разбор аналитика от', date: '16.05' })
  check('копируется заголовок с датой, разбор и действие — блоками',
    txt === 'Сигнал Дня — разбор аналитика от 16.05\n\nТемп восстановлен\n\nДержим утренний слот', JSON.stringify(txt))
  check('без действия — только разбор, пустого хвоста нет',
    bundle.signalPlainText({ headline: 'Только разбор' }, { title: 'Сигнал Дня' }) === 'Сигнал Дня\n\nТолько разбор')
  check('пустой сигнал копировать нечего',
    bundle.signalPlainText(null) === '' && bundle.signalPlainText({}) === '')
}
{
  // Буфер в jsdom не реализован — подставляем свой, как это делает браузер.
  // navigator в Node 22 только через defineProperty, иначе присваивание молча не пройдёт.
  const copied = []
  let clipOk = true
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { if (!clipOk) throw new Error('нет прав'); copied.push(t) } },
  })

  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  const copyBtn = el.querySelector('[data-test="signal-copy"]')
  check('кнопка копирования есть и подписана для скринридера',
    !!copyBtn && copyBtn.getAttribute('aria-label') === 'Скопировать сигнал')
  check('тач-таргет 44pt, хотя иконка мелкая',
    copyBtn.className.includes('h-11') && copyBtn.className.includes('w-11'))
  // Копирование — служебный жест, а не второе равнозначное действие: иконка, не плашка.
  // Полноширинная кнопка рядом с призывом вернула бы конкуренцию, снятую в NET-61.
  check('это иконка, а не плашка-кнопка рядом с призывом',
    !copyBtn.className.includes('w-full') &&
    el.querySelector('[data-test="signal-card"]').querySelectorAll('[data-test="signal-read"]').length === 1)

  await fire(copyBtn, 'click')
  await flush(2)
  check('в буфер уехал текст свежего разбора', copied.length === 1 &&
    copied[0].includes('Темп восстановлен к выходным') && copied[0].includes('16.05'), copied[0])
  const toast = () => document.querySelector('[data-test="signal-toast"]')
  check('всплывашка «Сигнал скопирован» показана',
    !!toast() && toast().textContent.includes('Сигнал скопирован'))
  check('всплывашка объявлена скринридеру и не забирает фокус',
    toast().getAttribute('role') === 'status' && toast().getAttribute('aria-live') === 'polite')
  // Плашка обязана лежать ВЫШЕ таб-бара: тот же расчёт, что у плавающей кнопки «+».
  check('всплывашка не уезжает под таб-бар и учитывает safe-area',
    /padding-bottom:\s*calc\(4\.75rem\s*\+\s*env\(safe-area-inset-bottom\)\)/.test(toast().getAttribute('style') || ''),
    toast().getAttribute('style'))
  check('всплывашка привязана к мобильной колонке, а не к краю экрана',
    toast().className.includes('max-w-[430px]') && toast().className.includes('mx-auto'))
  check('всплывашка не перехватывает нажатия под собой',
    toast().className.includes('pointer-events-none'))
  // Копирование — это НЕ прочтение: read_at меряет скорость реакции на сигнал, а не
  // факт пересылки. Смешивать события нельзя, иначе метрика начнёт мерить не то.
  check('копирование ничего не отправляет и не отмечает прочтение',
    postedBodies.length === 0 && !el.textContent.includes('Прочитано ✓') &&
    sr.queue.value.length === 0)

  // Отказ буфера (не защищённый контекст, старая iOS) не должен выглядеть как успех.
  clipOk = false
  await fire(copyBtn, 'click')
  await flush(2)
  check('буфер отказал — сказано словами, а не тишиной',
    !!toast() && toast().textContent.includes('Не удалось скопировать'), toast()?.textContent)
  clipOk = true

  // Прошлые разборы пересылают тоже — кнопка есть и в раскрытой строке ленты.
  copied.length = 0
  await fire(el.querySelector('[data-test="signal-feed-toggle"]'), 'click')
  await nextTick()
  const row = el.querySelectorAll('[data-test="signal-feed-row"]')[0]
  await fire(row.querySelector('button'), 'click')
  await nextTick()
  const rowCopy = row.querySelector('[data-test="signal-copy"]')
  check('в раскрытой строке ленты кнопка копирования тоже есть', !!rowCopy)
  await fire(rowCopy, 'click')
  await flush(2)
  check('строка ленты копирует СВОЙ день, а не свежий сигнал',
    copied.length === 1 && copied[0].includes('14.05') && !copied[0].includes('16.05'), copied[0])

  // Плашка не залипает: без снятия она перекрыла бы нижнюю часть экрана навсегда.
  await new Promise((r) => setTimeout(r, 2400))
  await nextTick()
  check('всплывашка сама уходит через ~2 с', !toast())
  app.unmount()
  await nextTick()
  check('после ухода экрана всплывашки в body не остаётся', !toast())
}

{
  const src = readFileSync(resolve(root, 'src/screens/DailyScreen.vue'), 'utf8')
  const dash = readFileSync(resolve(root, 'src/components/daily/DailyDashboard.vue'), 'utf8')
  check('DailyScreen отдаёт проекцию в дашборд', src.includes(':reads="data?.signal_reads || []"'))
  check('DailyScreen отдаёт межмесячный пул сигналов (Ф-7)',
    src.includes(':signals="signalPool"') && src.includes('collectSignals'))
  check('дашборд прокидывает её в карточку сигнала', dash.includes(':reads="reads"'))
  // Сторож против ЧЕТВЁРТОЙ копии формулы. Две копии `Number(entry.score)` (кнопка и
  // стартовое значение шкалы) рисовали ноль там, где оценки нет, — одиннадцать дней
  // при зелёной приёмке. Приведение теперь одно и живёт в scoreOf.
  const btnSrc = readFileSync(resolve(root, 'src/components/daily/SignalMarkButton.vue'), 'utf8')
  const cardSrc = readFileSync(resolve(root, 'src/components/daily/DailySignalCard.vue'), 'utf8')
  check('приведения оценки в компонентах нет — только scoreOf',
    !/Number\([^)]*score/.test(btnSrc.replace(/^\s*\/\/.*$/gm, '')) &&
    !/Number\([^)]*score/.test(cardSrc.replace(/^\s*\/\/.*$/gm, '')) &&
    btnSrc.includes('scoreOf') && cardSrc.includes('scoreOf'))
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
  // Ревизия владельца 30.07: плитки «Тренды» и «Прогресс» убраны — они дублировали
  // вкладки таб-бара. Осталось ТРИ входа, которых в таб-баре нет, «Драйверы» первой.
  check('плиток на Главной 3', tiles.length === 3, tiles.length)
  check('«Драйверы» — первая плитка',
    tiles[0]?.getAttribute('data-test') === 'tile-drivers' && tiles[0].textContent.includes('Драйверы'),
    tiles[0]?.getAttribute('data-test'))
  check('порядок плиток: Драйверы,Мастерплан,Материалы',
    tiles.map((t) => t.textContent.trim()).join(',') === 'Драйверы,Мастерплан,Материалы',
    tiles.map((t) => t.textContent.trim()).join(','))
  // Плиток-дублей вкладок больше нет: доступ к «Трендам»/«Прогрессу» — только таб-бар.
  check('плиток-дублей вкладок нет (tile-summary / Прогресс)',
    !tiles.some((t) => t.getAttribute('data-test') === 'tile-summary' || t.textContent.includes('Прогресс')))
  const mp = tiles.find((t) => t.getAttribute('data-test') === 'tile-masterplan')
  await fire(mp, 'click')
  check('тап по «Мастерплану» → под-страница «Цели и планы» (goals)',
    nav.subView.value === 'goals', nav.subView.value)
  bundle.clearSubView()
  await fire(tiles[0], 'click')
  // 30.07: «Драйверы» — под-страница (в таб-баре раздела нет).
  check('тап по «Драйверам» → под-страница «drivers», вкладка не меняется',
    nav.subView.value === 'drivers' && nav.active.value === 'home',
    `${nav.active.value}/${nav.subView.value}`)
  const mt = tiles.find((t) => t.getAttribute('data-test') === 'tile-materials')
  bundle.clearSubView()
  await fire(mt, 'click')
  check('тап по «Материалам» → под-страница «materials»',
    nav.subView.value === 'materials', nav.subView.value)
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

console.log('\n=== D-20/D-23: «Мастерплан» → «Ранскеил» в PWA ===')
{
  const banner = readFileSync(resolve(root, 'src/components/home/InstallPwaBanner.vue'), 'utf8')
  // смотрим ВИДИМЫЙ текст: <template> + строки шагов, а не комментарии-объяснения
  const bannerVisible = banner.slice(banner.indexOf('const steps'))
  check('в видимом тексте PWA-баннера «Мастерплана» нет', !bannerVisible.includes('Мастерплан'))
  check('во всех четырёх местах баннера теперь «Ранскеил»',
    (bannerVisible.match(/Ранскеил/g) || []).length === 4, (bannerVisible.match(/Ранскеил/g) || []).length)
  check('баннер зовёт открыть Ранскеил', /Откройте Ранскеил/.test(banner))
  // D-23: старое написание через «й» не должно остаться нигде во ВИДИМОМ тексте.
  check('написания через «й» в видимом тексте баннера нет', !/Ранскей/.test(bannerVisible))
  // D-23: имя не склоняется — падеж берёт на себя соседнее слово. Регресс-чек
  // ловит возврат «Ранскеила»/«Ранскеилом», которые читаются как опечатка.
  check('имя стоит только в именительном (нет «Ранскеила»/«Ранскеилом»)',
    !/Ранскеил[аеоуы]/.test(bannerVisible))
  const mf = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8'))
  check('manifest.name / short_name = «Ранскеил»', mf.name === 'Ранскеил' && mf.short_name === 'Ранскеил')
  check('иконки манифеста НЕ трогали (отдельная задача владельца)',
    mf.icons.length === 4 && mf.icons.every((i) => /icon-(192|512)\.png$/.test(i.src)))
}

console.log('\n=== D-21/D-23: экран входа — логотип Ранскеил + бейдж «Ультра» ===')
{
  const { el, app } = mount(bundle.AccessKeyForm, {})
  await nextTick()

  // 1. логотип вместо слогана
  const logo = el.querySelector('[data-test="access-logo"]')
  const chev = el.querySelector('[data-test="access-chevron"]')
  const word = el.querySelector('[data-test="access-wordmark"]')
  check('слогана «Расти с планом» больше нет', !el.textContent.includes('Расти'))
  check('логотип озвучен для скринридера один раз (role=img + aria-label)',
    !!logo && logo.getAttribute('role') === 'img' && logo.getAttribute('aria-label') === 'Ранскеил Ультра' &&
    word.getAttribute('aria-hidden') === 'true')
  check('шеврон — SVG-маска, цвет из токена (не хардкод #111)',
    !!chev && /mask-image/i.test(chev.getAttribute('style') || '') &&
    chev.className.includes('bg-[var(--text)]'))
  // D-23b (19.08): мобильная связка увеличена ×1.25 — 53px спорил по весу с
  // подвальным «Модуль Роста». Базовые 53px были промерены по мокапу v2
  // (780×1500 = 390×750 @2x: знак 106px = 53px CSS). Десктоп не трогали.
  check('шеврон 66px на мобайле (×1.25 к прежним 53) и 80px на ≥768px',
    chev.className.includes('h-[66px]') && chev.className.includes('md:h-[80px]'))
  // РЕГРЕСС-ЧЕК на боевой баг: без явной ширины пустой div во flex-колонке с
  // align-items:center получает ширину 0 — знак пропадал совсем (было видно на проде).
  check('у шеврона ЯВНАЯ ширина (77/94px), а не только aspect-ratio',
    chev.className.includes('w-[77px]') && chev.className.includes('md:w-[94px]'))
  check('ширина совпадает с пропорцией знака 1080:923.72',
    Math.round(66 * 1080 / 923.72) === 77 && Math.round(80 * 1080 / 923.72) === 94)
  check('пропорция шеврона задана явно (бокс = знак, без прозрачных полей)',
    /aspect-ratio:\s*1080\s*\/\s*923\.72/.test(chev.getAttribute('style') || ''))
  check('слово «Ранскеил» — голос бренда, капс, 35px (×1.25), трекинг 0.06em',
    word.textContent.trim() === 'Ранскеил' && word.className.includes('font-brand') &&
    word.className.includes('uppercase') && word.className.includes('text-[2.1875rem]') &&
    word.className.includes('tracking-[0.06em]'))
  check('зазор шеврон→слово 15px, на десктопе 18px',
    word.className.includes('mt-[15px]') && word.className.includes('md:mt-[18px]'))
  check('десктоп: слово 42px', word.className.includes('md:text-[2.625rem]'))
  check('доля шеврона от слова не изменилась: 44% и на 53/28, и на 66/35',
    Math.round(62 / 141.51 * 100) === Math.round(77 / (141.51 * 35 / 28) * 100))
  check('старого написания через «й» на экране входа нет', !/Ранскей/.test(el.textContent))

  // 1b. D-23: бейдж уровня продукта — третий ярус лочкапа
  const badge = el.querySelector('[data-test="access-badge"]')
  check('под словом есть бейдж «Ультра»', !!badge && badge.textContent.trim() === 'Ультра')
  check('бейдж — тот же голос бренда, капс, 17.5px = половина слова, трекинг 0.32em',
    badge.className.includes('font-brand') && badge.className.includes('uppercase') &&
    badge.className.includes('text-[1.09375rem]') && badge.className.includes('tracking-[0.32em]'))
  check('кегль бейджа — ровно половина слова', 1.09375 * 2 === 2.1875)
  // Разгонка и компенсация хвостового интервала ходят ТОЛЬКО парой: правка одной
  // без другой смещает слово в рамке влево на пол-интервала (было видно у слова).
  {
    const tr = badge.className.match(/tracking-\[([\d.]+)em\]/)
    const inner = badge.querySelector('span')
    check('компенсация хвостового трекинга равна самому трекингу',
      !!tr && inner.className.includes(`mr-[-${tr[1]}em]`), tr && tr[1])
  }
  // Поля — пропорция от кегля, а не два независимых числа: иначе доля бейджа от
  // слова разъедется между брейкпоинтами и связка перестанет выглядеть одинаково.
  check('боковые поля пропорциональны кеглю на обоих брейкпоинтах (0.571em)',
    badge.className.includes('px-[10px]') && badge.className.includes('md:px-[12px]') &&
    Math.abs(10 / 17.5 - 12 / 21) < 1e-9)
  // РЕГРЕСС-ЧЕК на решение владельца 19.08: бейдж — РАМКА, а не заливка.
  // Возврат к `bg-[var(--text)]` = смена решения, а не мелкая правка стиля.
  check('бейдж — обводка, а не заливка', badge.className.includes('border-[1.5px]') &&
    badge.className.includes('border-[var(--text)]') && !badge.className.includes('bg-['))
  // РЕГРЕСС-ЧЕК на угол: радиус на объекте 22px читается как «здесь кнопка»
  // и выбивает бейдж из знака в интерфейс. Шеврон и Univers Cond — на прямых.
  check('угол ПРЯМОЙ (никаких rounded-*)', !/\brounded/.test(badge.className))
  check('высота бейджа 27px, на десктопе 32px',
    badge.className.includes('h-[27px]') && badge.className.includes('md:h-[32px]'))
  // РЕГРЕСС-ЧЕК на группировку (D-23b). Бейдж прижат к слову ВПЛОТНУЮ: зазор
  // даёт пустота под выносными элементами (0.2em при leading-none = 7px), а не
  // margin. Возврат любого mt-[Npx] снова разведёт лочкап на три равных яруса,
  // и «Ранскеил Ультра» перестанет читаться одним именем.
  check('бейдж прижат к слову: mt-0, никаких mt-[Npx] и md:mt-*',
    badge.className.includes('mt-0') && !/\bmt-\[/.test(badge.className) &&
    !/\bmd:mt-/.test(badge.className))
  check('зазор над словом заметно больше зазора под ним (знак отдельно, имя вместе)',
    (15 + (0.8 - 0.722) * 35) / (0.2 * 35) >= 2)
  check('десктоп: кегль бейджа 21px, обводка 2px',
    badge.className.includes('md:text-[1.3125rem]') && badge.className.includes('md:border-2'))
  // Оптический центр надписи в рамке (правка 19.08 по замеру на устройстве).
  // Величина 0.095em выведена из скриншота 414×896 @3x: рамка 812…892, капс
  // 830…867, перекос 7 device px. Число в em, а не в px, — иначе на десктопном
  // кегле поправка перестанет соответствовать.
  {
    const inner = badge.querySelector('span')
    check('надпись сдвинута к оптическому центру рамки на 0.095em',
      !!inner && inner.className.includes('relative') && inner.className.includes('top-[0.095em]'))
    // Своё значение для десктопа — не дубль, а замер: движки читают разные
    // метрики шрифта (hhea 800/200 против winAscent 969), и базовая линия в
    // строке встаёт по-разному. Мобильные 0.095em на десктопе перелетают на 1px.
    check('у десктопа своя поправка по замеру (md:top-[0.05em])',
      inner.className.includes('md:top-[0.05em]'))
    check('поправка НЕ через padding: он двигает содержимое лишь на половину',
      !/\bpt-\[/.test(badge.className))
    check('поправка в em, а не в px (переезжает на десктопный кегль сама)',
      !/top-\[[\d.]+px\]/.test(inner.className))
  }
  check('бейдж скрыт от скринридера (уровень уже озвучен в aria-label лого)',
    badge.getAttribute('aria-hidden') === 'true')
  // Цвет — только токеном. Хардкод hex в компонентах запрещён (DESIGN-STANDARD).
  check('в бейдже нет хардкода hex', !/#[0-9a-fA-F]{3,6}/.test(badge.className))

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
  // D-23b: полотно документа на входе (баг «белая полоса при оттягивании»).
  // Проверяем ПО ИСХОДНИКАМ, а не по jsdom: rubber band в jsdom не воспроизвести,
  // а сломать связку можно только убрав одно из трёх звеньев.
  {
    const tc = readFileSync(resolve(root, 'src/composables/useThemeColor.js'), 'utf8')
    const appSrc = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
    const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8')
    check('есть переключатель полотна (setAuthCanvas)', /export function setAuthCanvas/.test(tc))
    check('он вешает/снимает auth-dark именно на documentElement',
      /documentElement/.test(tc) && /setAttribute\('data-theme', 'auth-dark'\)/.test(tc) &&
      /removeAttribute\('data-theme'\)/.test(tc))
    check('App.vue зовёт его в ОДНОМ эффекте с theme-color (иначе полоса на стыке)',
      /setThemeColor\([^)]*\)\s*\n\s*setAuthCanvas\(!inApp\)/.test(appSrc))
    check('CSS красит корень и body фоном экрана входа (--bg, не --surface-2)',
      /html\[data-theme='auth-dark'\][\s\S]{0,80}body\s*\{\s*background:\s*var\(--bg\)/.test(css))
    check('на корне выставлен color-scheme: dark (системные полосы фоном не красятся)',
      /html\[data-theme='auth-dark'\]\s*\{\s*color-scheme:\s*dark/.test(css))
    check('второго списка hex для полотна не завели (цвет только из токенов)',
      !/setAuthCanvas[\s\S]{0,400}#[0-9a-fA-F]{6}/.test(tc))
  }

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
  // ФОРМУЛИРОВКА УТОЧНЕНА 19.08 (D-23b). Прежний чек требовал, чтобы селектора
  // html[data-theme] в CSS не было вовсе, и «проходил» только потому, что новое
  // правило лежит внутри @layer base с отступом, — то есть проходил бы и при
  // настоящей поломке. Теперь проверяем СМЫСЛ: тёмная витрина не может быть
  // дефолтом (:root), а правило на html имеет право красить ТОЛЬКО полотно и
  // color-scheme — набор токенов остаётся скоупным на [data-theme="auth-dark"].
  check('тёмная витрина не дефолт: в :root её значений нет',
    !/:root\s*{[^}]*#0A0A0A/m.test(css))
  {
    const htmlRules = css.match(/html\[data-theme='auth-dark'\][^{]*\{[^}]*\}/g) || []
    check('правила на html красят только полотно и color-scheme, токенов не задают',
      htmlRules.length > 0 &&
      htmlRules.every((r) => /^[^{]*\{\s*(background:\s*var\(--bg\);|color-scheme:\s*dark;)\s*\}$/.test(r)),
      htmlRules.join(' | '))
  }

  const app = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
  check('theme-color переключает App по состоянию гейта, а не форма входа',
    /const inApp = authed\.value/.test(app) &&
    /setThemeColor\(inApp \? APP_THEME_COLOR : AUTH_THEME_COLOR\)/.test(app))
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
  // Мок — май 2025, месяц давно прошёл: бейдж обязан говорить «закрыт», а не
  // выдавать остаток из daysDone/daysTotal (фикс 30.07.2026 — остаток считается
  // по календарю МСК, а не по числу закрытых дней в выгрузке).
  check('прошедший месяц → «Месяц закрыт», а не остаток из данных',
    !!badge && badge.textContent.trim() === 'Месяц закрыт', badge && badge.textContent.trim())
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

console.log('\n=== Остаток дней месяца — календарь Москвы (фикс 30.07.2026) ===')
{
  // Фиксированные моменты UTC: проверяем, что считается ИМЕННО московский день.
  const at = (iso) => new Date(iso)
  check('30 июля 12:00 МСК → осталось 2 дня (сегодня входит)',
    daysLeftInMonth('2026-07', at('2026-07-30T09:00:00Z')) === 2,
    daysLeftInMonth('2026-07', at('2026-07-30T09:00:00Z')))
  check('последний день месяца → остаток 1, а не 0',
    daysLeftInMonth('2026-07', at('2026-07-31T09:00:00Z')) === 1)
  check('первый день месяца → весь месяц целиком',
    daysLeftInMonth('2026-07', at('2026-07-01T09:00:00Z')) === 31)
  check('февраль високосного года → 29 дней', daysInMonth(2028, 2) === 29, daysInMonth(2028, 2))
  check('прошедший месяц → 0 («Месяц закрыт»)', daysLeftInMonth('2026-06', at('2026-07-30T09:00:00Z')) === 0)
  check('будущий месяц → длина месяца', daysLeftInMonth('2026-08', at('2026-07-30T09:00:00Z')) === 31)
  check('мусор на входе → null (вызывающий падает на фолбэк)',
    daysLeftInMonth('', at('2026-07-30T09:00:00Z')) === null && daysLeftInMonth('2026-7', new Date()) === null)
  // ГРАНИЦА ЧАСОВОГО ПОЯСА: 31 июля 21:30 UTC = 1 августа 00:30 МСК. Для июля
  // месяц уже закрыт, для августа остаток полный. Локальная зона устройства
  // (у CI это часто UTC) не должна на это влиять.
  check('21:30 UTC 31.07 = 00:30 МСК 01.08 → июль закрыт',
    daysLeftInMonth('2026-07', at('2026-07-31T21:30:00Z')) === 0,
    daysLeftInMonth('2026-07', at('2026-07-31T21:30:00Z')))
  check('та же секунда → у августа остаток 31',
    daysLeftInMonth('2026-08', at('2026-07-31T21:30:00Z')) === 31)
  // Бейдж НЕ зависит от того, сколько дней закрыто в выгрузке: та же дата,
  // разные daysDone — один и тот же остаток.
  const today = mskToday(at('2026-07-30T09:00:00Z'))
  check('mskToday даёт ym текущего месяца', today.ym === '2026-07', today && today.ym)

  // Живой месяц в деке: бейдж считает от сегодняшней даты, а не от daysDone.
  const nowYm = mskToday(new Date()).ym
  const live = mount(bundle.MonthProgressCard, {
    slides: [{ key: 'p', title: 'Парк', month: nowYm, fact: 1, plan: 2, forecast: 1.5, goal: 3,
      daysDone: 1, daysTotal: 31 }], // данные врут про 30 оставшихся — календарь их перебивает
    month: nowYm,
    loading: false,
  })
  const b = document.querySelector('[data-test="month-deck-days"]')
  const expLeft = daysLeftInMonth(nowYm, new Date())
  // Склоняется и ГЛАГОЛ: «остался 1 день», но «осталось 2 дня» / «осталось 5 дней».
  const daysWord = (n) =>
    `${plural(n, ['Остался', 'Осталось', 'Осталось'])} ${n} ${plural(n, ['день', 'дня', 'дней'])}`
  check('текущий месяц → остаток из календаря, а не из daysDone/daysTotal',
    !!b && b.textContent.trim() === daysWord(expLeft), b && b.textContent.trim())
  live.app.unmount(); document.body.innerHTML = ''

  // Склонение на всех формах: единица, 2–4, 5+, а также 11 и 21 (ловушки правила).
  for (const [n, exp] of [
    [1, 'Остался 1 день'], [2, 'Осталось 2 дня'], [4, 'Осталось 4 дня'],
    [5, 'Осталось 5 дней'], [11, 'Осталось 11 дней'], [21, 'Остался 21 день'],
    [22, 'Осталось 22 дня'], [31, 'Остался 31 день'],
  ]) {
    check(`склонение остатка: ${n} → «${exp}»`, daysWord(n) === exp, daysWord(n))
  }
}

console.log('\n=== jsdom: D-34 — пилюли парков сняты с Главной ===')
{
  const src = readFileSync(resolve(root, 'src/screens/HomeScreen.vue'), 'utf8')
  check('в HomeScreen не осталось строки пилюль (parkNames)', !src.includes('parkNames'))
  check('месяц в шапке деки, monthCap из HomeScreen убран', !src.includes('monthCap'))
  check('дека получает слайды и месяц', src.includes(':slides="monthSlides"') && src.includes(':month="t.month'))
}

// ═══════════ ТЗ-6: месяц по умолчанию + пикер месяцев «Контроля дня» ═══════════
// Фикстура — июль (живой) + август (план/цель есть, days пустые), как в §5 ТЗ.
console.log('\n=== ТЗ-6: правило выбора месяца (pickMonth) ===')
{
  const at = (iso) => new Date(iso)
  const M = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

  // §5 п.1 — главный кейс: в данных ЕСТЬ пустой август, но 30 июля берём ИЮЛЬ.
  check('30 июля при наличии августа → июль (пустой будущий сам не выбирается)',
    bundle.pickMonth(M, at('2026-07-30T09:00:00Z')) === '2026-07',
    bundle.pickMonth(M, at('2026-07-30T09:00:00Z')))
  // §5 п.5 — 1 августа переключается сам.
  check('1 августа → август (перекат без правки кода)',
    bundle.pickMonth(M, at('2026-08-01T00:30:00+03:00')) === '2026-08')
  check('31 июля 23:30 МСК — ещё июль (граница суток по Москве)',
    bundle.pickMonth(M, at('2026-07-31T20:30:00Z')) === '2026-07')
  // Правило 2: текущего месяца в данных нет → последний НЕ ПОЗЖЕ текущего.
  check('сентябрь, данных нет → последний закрытый (август), а не «пусто»',
    bundle.pickMonth(M, at('2026-09-10T09:00:00Z')) === '2026-08')
  check('данных за текущий нет, есть дырка → ближайший прошлый',
    bundle.pickMonth(['2026-04', '2026-06'], at('2026-07-05T09:00:00Z')) === '2026-06')
  // Правило 3: только будущее — показываем хоть что-то, а не пустой экран.
  check('в данных только будущее → последний доступный',
    bundle.pickMonth(['2026-09'], at('2026-07-05T09:00:00Z')) === '2026-09')
  check('пустой список → null', bundle.pickMonth([], at('2026-07-05T09:00:00Z')) === null)
  check('порядок на входе не важен',
    bundle.pickMonth(['2026-08', '2026-04', '2026-07'], at('2026-07-30T09:00:00Z')) === '2026-07')
}

console.log('\n=== ТЗ-6: виджет месяца на Главной переживает перекат ===')
{
  // Тот же набор, что у экрана: июль полный + август пустой (план есть, дней нет).
  const july = JSON.parse(JSON.stringify(sets))
  const setsTZ6 = {}
  for (const [k, s] of Object.entries(july)) {
    const m = s.month
    setsTZ6[`${s.park}:${m}`] = s
    // клон-«август»: план и цель есть, дни пустые — ровно маска будущего месяца
    const next = { ...JSON.parse(JSON.stringify(s)), month: '2099-12', days: [], journal: [] }
    setsTZ6[`${s.park}:2099-12`] = next
  }
  const ids = ['ohta', 'piterland', 'iyun']
  const nowInsideJuly = new Date(`${Object.values(july)[0].month}-15T09:00:00Z`)
  const nNow = bundle.computeNetworkB(setsTZ6, ids, nowInsideJuly)
  check('виджет НЕ прыгает на пустой будущий месяц',
    nNow.cards.length > 0 && nNow.cards.every((c) => c.month !== '2099-12'),
    JSON.stringify(nNow.cards.map((c) => c.month)))
  check('виджет показывает живой месяц с фактом',
    nNow.cards.every((c) => c.daysDone > 0))
  // а когда будущий месяц наступит — переключается сам
  const nFuture = bundle.computeNetworkB(setsTZ6, ids, new Date('2099-12-05T09:00:00Z'))
  check('наступил новый месяц → виджет перешёл на него сам',
    nFuture.cards.length > 0 && nFuture.cards.every((c) => c.month === '2099-12'),
    JSON.stringify(nFuture.cards.map((c) => c.month)))
  check('пустой месяц: факт 0 и НЕТ NaN/Infinity',
    nFuture.cards.every((c) => !c.earned && !BAD.test(JSON.stringify(c))),
    JSON.stringify(nFuture.cards[0]))
  check('месяц у Главной и у экрана считается ОДНИМ правилом',
    nNow.cards[0].month === bundle.pickMonth(
      Object.values(setsTZ6).filter((s) => s.park === nNow.cards[0].park).map((s) => s.month),
      nowInsideJuly))
}

console.log('\n=== Глубина пикера: «июль и далее, для чего есть план» (31.07) ===')
{
  // Апрель–июнь 2026 лежат в данных ПОЛНЫМИ месяцами (30/30 закрытых дней) — это
  // база для калибровки коэффициентов, а не месяцы контроля. Отличить их от июля
  // по форме нельзя, только по границе DAILY_FIRST_MONTH.
  const real = {}
  for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']) {
    real[`ohta:${m}`] = { park: 'ohta', month: m, month_target: 5000000 }
  }
  real['ohta:2026-09'] = { park: 'ohta', month: '2026-09', month_target: null } // плана нет
  real['piterland:2026-06'] = { park: 'piterland', month: '2026-06', month_target: 5749013 }

  check('граница — июль 2026', bundle.DAILY_FIRST_MONTH === '2026-07')
  check('апрель–июнь отброшены, июль и август остались',
    JSON.stringify(bundle.monthsForPicker(real, 'ohta')) === JSON.stringify(['2026-07', '2026-08']),
    JSON.stringify(bundle.monthsForPicker(real, 'ohta')))
  check('месяц без плана в список не идёт',
    !bundle.monthsForPicker(real, 'ohta').includes('2026-09'))
  check('чужой парк не подмешивается',
    !bundle.monthsForPicker(real, 'ohta').includes('2026-06'))
  // Фолбэк: под границу не попал никто → отдаём всё с планом, а не пустоту.
  check('парк только с дореформенными месяцами → фолбэк, а не пустой пикер',
    JSON.stringify(bundle.monthsForPicker(real, 'piterland')) === JSON.stringify(['2026-06']),
    JSON.stringify(bundle.monthsForPicker(real, 'piterland')))
  check('дев-фикстура 2025 года не остаётся без месяцев (тот же фолбэк)',
    bundle.monthsForPicker(sets, 'ohta').length > 0)
  // Дефолт считается по ОТФИЛЬТРОВАННОМУ списку — иначе открылся бы апрель.
  check('дефолт 31 июля = июль, а не апрель',
    bundle.pickMonth(bundle.monthsForPicker(real, 'ohta'), new Date('2026-07-31T09:00:00Z')) === '2026-07')
  check('дефолт 1 августа = август',
    bundle.pickMonth(bundle.monthsForPicker(real, 'ohta'), new Date('2026-08-01T00:30:00+03:00')) === '2026-08')
}

console.log('\n=== ТЗ-6: пикер месяцев на «Контроле дня» ===')
{
  const src = readFileSync(resolve(root, 'src/screens/DailyScreen.vue'), 'utf8')
  check('DailyScreen больше НЕ берёт months[months.length - 1]',
    !src.includes('months[months.length - 1]'))
  check('DailyScreen использует общее правило pickMonth', src.includes('pickMonth(parkMonths.value)'))
  check('выбор пользователя приоритетнее дефолта', src.includes('parkMonths.value.includes(picked.value)'))
  check('пикер — переиспользованный SummaryMonthPicker', src.includes('SummaryMonthPicker'))
  check('слот освобождается при уходе экрана', src.includes('clearTrailing'))

  const { trailing } = bundle.useNavTrailing()
  // Фикстура под ЖИВОЕ правило глубины: месяцы обязаны быть не раньше
  // DAILY_FIRST_MONTH, иначе пикер их отфильтрует и проверять будет нечего.
  // Даты мока (2025-05) переписываем на июль 2026 целиком — вместе с днями,
  // журналом и сигналами, чтобы набор остался самосогласованным.
  const nowM = new Date()
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const july = ym(nowM) // живой месяц = текущий
  const next = ym(new Date(nowM.getFullYear(), nowM.getMonth() + 1, 1)) // пустая маска следующего
  const sets2 = {}
  for (const s of Object.values(sets)) {
    const live = JSON.parse(JSON.stringify(s).split(s.month).join(july))
    sets2[`${s.park}:${july}`] = live
    // маска следующего месяца: план и цель есть, дней нет
    sets2[`${s.park}:${next}`] = { ...JSON.parse(JSON.stringify(live)), month: next, days: [], journal: [] }
  }
  getPayload = { updated: '2025-05-20', sets: sets2 }
  bundle.setPark('ohta')
  const scr = mount(bundle.DailyScreen, {})
  await nextTick(); await new Promise((r) => setTimeout(r, 30)); await nextTick(); await nextTick()

  check('пикер встал в правый верхний угол шапки', !!trailing.value, 'слот пуст')
  check('в списке оба месяца, новые сверху',
    !!trailing.value && JSON.stringify(trailing.value.props.months) === JSON.stringify([next, july]),
    trailing.value && JSON.stringify(trailing.value.props.months))
  check('выбран НЕ пустой будущий, а живой месяц',
    !!trailing.value && trailing.value.props.modelValue === july,
    trailing.value && trailing.value.props.modelValue)
  const txt = () => scr.el.textContent

  // §5 п.3: переключение на пустой будущий месяц не роняет экран и не даёт NaN
  trailing.value.props['onUpdate:modelValue'](next)
  await nextTick(); await nextTick()
  check('переключение на пустой месяц: экран жив', txt().length > 0)
  check('переключение на пустой месяц: нет NaN/undefined/Infinity', !BAD.test(txt()), txt().slice(0, 200))
  check('пикер показывает выбранный месяц', trailing.value.props.modelValue === next)

  // §5 п.4: возврат на живой месяц — полный контроль как раньше
  trailing.value.props['onUpdate:modelValue'](july)
  await nextTick(); await nextTick()
  check('возврат на живой месяц: данные на месте', !BAD.test(txt()) && txt().length > 0)

  // §5 п.6: смена парка пересчитывает список; «Вся сеть» — без пикера
  bundle.setPark('piterland')
  await nextTick(); await nextTick()
  check('смена парка: список месяцев пересчитан', !!trailing.value && trailing.value.props.months.length === 2)
  bundle.setPark('network')
  await nextTick(); await nextTick()
  check('«Вся сеть» → пикера нет (у парков свои месяцы)', !trailing.value)

  scr.app.unmount(); document.body.innerHTML = ''
  bundle.setPark('network')
  getPayload = {}
}

console.log('\n=== jsdom: v2.4 — Главная не молчит об ошибке загрузки ===')
{
  // 05.08: запрос Главной осёкся, «Контроль Дня» в тот же момент показывал цифры.
  // Главная отрисовала одни прочерки и ни слова о причине — единственный экран
  // дневного слоя, который не читал `error` из useDaily.
  localStorage.clear()
  bundle.clearSubView()
  getMode = 'fail400'
  const { el, app } = mount(bundle.HomeScreen, {})
  await flush()
  const err = el.querySelector('[data-test="home-load-error"]')
  check('плашка «Данные не загрузились» видна', !!err && err.textContent.includes('Данные не загрузились'))
  check('причина названа, а не спрятана', !!err && err.textContent.includes('400'))
  const btn = el.querySelector('[data-test="home-load-retry"]')
  check('кнопка «Повторить» есть, тач-таргет ≥44pt (HIG)',
    !!btn && (btn.getAttribute('style') || '').includes('44px'))
  check('виджеты при этом не исчезли — прочерки на местах', el.textContent.includes('План/Факт'))

  getMode = 'ok'
  getPayload = { updated: '2025-05-20', sets: {}, stats: { checkups: 7, signals: 5 }, reviews: [] }
  await fire(btn, 'click')
  await flush()
  check('после «Повторить» плашка ушла', !el.querySelector('[data-test="home-load-error"]'))
  check('счётчики загрузились', el.textContent.includes('7') && el.textContent.includes('5'))
  app.unmount()
  getPayload = {}
}

console.log('\n=== jsdom: подсказка про VPN на транспортной осечке ===')
{
  // Повод (владелец, 05.08): на Главной не грузилось, выключил VPN — загрузилось.
  // Транспортная осечка повторяемая, поэтому проверка честно ждёт все три попытки:
  // подсказка обязана появиться ПОСЛЕ них, а не вместо них.
  localStorage.clear()
  bundle.clearSubView()
  getMode = 'throw'
  const { el, app } = mount(bundle.HomeScreen, {})
  await new Promise((r) => setTimeout(r, 6200))
  await flush()
  const err = el.querySelector('[data-test="home-load-error"]')
  check('плашка есть', !!err)
  check('крупно — подсказка про VPN, дословно', !!err && err.textContent.includes(NET_HINTS.vpn))
  const reason = el.querySelector('[data-test="home-load-reason"]')
  check('мелко — техническая причина, она НЕ потерялась',
    !!reason && reason.textContent.trim().length > 0, reason?.textContent.trim())
  check('«Сеть недоступна» как причина транспортной осечки',
    !!reason && reason.textContent.includes('Сеть недоступна'), reason?.textContent.trim())

  // отказ бэка по существу — подсказки быть НЕ должно
  getMode = 'fail400'
  await fire(el.querySelector('[data-test="home-load-retry"]'), 'click')
  await flush()
  const err2 = el.querySelector('[data-test="home-load-error"]')
  check('при отказе бэка совет про VPN НЕ показываем', !!err2 && !err2.textContent.includes('VPN'))
  check('вместо него — заголовок «Данные не загрузились»',
    !!err2 && err2.textContent.includes('Данные не загрузились'))
  app.unmount()
  getMode = 'ok'
  getPayload = {}
}

console.log('\n=== jsdom: v2.4 — параллельные экраны склеиваются в ОДИН запрос ===')
{
  // От useDaily кормятся пять экранов, и каждый заводил свой запрос по 5–11 с.
  // Хуже времени было расхождение: один запрос падал, другой проходил, и payload
  // «был» и «не был» одновременно.
  localStorage.clear()
  bundle.clearSubView()
  getPayload = { updated: '2025-05-20', sets: {}, stats: { checkups: 3, signals: 2 }, reviews: [] }
  getCalls = 0
  const a = mount(bundle.HomeScreen, {})
  const b = mount(bundle.ReviewsScreen, {})
  await flush()
  check('два экрана в один тик → ОДИН GET, а не два', getCalls === 1, getCalls)
  check('оба получили данные (склейка отдаёт результат всем)',
    a.el.textContent.includes('3') && !b.el.textContent.includes('Не удалось'))
  a.app.unmount()
  b.app.unmount()

  // Промис снимается после завершения: следующий вход на экран запрашивает заново,
  // кэша с временем жизни здесь сознательно нет (его место — CacheService, NET-22).
  getCalls = 0
  const c = mount(bundle.HomeScreen, {})
  await flush()
  check('после завершения запроса следующий экран идёт в сеть снова', getCalls === 1, getCalls)
  c.app.unmount()
  getPayload = {}
}

console.log('\n=== jsdom: строка-сводка драйверов и маркер в дне (задание 06.08) ===')
{
  localStorage.clear()
  bundle.clearSubView()
  const mkSet = (activities) => ({
    ...sets['ohta:2025-05'], activities,
  })
  const mDrv = bundle.computeDailyB(mkSet([
    { code: 'DRV-04', name: 'Обход зала — цифровая форма', days: ['2025-05-13'],
      start: '2025-05-13', end: '', accuracy: 'день', measure: 'идёт' },
    { code: 'DRV-08', name: 'Фоновый драйвер', days: ['2025-05-01'],
      start: '2025-04-01', end: '', accuracy: 'месяц', measure: 'невозможен' },
  ]))

  const chips = [
    { id: 'идёт', label: 'Идёт', count: 4 },
    { id: 'готов', label: 'Готов', count: 2 },
    { id: 'пауза', label: 'Пауза', count: 0 },
  ]
  const row = mount(bundle.DailyDrivers, { m: mDrv, statuses: chips })
  const cta = row.el.querySelector('[data-test="drivers-cta"]')
  const stLine = row.el.querySelector('[data-test="drivers-statuses"]')
  check('кнопка-вход отрисована', !!cta)
  check('кнопка яркая: заливка акцентом, текст тёмным ink (жёлтый — только заливка)',
    cta.className.includes('bg-[var(--accent)]') && cta.innerHTML.includes('text-[var(--accent-ink)]'))
  check('имя раздела жирным и по центру',
    /font-bold/.test(cta.innerHTML) && /justify-center/.test(cta.innerHTML) && cta.className.includes('text-center'))
  check('иконка вплотную к слову и той же жирности (образец «▶ Коллекция»)',
    /-ml-1/.test(cta.innerHTML) && /stroke-width="3.25"/.test(cta.innerHTML), 'gap снят, stroke 3.25')
  check('заголовка «Активности и гипотезы» на экране нет', !row.el.textContent.includes('Активности'))
  check('процента «к плану» нигде нет (D-41)', !row.el.textContent.includes('к плану'))

  // Весь блок — одна кнопка (правка владельца 06.08): статусы уехали ВНУТРЬ неё.
  check('статусы лежат ВНУТРИ кнопки, отдельной строки под ней нет',
    !!stLine && cta.contains(stLine), !!stLine && cta.contains(stLine))
  // textContent склеивает соседние span-ы без пробела — сверяем по структуре,
  // а не по строке: иначе тест ловил бы вёрстку пробелов, а не смысл.
  const stItems = [...stLine.children].map((el) => [...el.children].map((c) => c.textContent.trim()))
  check('подпись + число в кружке, без точек-разделителей',
    JSON.stringify(stItems) === JSON.stringify([['Идёт', '4'], ['Готов', '2']])
    && !stLine.textContent.includes('·'),
    JSON.stringify(stItems))
  check('статус с нулём не печатается', !stLine.textContent.includes('Пауза'))
  check('кружок на жёлтом — ink-размыв от заливки, а не --line (иначе грязный тон)',
    /color-mix\(in srgb, var\(--accent-ink\) 12%, transparent\)/.test(stLine.innerHTML)
    && !/--line/.test(stLine.innerHTML))
  check('в блоке нет ничего, кроме кнопки — ни второй строки, ни второго фильтра',
    row.el.querySelectorAll('button').length === 1 && row.el.children[0].children.length === 1)

  const noSw = bundle.computeDailyB(mkSet([
    act('DRV-08', '2025-04-01', '', 'месяц', 'невозможен', ['2025-05-01']),
  ]))
  const rowNo = mount(bundle.DailyDrivers, { m: noSw, statuses: [] })
  check('статусов нет → кнопка остаётся кнопкой, а не ломается',
    !!rowNo.el.querySelector('[data-test="drivers-cta"]')
    && !rowNo.el.querySelector('[data-test="drivers-statuses"]'))
  rowNo.app.unmount()

  let opened = 0
  const row2 = mount(bundle.DailyDrivers, { m: mDrv, statuses: chips, onOpen: () => { opened++ } })
  row2.el.querySelector('[data-test="drivers-cta"]').click()
  check('клик по кнопке ведёт в раздел (эмитит open)', opened === 1, opened)
  check('кликабельна ТОЛЬКО кнопка — второго фильтра рядом с разделом не заводим',
    row2.el.querySelectorAll('button').length === 1)
  row.app.unmount(); row2.app.unmount()

  // Старый payload (боевой бэк до v3.14) — блока нет вовсе, а не «включений не было».
  const mOld = bundle.computeDailyB(mkSet([{ code: 'Г1', name: 'Старая', days: ['2025-05-13'] }]))
  const old = mount(bundle.DailyDrivers, { m: mOld, statuses: chips })
  check('старый payload → кнопки и сводки нет вовсе', !old.el.querySelector('[data-test="drivers-cta"]'))
  old.app.unmount()

  const wk = mount(bundle.DailyWeeks, { m: mDrv })
  const marks = wk.el.querySelectorAll('[data-test="drv-mark"]')
  check('метка в таблице дней ровно одна (только день включения)', marks.length === 1, marks.length)
  check('метка залитая (включение)', marks[0].getAttribute('data-kind') === 'on')
  check('метка — бейдж «ДР», а не точка (правка 06.08: точка не читалась)',
    marks[0].textContent.trim() === 'ДР', `«${marks[0].textContent.trim()}»`)
  check('кода драйвера на бейдже нет (D-76)', !/DRV-/.test(marks[0].textContent))
  check('код и название приходят в title',
    marks[0].getAttribute('title') === 'DRV-04 · Обход зала — цифровая форма · включён 13.05',
    marks[0].getAttribute('title'))
  check('бейдж не меняет высоту строки: компенсирующий отрицательный margin на месте',
    marks[0].className.includes('-my-1') && marks[0].className.includes('h-6'))
  const hit = marks[0].querySelector('span.absolute')
  check('активная зона метки 44×44pt и вне потока (не растит строку)',
    !!hit && hit.className.includes('h-11') && hit.className.includes('w-11'), hit && hit.className)
  // NET-33 §2.2: три вида метки по типу события. Проверяем именно ВИД, а не только
  // data-kind: залитый и «залитый с обводкой» обязаны отличаться на экране, иначе
  // перестройка снова станет неотличимой от запуска.
  const mReb = bundle.computeDailyB(mkSet([
    { code: 'DRV-04', name: 'Обход зала — цифровая форма', days: ['2025-05-13'],
      start: '2025-05-13', end: '', accuracy: 'день', measure: 'идёт', event: 'перестроен' },
    { code: 'DRV-02', name: 'Снятый драйвер', days: ['2025-05-20'],
      start: '2025-04-01', end: '2025-05-20', accuracy: 'день', measure: '', event: 'включён' },
  ]))
  const wkR = mount(bundle.DailyWeeks, { m: mReb })
  const mR = [...wkR.el.querySelectorAll('[data-test="drv-mark"]')]
  check('меток две: перестройка 13-го и выключение 20-го', mR.length === 2, mR.length)
  check('перестройка помечена своим типом', mR[0].getAttribute('data-kind') === 'rebuilt', mR[0].getAttribute('data-kind'))
  const badge = (b) => b.querySelector('i').className
  check('перестроен = ЗАЛИТЫЙ с обводкой (заливка --text + outline)',
    /bg-\[var\(--text\)\]/.test(badge(mR[0])) && /outline/.test(badge(mR[0])), badge(mR[0]))
  check('выключен остался пунктирным без заливки',
    /border-dashed/.test(badge(mR[1])) && !/bg-\[var\(--text\)\]/.test(badge(mR[1])), badge(mR[1]))
  check('включён и перестроен различимы: у включения обводки нет',
    !/outline/.test(badge(marks[0])), badge(marks[0]))
  check('в title перестройки стоит слово «перестроен», а не «включён»',
    mR[0].getAttribute('title').includes('перестроен') && !mR[0].getAttribute('title').includes('включён'),
    mR[0].getAttribute('title'))
  check('обводка НЕ ring: offset красился бы фоном, а строка выходного идёт на --surface-2',
    !/ring-/.test(badge(mR[0])), badge(mR[0]))
  wkR.app.unmount()

  let fromMark = 0
  const wk2 = mount(bundle.DailyWeeks, { m: mDrv, 'onOpen-drivers': () => { fromMark++ } })
  wk2.el.querySelector('[data-test="drv-mark"]').click()
  check('тап по метке тоже ведёт в раздел (§3.3)', fromMark === 1, fromMark)

  console.log('\n— таблица недель: помещается в мобильную колонку без скролла (06.08) —')
  const table = wk.el.querySelector('table')
  check('горизонтального скролла нет: обёртки overflow-x-auto не осталось',
    !/overflow-x-auto/.test(wk.el.innerHTML))
  check('min-width таблицы снят (не распирает колонку)', !/min-w-\[\d+px\]/.test(table.className), table.className)
  check('колонок четыре: день · план · факт · надо', table.querySelectorAll('thead th').length === 4,
    [...table.querySelectorAll('thead th')].map((t) => t.textContent.trim()).join(' · '))
  check('колонки «прогресс» больше нет — светофор ушёл в заливку факта',
    ![...table.querySelectorAll('thead th')].some((t) => t.textContent.includes('прогресс')))
  check('средний чек из таблицы убран (он живёт в «Метриках по дням»)',
    !table.textContent.includes('чек'))
  check('ширины колонок заданы процентами → числа не разъезжают вёрстку',
    table.className.includes('table-fixed') && /w-\[\d+%\]/.test(table.innerHTML))
  // Колонка дня была шире всех и оставляла провал до чисел (правка владельца 06.08).
  const ws = [...table.querySelectorAll('thead th')].map((t) => Number((t.className.match(/w-\[(\d+)%\]/) || [])[1]))
  check('колонка «день» уже колонки «факт» — провала между подписью и числами нет',
    ws[0] < ws[2], ws.join('% · ') + '%')
  check('сумма ширин = 100 %', ws.reduce((a, b) => a + b, 0) === 100, ws.reduce((a, b) => a + b, 0))
  check('суффикс тысяч — «k», а не «тыс» (колонки должны влезать без скролла)',
    ths(252000) === '252k' && thsSigned(-76000) === '−76k', `${ths(252000)} / ${thsSigned(-76000)}`)
  check('в таблице не осталось «тыс»', !table.textContent.includes('тыс'))

  console.log('\n— факт: плашка с числом внутри вместо полосы под числом (06.08) —')
  // Полоса под числом сдвигала цифру (ряд переставал читаться) и её серый трек
  // совпадал с фоном строки выходного — на субботе прогресса не было видно вовсе.
  const factCells = [...table.querySelectorAll('tbody tr')].map((tr) => tr.children[2])
  const filled = factCells.filter((c) => c.querySelector('span[style*="color-mix"]'))
  check('у закрытых дней факт лежит в плашке', filled.length > 0, filled.length)
  check('заливка плашки — тон ОТ ТОКЕНА сигнала, а не свой цвет',
    filled.every((c) => /color-mix\(in srgb, var\(--(positive|warning|negative)\) \d+%, var\(--surface\)\)/
      .test(c.querySelector('span[style*="color-mix"]').getAttribute('style'))),
    filled[0].querySelector('span[style*="color-mix"]').getAttribute('style'))
  check('число внутри плашки, а не над ней', /\d/.test(filled[0].querySelector('span[style*="color-mix"]').textContent))
  // Плашка не должна была съесть саму долю выполнения (правка владельца 06.08):
  // доля живёт в жёсткой границе градиента, а не в отдельной полосе.
  check('доля выполнения сохранена — градиент с жёсткой границей на progWidth %',
    filled.every((c) => /linear-gradient\(90deg, .+ 0 [\d.]+%, .+ [\d.]+% 100%\)/
      .test(c.querySelector('span[style*="color-mix"]').getAttribute('style'))),
    filled[0].querySelector('span[style*="color-mix"]').getAttribute('style'))
  check('обе части градиента — светлые тона, тёмный текст читается и слева, и справа',
    filled.every((c) => {
      const st = c.querySelector('span[style*="color-mix"]').getAttribute('style')
      const mixes = st.match(/\d+%, var\(--surface\)/g) || []
      return mixes.length === 2
    }))
  // Трек был `bg-[var(--surface-2)]` — ровно тем же токеном, что фон строки выходного,
  // поэтому в субботу и воскресенье прогресс исчезал. Проверяем именно ячейки факта:
  // на самой строке `--surface-2` остаётся законно, это метка выходного.
  check('серого трека, сливавшегося с фоном выходного, в ячейках факта больше нет',
    factCells.every((c) => !/bg-\[var\(--surface-2\)\]/.test(c.innerHTML)))
  check('полосы под числом нет — цифры дней на одной базовой линии',
    !/h-1\.5|h-2\b/.test(table.innerHTML))
  check('текст в плашке монохромный (цвет только в заливке)',
    filled.every((c) => !/text-\[var\(--(positive|negative|warning)\)\]/.test(c.innerHTML)))
  wk.app.unmount(); wk2.app.unmount()
}

console.log('\n=== jsdom: строка «Замер» в карточке драйвера (D-77, §3.4) ===')
{
  const card = (over) => mount(bundle.DriverCard, {
    driver: { code: 'DRV-01', name: 'Драйвер', status: 'идёт', measure: 'заблокирован', periods: [], ...over },
    parkIds: ['ohta'],
  })
  const a = card({})
  const rowM = a.el.querySelector('[data-test="driver-measure"]')
  check('у статуса «идёт» строка «Замер» видна', !!rowM && rowM.textContent.includes('заблокирован'))
  check('строка серая, без цвета и без сигнальной точки',
    rowM.innerHTML.includes('--text-muted') && !/--positive|--negative|--warning|rounded-full/.test(rowM.innerHTML))
  a.app.unmount()
  const b = card({ status: 'пауза' })
  check('у статуса «пауза» строка видна', !!b.el.querySelector('[data-test="driver-measure"]'))
  b.app.unmount()
  for (const st of ['готов', 'разработка', 'backlog', 'закрыт']) {
    const c = card({ status: st })
    check(`у статуса «${st}» строки «Замер» НЕТ`, !c.el.querySelector('[data-test="driver-measure"]'))
    c.app.unmount()
  }
  const d = card({ measure: '' })
  check('поле пустое → строки нет', !d.el.querySelector('[data-test="driver-measure"]'))
  d.app.unmount()
  const e = card({})
  check('результата/метрики/процентов в карточке по-прежнему нет',
    !/%|ready_pct|gaps|conflicts/.test(e.el.textContent))
  e.app.unmount()

  // «~» у неточной даты запуска. Пустая точность = unknown (контракт §10.3), а не
  // «до дня»: карточка печатала такую дату без «~», то есть выдавала ложную точность.
  const withPeriod = (accuracy) => mount(bundle.DriverCard, {
    driver: {
      code: 'DRV-01', name: 'Драйвер', status: 'идёт', measure: '',
      periods: [{ code: 'DRV-01', park: 'ohta', start: '2026-04-01', end: '', accuracy }],
    },
    parkIds: ['ohta'],
  })
  const cases = [
    ['день', false, 'точная дата — «~» не ставим'],
    ['месяц', true, 'точность до месяца → «~»'],
    ['unknown', true, 'точность неизвестна → «~»'],
    ['', true, 'ПУСТАЯ точность = unknown → «~», а не ложная точность'],
    ['День', false, 'регистр не меняет смысла'],
  ]
  for (const [acc, wantTilde, label] of cases) {
    const c = withPeriod(acc)
    const txt = c.el.textContent
    check(label, txt.includes('~') === wantTilde, `accuracy=«${acc}» → ${txt.includes('~') ? '~' : 'без ~'}`)
    c.app.unmount()
  }
}

console.log('\n=== jsdom: возврат «откуда пришли» (§3.3) ===')
{
  const { subView, subOrigin } = bundle.useAppNav()
  bundle.clearSubView()
  bundle.setSubView('drivers', { to: 'daily', label: 'Контроль Дня' })
  check('открыта под-страница драйверов', subView.value === 'drivers', subView.value)
  check('запомнено, откуда пришли', subOrigin.value && subOrigin.value.to === 'daily')
  bundle.setSubView('daily')
  check('возврат ведёт в «Контроль дня», а не на Главную', subView.value === 'daily', subView.value)
  check('origin снят — следующий заход не потянет старый возврат', subOrigin.value === null)
  bundle.setSubView('drivers')
  check('заход с Главной origin не заводит', subOrigin.value === null)
  bundle.clearSubView()
}

console.log('\n=== jsdom: Д-1 — заход из «Контроля дня» не меняет дефолт раздела ===')
{
  // Регресс, который ловим: tab='list' переживал keep-alive, и следующий заход
  // С ГЛАВНОЙ тоже открывался списком — то есть один клик по строке-сводке молча
  // отменял дефолт «Вклад в план» (D-50) на всю сессию.
  localStorage.clear()
  bundle.clearSubView()
  getPayload = {
    updated: '2025-05-20',
    sets: {},
    drivers: data.drivers,
    driver_periods: data.driver_periods,
    driver_contrib: data.driver_contrib,
    driver_contrib_items: data.driver_contrib_items,
  }
  const view = () => {
    const on = [...sec.el.querySelectorAll('[data-test="view-switch"] [role="tab"]')]
      .find((b) => b.getAttribute('aria-selected') === 'true')
    return on ? on.textContent.trim() : '(переключателя нет)'
  }
  const tabBtn = (label) => [...sec.el.querySelectorAll('[data-test="view-switch"] [role="tab"]')]
    .find((b) => b.textContent.trim() === label)
  // Хост повторяет AppShell: keep-alive + подмена компонента при смене под-страницы.
  // Без него onActivated не срабатывает, и тест «проходил» бы на невыполненном коде —
  // ровно тот класс ошибки, из-за которого правило «тест ходит боевым путём» и записано.
  const away = { render: () => h('i') }
  const shown = vRef(true)
  const Host = {
    setup: () => () => h(KeepAlive, null, {
      default: () => (shown.value ? h(bundle.DriversSection) : h(away)),
    }),
  }
  const leave = async () => { shown.value = false; await flush() }
  const enter = async (origin) => {
    await leave()
    bundle.setSubView('drivers', origin || null)
    shown.value = true
    await flush()
  }
  const enterFromHome = () => enter(null)
  const enterFromDaily = () => enter({ to: 'daily', label: 'Контроль Дня' })

  bundle.setSubView('drivers')
  const sec = mount(Host, {})
  await flush()
  check('1. Главная → «Драйверы»: открывается «Вклад в план»', view() === 'Вклад в план', view())

  await enterFromDaily()
  check('2. из «Контроля дня»: открылся «Список драйверов»', view() === 'Список драйверов', view())
  const statusOn = () => {
    const on = [...sec.el.querySelectorAll('[aria-label="Фильтр по статусу"] [aria-selected="true"]')][0]
    return on ? on.textContent.replace(/\s+/g, ' ').trim() : '(нет)'
  }
  check('   статус сброшен на «Все» (а не залипший «пауза» с прошлого захода)',
    statusOn().startsWith('Все'), statusOn())

  await enterFromHome()
  check('3. снова с Главной: вернулся «Вклад в план», а не залипший список',
    view() === 'Вклад в план', view())

  tabBtn('Список драйверов').click()
  await flush()
  check('4. переключил руками на «Список»', view() === 'Список драйверов', view())
  bundle.clearSubView()
  await enterFromHome()
  check('   собственный выбор память держит: заход с Главной остался «Списком»',
    view() === 'Список драйверов', view())

  await enterFromDaily()
  await enterFromHome()
  check('   и после захода из «Контроля дня» возвращается ЕГО выбор, а не дефолт',
    view() === 'Список драйверов', view())

  // Сброс статуса проверяем на ЗАГРЯЗНЁННОМ состоянии: иначе «Все» стоял бы и без
  // сброса, и проверка ничего не значила бы.
  await enterFromDaily()
  const stTabs = [...sec.el.querySelectorAll('[aria-label="Фильтр по статусу"] [role="tab"]')]
  const stOther = stTabs.find((b) => b.getAttribute('aria-selected') !== 'true')
  if (stOther) { stOther.click(); await flush() }
  check('   (подготовка) статус руками уведён с «Все»',
    !statusOn().startsWith('Все'), `${stTabs.length} чипов, выбран: ${statusOn()}`)
  await enterFromDaily()
  check('   следующий заход из «Контроля дня» снова сбрасывает статус на «Все»',
    statusOn().startsWith('Все'), statusOn())

  sec.app.unmount()
  bundle.clearSubView()
  getPayload = {}
}

console.log('\n=== jsdom: две группы под парком — «работают» и «применимы» (NET-33 §2.3) ===')
{
  // Боевой повод: владелец 07.08 открыл раздел под парком и не увидел сетевые
  // драйверы вообще. Тест ходит боевым путём — монтирует раздел и читает ЗАГОЛОВКИ
  // групп, а не зовёт модель: разъехаться могли именно шаблон и модель.
  localStorage.clear()
  bundle.clearSubView()
  // Без driver_contrib переключателя видов нет и раздел открывается списком —
  // ровно то состояние, в котором живут группы.
  getPayload = {
    updated: '2025-05-20', sets: {},
    drivers: data.drivers, driver_periods: data.driver_periods,
  }
  bundle.setPark('piterland')
  const sec = mount(bundle.DriversSection, {})
  await flush()
  const groups = () => [...sec.el.querySelectorAll('section > button')].map((b) => {
    const t = [...b.children].filter((c) => c.tagName !== 'svg')
    return t.map((c) => c.textContent.trim()).join(' ')
  })
  check('под парком групп ровно две', groups().length === 2, groups().join(' | '))
  check('первой идёт «Работают в парке» — сперва «что тут работает»',
    groups()[0] === 'Работают в парке 3', groups()[0])
  check('второй — «Применимы, не включены» (ответ «что предстоит»)',
    groups()[1] === 'Применимы, не включены 2', groups()[1])
  check('групп по статусу под парком больше нет',
    !groups().some((g) => /^(Идёт|Готов|Разработка|Backlog|Пауза|Закрыт)/.test(g)), groups().join(' | '))
  check('счётчик всего = сумме групп (никто не потерялся)',
    sec.el.textContent.includes('Всего 5 драйверов'),
    (sec.el.textContent.match(/Всего [^·\n]+/) || [''])[0].trim())
  check('обе группы по дефолту свёрнуты, как в «Задачах»',
    [...sec.el.querySelectorAll('section > button')].every((b) => b.getAttribute('aria-expanded') === 'false'))

  // Раскрываем «применимы» — там вместо дат условие запуска, приглушённо.
  ;[...sec.el.querySelectorAll('section > button')][1].click()
  await flush()
  const appl = sec.el.querySelector('[data-test="driver-applicable"]')
  check('в применимых вместо строки «Парки» — строка «Запуск»', !!appl, !!appl)
  check('условие запуска приглушённое, датой не притворяется',
    appl.innerHTML.includes('--text-muted') && !/\d{2}\.\d{2}\.\d{2}/.test(appl.textContent), appl.textContent.trim())
  check('«не запущен ни в одном парке» в применимых не печатается — это не про парк',
    !appl.closest('article').textContent.includes('не запущен ни в одном'))

  bundle.setPark('network')
  await flush()
  check('«Вся сеть» → группировка по статусу вернулась (без парка «применим» бессмыслен)',
    groups().some((g) => /^(Идёт|Готов|Разработка|Backlog|Пауза|Закрыт)/.test(g))
    && !groups().some((g) => g.startsWith('Работают в парке')), groups().join(' | '))

  sec.app.unmount()
  bundle.setPark('network')
  bundle.clearSubView()
  getPayload = {}
}

console.log('\n=== Контраст WCAG: мелкий серый текст сводки и строки «Замер» ===')
{
  // Считаем по формуле, а не «на память»: токены --text-muted #6F6D66 на --surface #FFFFFF.
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const onSurface = cr('#6F6D66', '#FFFFFF')
  check(`--text-muted на --surface = ${onSurface.toFixed(2)}:1 ≥ 4.5`, onSurface >= 4.5)
  const onSurface2 = cr('#6F6D66', '#F1F0EC') // строка дня-выходного подсвечена --surface-2
  check(`--text-muted на --surface-2 = ${onSurface2.toFixed(2)}:1 ≥ 4.5`, onSurface2 >= 4.5)
  const markOn = cr('#1C1B18', '#FFFFFF')
  check(`залитый маркер --text на --surface = ${markOn.toFixed(2)}:1 ≥ 3 (несущая графика)`, markOn >= 3)
  const markOff = cr('#6F6D66', '#F1F0EC')
  check(`пунктирный бейдж «ДР» --text-muted на --surface-2 = ${markOff.toFixed(2)}:1 ≥ 3`, markOff >= 3)
  const badgeOn = cr('#FFFFFF', '#1C1B18')
  check(`залитый бейдж «ДР» --ink-on-color на --text = ${badgeOn.toFixed(2)}:1 ≥ 4.5`, badgeOn >= 4.5)

  // Жёлтая кнопка входа и плавающая «+»: заливка --accent, текст/иконка --accent-ink.
  const onAccent = cr('#1C1B18', '#FFC833')
  check(`--accent-ink на --accent = ${onAccent.toFixed(2)}:1 ≥ 4.5 (крупная строка и «+»)`, onAccent >= 4.5)
  // Подводка приглушена ПРОЗРАЧНОСТЬЮ, а не вторым цветом: считаем по смешанному
  // цвету, иначе проверка проходила бы на цвете, которого на экране нет.
  const mix = (fg, bg, a) => '#' + [0, 2, 4].map((i) => {
    const f = parseInt(fg.slice(i + 1, i + 3), 16)
    const b = parseInt(bg.slice(i + 1, i + 3), 16)
    return Math.round(f * a + b * (1 - a)).toString(16).padStart(2, '0')
  }).join('')
  const kicker = cr(mix('#1C1B18', '#FFC833', 0.7), '#FFC833')
  check(`подводка ink 70 % на --accent = ${kicker.toFixed(2)}:1 ≥ 4.5`, kicker >= 4.5)

  // ── Кнопки сигнала на ОКРАШЕННОЙ карточке (правка владельца 07.08) ──
  // Карточка красится в signalTint = 12 % цвета статуса на --surface, и кнопка
  // обязана держаться на любом из этих тонов. Считаем по всем статусам разом:
  // раньше заливка --surface-2 давала 1,00–1,08:1 — кнопки на экране просто не было.
  const TINTS = {
    ok: mix('#2F9E54', '#FFFFFF', 0.12),
    warn: mix('#FFC833', '#FFFFFF', 0.12),
    focus: mix('#D92D20', '#FFFFFF', 0.12),
    'без статуса': mix('#6F6D66', '#FFFFFF', 0.12),
  }
  for (const [name, tint] of Object.entries(TINTS)) {
    // Заливка primary-кнопки — несущая графика, порог 3:1 (WCAG 1.4.11).
    const prim = cr('#1C1B18', tint)
    check(`primary --text на карточке «${name}» (${tint}) = ${prim.toFixed(2)}:1 ≥ 3`, prim >= 3)
    // У белых кнопок фон почти совпадает с тинтом — кнопку отделяет КАНТ, его и меряем.
    const quiet = cr('#45433E', tint)
    check(`кант --text-secondary на «${name}» = ${quiet.toFixed(2)}:1 ≥ 3`, quiet >= 3)
    const muted = cr('#6F6D66', tint)
    check(`кант --text-muted (сделано/архив) на «${name}» = ${muted.toFixed(2)}:1 ≥ 3`, muted >= 3)
    // Контрольная величина: почему НЕ жёлтая заливка и НЕ прежняя --surface-2.
    const old = cr('#F1F0EC', tint)
    check(`   прежняя заливка --surface-2 действительно проваливалась (${old.toFixed(2)}:1 < 3)`, old < 3)
  }
  // ── Строка «Прочитано ✓» и «оценка не поставлена» (NET-61) ──
  // Это ТЕКСТ прямо на тинте карточки, а не графика: порог 4,5:1, а не 3:1.
  for (const [name, tint] of Object.entries(TINTS)) {
    const state = cr('#45433E', tint)
    check(`строка статуса --text-secondary на «${name}» = ${state.toFixed(2)}:1 ≥ 4.5`, state >= 4.5)
  }
  // Почему НЕ --text-muted, хотя строка второстепенная: на focus-тинте он проваливает
  // порог для мелкого текста. Величина посчитана, а не взята на память.
  const mutedOnFocus = cr('#6F6D66', TINTS.focus)
  check(`   --text-muted на focus-тинте провалил бы порог (${mutedOnFocus.toFixed(2)}:1 < 4.5)`,
    mutedOnFocus < 4.5)
  const onPrimary = cr('#FFFFFF', '#1C1B18')
  check(`--ink-on-color на primary-кнопке = ${onPrimary.toFixed(2)}:1 ≥ 4.5`, onPrimary >= 4.5)
  const onQuiet = cr('#1C1B18', '#FFFFFF')
  check(`--text на белой кнопке = ${onQuiet.toFixed(2)}:1 ≥ 4.5`, onQuiet >= 4.5)
  // Бейдж даты/оценки живёт на БЕЛОЙ кнопке: прежний кант --line там пропадал.
  const badgeEdge = cr('#6F6D66', '#FFFFFF')
  check(`кант бейджа --text-muted на белой кнопке = ${badgeEdge.toFixed(2)}:1 ≥ 3`, badgeEdge >= 3)
  const badgeInk = cr('#1C1B18', '#F1F0EC')
  check(`цифра бейджа --text на --surface-2 = ${badgeInk.toFixed(2)}:1 ≥ 4.5`, badgeInk >= 4.5)
  const oldBadgeEdge = cr('#E3E1DB', '#FFFFFF')
  check(`   прежний кант бейджа --line на белом проваливался (${oldBadgeEdge.toFixed(2)}:1 < 3)`, oldBadgeEdge < 3)
}

console.log('\n=== jsdom: окраска кнопок сигнала по состояниям (правка 07.08) ===')
{
  // Проверяем боевым путём — на смонтированной карточке, а не по исходнику: цвет
  // выбирается computed'ом от done/markable, и подмена состояния мимо компонента
  // проверяла бы строку, а не поведение.
  const cls = (el, sel) => el.querySelector(sel)?.className || ''
  const PRIMARY = 'bg-[var(--text)]'
  const QUIET = 'border-[var(--text-secondary)]'
  const MUTED = 'border-[var(--text-muted)]'

  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const fresh = mount(bundle.DailySignalCard, { m: mOhta, now: NOW_MID })
  await nextTick()
  const markCls = cls(fresh.el, '[data-test="signal-read"]')
  check('свежий сигнал: «Прочитать и оценить» — тёмная плашка (призыв)',
    markCls.includes(PRIMARY) && markCls.includes('text-[var(--ink-on-color)]'), markCls)
  check('   и она НЕ красится прежней --surface-2', !markCls.includes('bg-[var(--surface-2)]'))
  check('кнопка держит кант-класс (иначе border-width некому задать)',
    markCls.split(' ').includes('border'))
  // Подпись «отправляем» ложится на ТЁМНУЮ плашку: --text-secondary дал бы там 1,74:1.
  await fire(fresh.el.querySelector('[data-test="signal-read"]'), 'click')
  const fsl = rateSheet().querySelector('[data-test="signal-rate-slider"]')
  fsl.value = '8'; await fire(fsl, 'input')
  await fire(rateSheet().querySelector('[data-test="signal-rate-submit"]'), 'click')
  await nextTick()
  check('состояние «отправляем»: плашка ещё тёмная, подпись белая',
    cls(fresh.el, '[data-test="signal-read"]').includes(PRIMARY) &&
    cls(fresh.el, '[data-test="signal-read-sending"]').includes('text-[var(--ink-on-color)]'))
  await drainOutbox()
  await nextTick()
  const doneCls = cls(fresh.el, '[data-test="signal-read"]')
  // Оценка записана — звать больше некуда, но действие (переоценка) осталось: тихая
  // белая плашка с кантом --text-secondary, а не погашенная архивная.
  check('оценка записана: кнопка гаснет до белой с кантом --text-secondary',
    doneCls.includes(QUIET) && doneCls.includes('bg-[var(--surface)]') && !doneCls.includes(PRIMARY), doneCls)
  check('бейдж оценки внутри белой кнопки не растворяется: кант --text-muted, заливка --surface-2',
    cls(fresh.el, '[data-test="signal-score-badge"]').includes('border-[var(--text-muted)]') &&
    cls(fresh.el, '[data-test="signal-score-badge"]').includes('bg-[var(--surface-2)]'))
  check('подпись «изменить» на белой плашке — --text-secondary (9,88:1)',
    cls(fresh.el, '[data-test="signal-score-change"]').includes('text-[var(--text-secondary)]'))
  // Строка статуса лежит НА ТИНТЕ карточки, а не на плашке: --text-muted даёт там
  // 4,32:1 на focus — ниже порога 4,5:1 для мелкого текста.
  check('строка «Прочитано ✓» на тинте — --text-secondary, не --text-muted',
    cls(fresh.el, '[data-test="signal-read-state"]').includes('text-[var(--text-secondary)]') &&
    !cls(fresh.el, '[data-test="signal-read-state"]').includes('text-[var(--text-muted)]'))
  check('бейдж даты не растворяется: кант --text-muted, заливка --surface-2',
    cls(fresh.el, '[data-test="signal-read-date"]').includes('border-[var(--text-muted)]') &&
    cls(fresh.el, '[data-test="signal-read-date"]').includes('bg-[var(--surface-2)]'))
  fresh.app.unmount()

  // Прочитано, но НЕ оценено — единственный шаг, который теряется. Кнопка обязана
  // остаться призывом: гасить её здесь значит спрятать сам предмет NET-61.
  resetSignals()
  postMode = 'ok'; postedBodies.length = 0
  const debt = mount(bundle.DailySignalCard, {
    m: mOhta, now: NOW_MID,
    reads: [{ park: 'ohta', signal_date: '2025-05-16', read_at: '2025-05-16 11:36', score: null }],
  })
  await nextTick()
  const debtCls = cls(debt.el, '[data-test="signal-read"]')
  check('прочитано без оценки: плашка остаётся тёмным призывом',
    debtCls.includes(PRIMARY) && !debtCls.includes(QUIET), debtCls)
  debt.app.unmount()

  // Архив (старше окна 14 дней): действия нет, но кнопка обязана остаться видимой.
  resetSignals()
  const oldSig = { park: 'ohta', month: '2025-05', signals: [{ date: '2025-03-01', status: 'ok', headline: 'старый', action: '' }] }
  const arch = mount(bundle.DailySignalCard, { m: { ...mOhta, ...oldSig }, now: NOW_MID, signals: oldSig.signals })
  await nextTick()
  const archCls = cls(arch.el, '[data-test="signal-read"]')
  check('архивный сигнал: тихая белая кнопка с кантом, а не тёмный призыв',
    archCls.includes(MUTED) && !archCls.includes(PRIMARY), archCls)
  check('подпись «архив» на белой плашке — --text-secondary (9,88:1)',
    cls(arch.el, '[data-test="signal-archive"]').includes('text-[var(--text-secondary)]'))
  arch.app.unmount()

  // Тот же компонент живёт и в ленте «Ранее» на БЕЛОМ фоне — цвета там те же,
  // отдельной ветки нет: кант работает на обоих фонах, это и была цель правки.
  const src = readFileSync(resolve(root, 'src/components/daily/SignalMarkButton.vue'), 'utf8')
  check('в компоненте не осталось заливки --surface-2 у самих кнопок',
    !/bg-\[var\(--surface-2\)\][^\n]*px-4/.test(src) &&
    (src.match(/bg-\[var\(--surface-2\)\]/g) || []).length === 1, // только бейдж
    String((src.match(/bg-\[var\(--surface-2\)\]/g) || []).length))
  check('жёлтый как заливку кнопки не использовали (1,46:1 на warn-карточке)',
    !src.includes('bg-[var(--accent)]'))
}

console.log('\n=== jsdom: плавающая кнопка «+» «Отчёта дня» (правка 06.08) ===')
{
  localStorage.clear()
  bundle.clearSubView()
  getPayload = { updated: '2025-05-20', sets: {}, stats: {}, reviews: [] }
  const scr = mount(bundle.DailyScreen, {})
  await flush()
  const fab = scr.el.querySelector('[data-test="daily-fab"]')
  check('плавающая кнопка есть', !!fab)
  check('жёлтая заливка + тёмная иконка (жёлтый только заливкой)',
    fab.className.includes('bg-[var(--accent)]') && fab.innerHTML.includes('text-[var(--accent-ink)]'))
  check('крупный тач-таргет 56pt', fab.className.includes('h-14') && fab.className.includes('w-14'))
  check('подписана для скринридера', fab.getAttribute('aria-label') === 'Добавить отчёт')
  const wrap = fab.parentElement
  check('привязана к мобильной колонке, а не к краю экрана',
    wrap.className.includes('max-w-[430px]') && wrap.className.includes('fixed'), wrap.className)
  check('обёртка не перехватывает клики по контенту под ней',
    wrap.className.includes('pointer-events-none') && fab.className.includes('pointer-events-auto'))
  // jsdom нормализует порядок слагаемых в calc(), поэтому проверяем наличие обоих,
  // а не написание: иначе тест ловил бы форматирование, а не смысл.
  const pb = wrap.getAttribute('style') || ''
  check('отступ снизу считает и таб-бар, и safe-area',
    /padding-bottom:\s*calc\(/.test(pb) && pb.includes('env(safe-area-inset-bottom)') && /\d/.test(pb), pb)
  const { subView } = bundle.useAppNav()
  fab.click()
  await flush()
  check('открывает «Отчёт дня»', subView.value === 'daily-report', subView.value)
  // Гашение у низа страницы держится на IntersectionObserver — в jsdom его нет,
  // поэтому проверяем САМО правило (v-show по видимости нижней кнопки), а не эффект:
  // иначе тест подтверждал бы отсутствие наблюдателя, а не поведение.
  const src = readFileSync(resolve(root, 'src/screens/DailyScreen.vue'), 'utf8')
  check('гаснет, когда нижняя кнопка «Добавить отчёт» видна',
    /v-show="!bottomCtaVisible"/.test(src) && /IntersectionObserver/.test(src))
  check('наблюдатель отключается при уходе экрана (без утечки)',
    /onBeforeUnmount\(\(\) => \{ if \(io\)/.test(src))
  scr.app.unmount()
  bundle.clearSubView()
  getPayload = {}
}

console.log('\n=== Vue warnings ===')
check('нет [Vue warn]', vueWarns.length === 0, vueWarns[0] || 'чисто')
console.warn = origWarn
rmTmp()

console.log('\n=== Итог ===')
console.log(ok ? 'ВСЁ ОК' : 'ЕСТЬ ОШИБКИ')
process.exit(ok ? 0 : 1)
