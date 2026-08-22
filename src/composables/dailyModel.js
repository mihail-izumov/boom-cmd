// dailyModel.js — модель под-страницы «Контроль дня». ЧИСТЫЙ JS (нет vue/DOM).
//
// ПОРТ инлайн-JS пультов `apps/daily-ohta/daily-ohta.html` (функция model())
// ЧИСЛА-В-ЧИСЛО. Единственное «умное» место — коэффициенты и журнал — приходят
// посчитанными из Python (payload), фронт их РЕНДЕРИТ, не пересчитывает.
//
// Инварианты (закреплены verify-daily.mjs):
//   • Σ план всех дней месяца = month_target — РОВНО, пока нет замка плана; с замком
//     (plan_lock, D-132) — с допуском на округление, как в контуре B (verify_daily.py);
//   • план закрытого дня НЕ меняется при смене погодных множителей будущих дней;
//   • sigClass: ≥1.00 good · 0.85–0.99 warn · <0.85 bad · null idle;
//   • computeDaily(set).landing === последняя точка set.journal[].landing;
//   • адаптивные колонки метрик — колонка есть, только если у ≥1 дня есть значение.
//
// Презентация (цвет) — sigClass отдаёт КЛАСС для ЗАЛИВКИ бара (--positive/--warning/
// --negative); текст компоненты держат монохромным (DESIGN-STANDARD). Форматирование —
// в i18n/daily.js, здесь только числа/классы.

import { sortSignals, latestSignal } from './dailySignals.js'
// Календарь МСК — тем же модулем, что считает остаток дней. Месяц «сейчас» у экрана
// и у бейджа обязан быть один: разъедутся — виджет скажет «Месяц закрыт» над живыми
// цифрами. monthDays.js ничего не импортирует, цикла нет.
import { mskToday } from './monthDays.js'

export const DOW_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const GOOD = 1.0
export const OK = 0.85

// Единый светофор. Возвращает 'good' | 'warn' | 'bad' | 'idle'.
export function sigClass(r) {
  if (r == null || !Number.isFinite(r)) return 'idle'
  if (r >= GOOD) return 'good'
  if (r >= OK) return 'warn'
  return 'bad'
}

const pad2 = (n) => String(n).padStart(2, '0')
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0)

// Адаптивные метрики по дню (порядок как в пультах). Значение из «сырого» дня (raw).
const METRICS = [
  { key: 'chk', label: 'ср. чек', get: (z) => (z && z.chk != null ? z.chk : null) },
  { key: 'sessions', label: 'сессии', get: (z) => (z && z.sessions != null ? z.sessions : null) },
  { key: 'topups', label: 'пополнения', get: (z) => (z && z.topups != null ? z.topups : null) },
  { key: 'pps', label: 'попол/сессию', get: (z) => (z && z.topups != null && z.sessions ? z.topups / z.sessions : null) },
  { key: 'new', label: 'новые гости', get: (z) => (z && z.new != null ? z.new : null) },
  { key: 'promo', label: 'акция 300₽', get: (z) => (z && z.promo != null ? z.promo : null) },
  { key: 'reviews', label: 'отзывы', get: (z) => (z && (z.rev_y != null || z.rev_vk != null) ? (z.rev_y || 0) + (z.rev_vk || 0) : null) },
]

// ── ДРАЙВЕРЫ РОСТА В «КОНТРОЛЕ ДНЯ» (задание 06.08, D-41/D-42/D-75/D-76/D-77) ──
// До 06.08 блок «Активности и гипотезы» печатал у каждого драйвера «% к плану» и
// ставил бейдж с кодом ПОД КАЖДЫМ днём его работы. Оба числа убраны, и по разным
// причинам:
//   • процент считался как Σфакт ÷ Σплан по дням работы драйвера. У драйвера,
//     идущего весь месяц, окно = весь месяц, поэтому число равнялось показателю
//     месяца, а у всех вложенных окон отличалось только длиной окна. Это арифметика
//     окна, а не эффект драйвера (D-41); вердикт по эффекту ставит человек (D-33);
//   • бейдж повторял один факт «драйвер работает» столько раз, сколько в месяце
//     дней: 6 драйверов × 31 день = 186 значков за август по одному парку (D-42).
//
// Остаётся ровно то, чего в других местах нет: КОГДА в этом парке в этом месяце
// что-то переключили. Информация живёт в двух местах и больше нигде — одна
// строка-сводка над таблицей дней и точка-маркер в дне переключения.
//
// Отличить «включили в этом месяце» от «работает с прошлых месяцев» можно ТОЛЬКО
// по полю `start`: в `days` фон и свежее включение выглядят одинаково.
const inMonth = (iso, ym) => typeof iso === 'string' && iso.length >= 7 && iso.slice(0, 7) === ym

// Агрегат «замер идёт у N» (§2 задания). `measure` — СВОБОДНЫЙ ТЕКСТ контура B
// («заблокирован» · «невозможен» · «идёт» · «идёт (обратный эффект зафиксирован)»),
// парсить его нельзя — можно только спросить «начинается с “идёт”». Ё/е нормализуем:
// мастера правятся руками, и «идет» рано или поздно приедет.
export const isMeasuring = (v) =>
  String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').startsWith('идет')

// ── ТИП СОБЫТИЯ (NET-33, задание 07.08) ─────────────────────────────────────
// Второй дефект той же истории: у Охты Молл строка-сводка писала «Включён 1: DRV-04
// с 01.08», хотя обход зала идёт непрерывно с 16.07 — 01.08 его ПЕРЕСТРОИЛИ (бумага
// → Google-форма, норма раз в 2 часа). Слово было ложное, потому что типа события в
// схеме не было вовсе: всякое начало периода читалось как запуск.
//
// Теперь контур B пишет `event` в daily_activities и driver_periods. Значения —
// русские слова мастера; ё/е и регистр нормализуем (мастера правятся руками).
// Незнакомое значение → 'on': «что-то включили» — самое безопасное прочтение, и
// оно совпадает с поведением до этой правки.
const EVENT_KIND = { 'включен': 'on', 'перестроен': 'rebuilt', 'выключен': 'off' }
export const eventKind = (v) =>
  EVENT_KIND[String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е')] || 'on'

// Несколько переключений в один день → ОДИН маркер (D-76). Приоритет: включение >
// перестройка > выключение. «Здесь что-то включили» — более сильное событие, чем
// «перестроили», а оно, в свою очередь, сильнее выключения.
const MARK_RANK = ['on', 'rebuilt', 'off']
export function markKind(events) {
  if (!events || !events.length) return null
  return MARK_RANK.find((k) => events.some((e) => e.kind === k)) || null
}

/**
 * Драйверы одного набора (парк × месяц) для «Контроля дня».
 *
 * Возвращает:
 *   total     — сколько драйверов работает в наборе (все строки `activities`);
 *   measuring — у скольких замер идёт (правило выше);
 *   starts[]  — включения ВНУТРИ месяца, свежие первыми;
 *   ends[]    — выключения внутри месяца, свежие первыми;
 *   marksBy   — ISO-дата → события этого дня (для маркера в таблице дней);
 *   ready     — приехали ли новые поля вообще.
 *
 * `ready === false` — это боевой случай, а не край: боевой Apps Script до v3.14
 * отдаёт `activities` без `start/end/accuracy/measure`. Тогда «включений не было»
 * было бы ЛОЖЬЮ (у Охты 01.08 включение есть), поэтому сводка и маркеры скрываются
 * целиком и экран деградирует к прежнему виду — без блока, но и без вранья.
 */
export function computeDrivers(set) {
  const ym = String((set && set.month) || '')
  const acts = Array.isArray(set && set.activities) ? set.activities : []
  const ev = (a, kind, iso) => ({
    code: String(a.code || ''),
    name: String(a.name || ''),
    kind,
    iso,
    // «~» — про точность ДАТЫ СТАРТА (§2 задания), поэтому не у выключений.
    // 35 строк из 47 имеют accuracy ≠ «день»: это норма, а не редкий случай, и без
    // «~» фронт печатал бы ложную точность.
    approx: kind !== 'off' && String(a.accuracy || 'unknown') !== 'день',
  })
  const starts = []
  const ends = []
  for (const a of acts) {
    if (!a) continue
    // Тип события берём из `event` (v3.17): начало периода — это «включён» ИЛИ
    // «перестроен», и различить их можно только этим полем. Поля нет → 'on'.
    if (inMonth(a.start, ym)) starts.push(ev(a, eventKind(a.event), a.start))
    if (inMonth(a.end, ym)) ends.push(ev(a, 'off', a.end))
  }
  const freshFirst = (x, y) => (x.iso < y.iso ? 1 : x.iso > y.iso ? -1 : 0)
  starts.sort(freshFirst)
  ends.sort(freshFirst)
  const marksBy = {}
  for (const e of starts.concat(ends)) (marksBy[e.iso] || (marksBy[e.iso] = [])).push(e)
  return {
    total: acts.length,
    measuring: acts.filter((a) => a && isMeasuring(a.measure)).length,
    starts,
    ends,
    marksBy,
    ready: acts.some((a) => a && (a.start || a.end || a.measure || a.event)),
  }
}

// Основная модель одного набора (парк × месяц). set — объект payload формы §2.2.
export function computeDaily(set) {
  if (!set || typeof set !== 'object') return null
  const [Y, M] = String(set.month || '').split('-').map(Number)
  if (!Y || !M) return null
  const DIM = new Date(Y, M, 0).getDate()
  const factors = set.day_factors || {}
  const hol = new Set(set.holidays || [])
  const coefArr = Array.isArray(set.dow_coef) ? set.dow_coef : []

  // Драйверы роста в «Контроле дня» (D-41/D-42/D-75/D-76, задание 06.08): не список
  // с процентом и не бейдж под каждым днём работы, а одна сводка + маркер переключения.
  const drivers = computeDrivers(set)
  const byDate = {}
  ;(set.days || []).forEach((x) => { byDate[x.date] = x })

  // все дни месяца (не только пришедшие) — план строится на полный месяц
  const days = []
  for (let dd = 1; dd <= DIM; dd++) {
    const dt = new Date(Y, M - 1, dd)
    const dow = ((dt.getDay() + 6) % 7) + 1 // 1=Пн..7=Вс
    const iso = `${Y}-${pad2(M)}-${pad2(dd)}`
    const coef = coefArr[dow - 1] ?? 1
    const fac = factors[iso]?.mult ?? 1
    const f = byDate[iso] || null
    const full = !!(f && f.status === 'full')
    days.push({
      dd, iso, dow, dowRu: DOW_RU[dow - 1], weekend: dow >= 6,
      holiday: hol.has(iso),
      // D-42/D-76: событий в дне может быть несколько — маркер один, подписи все.
      mark: markKind(drivers.marksBy[iso]),
      markEvents: drivers.marksBy[iso] || [],
      coef, weight: coef * fac,
      fact: f ? f.rev : null, chk: f ? f.chk : null,
      status: f ? f.status : null, outlier: !!(f && f.outlier),
      full, raw: f,
    })
  }

  const T = set.month_target || 0
  const sumW = sum(days, (x) => x.weight)
  // ЗАМОК ПЛАНА ДНЯ (D-132, NET-87). План закрытого дня зафиксирован в момент закрытия
  // и больше не пересчитывается: иначе «% плана дня» уже отправленного парку дня плывёт
  // при каждом переснятии погодного прогноза на БУДУЩИЕ дни (меняется ΣW — меняется план
  // прошедшего дня задним числом). Замок ставит контур данных (build_daily.py, блок
  // plan_lock: мастера) — фронт его ТОЛЬКО ЧИТАЕТ и никогда не вычисляет.
  //
  // Формула повторяет эталон build_daily.compute_journal ОДИН В ОДИН, включая `||`:
  //   plan(d) = plan_lock[d]  либо  month_target × w(d) / ΣW
  // Отсюда же остальное поведение: замка нет → всё как раньше; ΣW считается по ВСЕМ дням
  // месяца, включая закрытые (у них множителя нет — build_weather.py ставит его только на
  // незакрытые дни, поэтому вес закрытого дня = коэффициент дня недели).
  //
  // ⚠ Σплан теперь не обязан РОВНО равняться цели: замок хранит целые рубли, а незакрытые
  // дни считаются от текущего ΣW. Допуск приёмки — как в контуре B (verify_daily.py):
  // max(1, число замков / 2) ₽, то есть чистое округление. Расхождение больше — это уже
  // рассинхрон замка с целью месяца, и он обязан гореть.
  const lock = set.plan_lock || {}
  days.forEach((x) => { x.plan = lock[x.iso] || (sumW ? (T * x.weight) / sumW : 0) })

  const realized = days.filter((x) => x.full)
  const realizedRev = sum(realized, (x) => x.fact)
  const pace = days.filter((x) => x.full && !x.outlier)
  const wPace = sum(pace, (x) => x.weight)
  const impliedBase = wPace > 0 ? sum(pace, (x) => x.fact) / wPace : 0
  const remaining = days.filter((x) => !x.full)
  const wRemain = sum(remaining, (x) => x.weight)
  const remainTarget = Math.max(T - realizedRev, 0)
  const adjBase = wRemain > 0 ? remainTarget / wRemain : 0
  days.forEach((x) => { x.need = x.full ? null : adjBase * x.weight })

  const landing = realizedRev + sum(remaining, (x) => impliedBase * x.weight)
  const maxObsBase = pace.length ? Math.max(...pace.map((x) => x.fact / x.weight)) : 0
  const achievable = adjBase <= maxObsBase * 1.001
  // Три состояния достижимости (v2.1 §5, D-16; тот же расчёт — в пультах контура B
  // и build_daily.py). `achievable` сохраняем — обратная совместимость.
  //   out    — нужный темп выше ЛУЧШЕГО наблюдённого дня → цель вне досягаемости;
  //   record — темп в пределах лучшего дня, но > +25% к среднему → нужен рекордный темп;
  //   ok     — темп в пределах +25% к среднему → цель достижима.
  const goalState = adjBase > maxObsBase * 1.001 ? 'out'
    : adjBase > impliedBase * 1.25 ? 'record'
    : 'ok'
  const planRealized = sum(realized, (x) => x.plan)
  const onPlan = planRealized > 0 ? realizedRev / planRealized : null
  const tailCum = planRealized - realizedRev

  // ЦЕЛЬ-амбиция месяца (D-34). Приходит из payload как month_goal; источник —
  // targets/targets-2026.md контура B. НЕ путать с T (month_target) — это ПЛАН,
  // обязательство, по которому живёт весь дневной контроль (Σ план дней = T РОВНО).
  // Цель ≥ плана по канону. Нет цели (парк без планировщика, месяц не перекатан) →
  // null: виджет месяца строит шкалу до плана и маркер цели не рисует.
  const goalRaw = Number(set.month_goal)
  const goal = Number.isFinite(goalRaw) && goalRaw > 0 ? goalRaw : null

  const lastFactISO = realized.length ? realized[realized.length - 1].iso : null
  const futureDays = days.filter((x) => !x.full && (!lastFactISO || x.iso > lastFactISO))
  const currentPace = realized.length ? realizedRev / realized.length : 0
  const needPerDay = futureDays.length ? remainTarget / futureDays.length : 0
  const paceGap = currentPace ? needPerDay / currentPace - 1 : 0

  // недели Пн–Вс (новая неделя начинается на dow===1 или в самом начале)
  const weeks = []
  let cur = null
  days.forEach((x) => { if (!cur || x.dow === 1) { cur = { days: [] }; weeks.push(cur) } cur.days.push(x) })
  weeks.forEach((w, i) => {
    w.idx = i + 1
    w.from = w.days[0].dd
    w.to = w.days[w.days.length - 1].dd
    w.plan = sum(w.days, (x) => x.plan)
    w.factDays = w.days.filter((x) => x.full)
    w.fact = sum(w.factDays, (x) => x.fact)
    w.hasFact = w.factDays.length > 0
    w.partOfPlan = sum(w.factDays, (x) => x.plan)
    w.delta = w.fact - w.partOfPlan
    w.leftDays = w.days.filter((x) => !x.full).length
    w.need = sum(w.days.filter((x) => !x.full), (x) => x.need || 0)
    w.ratio = w.partOfPlan > 0 ? w.fact / w.partOfPlan : null
    w.faWidth = w.hasFact ? Math.min(100, (w.fact / w.plan) * 100) : 0
    // строки дней для таблицы недели
    w.rows = w.days.map((x) => ({
      dd: x.dd, dowRu: x.dowRu, weekend: x.weekend, holiday: x.holiday,
      mark: x.mark, markEvents: x.markEvents, plan: x.plan, fact: x.fact, need: x.need,
      status: x.status, outlier: x.outlier, full: x.full, chk: x.chk,
      isLastFact: x.iso === lastFactISO,
      ratio: x.full ? x.fact / x.plan : null,
      sig: x.full ? sigClass(x.fact / x.plan) : 'idle',
      progWidth: x.full ? Math.min(100, (x.fact / x.plan) * 100) : 0,
    }))
  })

  // статистика дней: распределение полных дней по sigClass(факт/план)
  const fd = days.filter((x) => x.full)
  const stG = fd.filter((x) => x.fact / x.plan >= GOOD).length
  const stY = fd.filter((x) => { const r = x.fact / x.plan; return r >= OK && r < GOOD }).length
  const stR = fd.filter((x) => x.fact / x.plan < OK).length
  const pctOf = (k) => (fd.length ? Math.round((k / fd.length) * 100) : 0)
  const dayStats = fd.length
    ? { total: fd.length, good: stG, warn: stY, bad: stR, pctGood: pctOf(stG), pctWarn: pctOf(stY), pctBad: pctOf(stR) }
    : null

  // адаптивные колонки метрик: оставить те, у кого есть значение хоть у одного дня со статусом
  const metDays = days.filter((x) => x.status)
  const metColumns = METRICS.filter((c) => metDays.some((x) => c.get(x.raw) != null))
  const metRows = metDays.map((x) => {
    const z = x.raw || {}
    const tot = (z.cash || 0) + (z.cashless || 0)
    return {
      dd: x.dd, dowRu: x.dowRu, weekend: x.weekend, partial: x.status === 'partial', rev: x.fact,
      cells: metColumns.map((c) => ({ key: c.key, value: c.get(z) })),
      cashPct: tot ? Math.round((z.cash / tot) * 100) : null,
      cashlessPct: tot ? Math.round((z.cashless / tot) * 100) : null,
    }
  })

  // журнал прогноза — РЕНДЕР из payload (не пересчёт), + класс и стрелка ко вчерашнему
  let prev = null
  const journal = (set.journal || []).map((s) => {
    const arrow = prev == null ? 'flat' : s.landing > prev + 5000 ? 'up' : s.landing < prev - 5000 ? 'down' : 'flat'
    prev = s.landing
    return {
      date: s.date, realized: s.realized, landing: s.landing, landingPct: s.landing_pct,
      onPlan: s.on_plan, achievable: s.achievable,
      // goal_state пишет build_daily.py (v2.1 §5); фолбэк для старых payload — из achievable
      // (без 'record': бинарной истории трёх состояний не восстановить).
      goalState: s.goal_state || (s.achievable ? 'ok' : 'out'),
      sig: sigClass(s.landing_pct), arrow,
    }
  })

  // панель коэффициентов
  const calib = set.calib || {}
  const coefRows = DOW_RU.map((dn, i) => ({
    dowRu: dn, coef: coefArr[i] ?? null, src: (set.dow_src || [])[i] || null,
    n: (set.dow_n || [])[i] ?? null, assume: ((set.dow_src || [])[i] || '') !== 'данные',
  }))
  const maxCoef = Math.max(...coefArr.map((c) => c || 0), 1.3)

  // hero
  const landDev = T ? landing / T - 1 : 0
  const factPct = T ? Math.min(100, (realizedRev / T) * 100) : 0
  const landPct = T ? Math.min(100, (landing / T) * 100) : 0
  const gap = Math.max(0, T - landing)

  return {
    park: set.park, parkName: set.park_name, month: set.month, Y, M, DIM,
    T, goal, planRealized, realizedRev, realizedCount: realized.length,
    impliedBase, adjBase,
    signals: Array.isArray(set.signals) ? set.signals : [],
    landing, landDev, fcSig: sigClass(T ? landing / T : null),
    achievable, goalState, remainTarget, factPct, landPct, gap,
    onPlan, tailCum, spread: remaining.length ? Math.abs(tailCum) / remaining.length : 0,
    currentPace, needPerDay, paceGap, futureCount: futureDays.length,
    days, weeks, dayStats, metColumns, metRows, journal, drivers,
    coefRows, maxCoef, calib, holidays: set.holidays || [],
    lead: set.lead || null,
    crossCheck: set.cross_check || null,
  }
}

// Сетевой агрегат «Вся сеть»: мини-карты по паркам + сетевые суммы.
// setsByKey — объект payload.sets; parkIds — какие парки включать (в порядке).
// Для каждого парка берём его ПОСЛЕДНИЙ месяц (max month).
export function computeNetwork(setsByKey, parkIds, now = new Date()) {
  // Месяц каждого парка — по общему правилу pickMonth, а НЕ «максимум в данных».
  // Максимум перекидывал виджет Главной на пустой будущий месяц в тот же миг, когда
  // контур B заводил маску следующего месяца: план есть, факта нет, и на Главной
  // вместо живого месяца появлялись нули. Месяц у парка свой — у отстающего парка
  // последний закрытый может отличаться.
  const monthsOf = {}
  Object.entries(setsByKey || {}).forEach(([key, s]) => {
    const p = s.park || key.split(':')[0]
    ;(monthsOf[p] || (monthsOf[p] = [])).push(String(s.month))
  })
  const byPark = {}
  Object.entries(setsByKey || {}).forEach(([key, s]) => {
    const p = s.park || key.split(':')[0]
    if (String(s.month) === pickMonth(monthsOf[p], now)) byPark[p] = s
  })
  const cards = []
  let dLanding = 0, nLanding = 0, dOnPlan = 0, nOnPlan = 0
  for (const pid of parkIds) {
    const s = byPark[pid]
    if (!s) continue
    const m = computeDaily(s)
    if (!m) continue
    const assume = (s.dow_src || []).some((x) => x !== 'данные')
    cards.push({
      park: pid, parkName: s.park_name, month: s.month,
      target: m.T, goal: m.goal, earned: m.realizedRev, landing: m.landing,
      landDev: m.landDev, fcSig: m.fcSig, achievable: m.achievable, goalState: m.goalState,
      onPlan: m.onPlan, tailCum: m.tailCum, assume,
      planRealized: m.planRealized, daysDone: m.realizedCount, daysTotal: m.DIM,
      signal: latestSignal(sortSignals(s.signals)),
    })
    // моментум «как в журнале»: последний шаг journal по каждому парку (сетевой ряд A)
    const j = m.journal || []
    if (j.length >= 2) {
      const a = j[j.length - 1], b = j[j.length - 2]
      if (a.landing != null && b.landing != null) { dLanding += a.landing - b.landing; nLanding++ }
      if (a.onPlan != null && b.onPlan != null) { dOnPlan += a.onPlan - b.onPlan; nOnPlan++ }
    }
  }
  const totTarget = sum(cards, (c) => c.target)
  const totEarned = sum(cards, (c) => c.earned)
  const totLanding = sum(cards, (c) => c.landing)
  // ЦЕЛЬ по сети (D-34). Складываем ТОЛЬКО если она есть у ВСЕХ парков в агрегате:
  // частичная сумма сравнивала бы цель одних парков с фактом всех — шкала бы врала.
  // Хоть у одного null → goal=null, виджет строит шкалу до плана. goalParks/goalPartial —
  // чтобы UI мог честно сказать, почему цели нет.
  const goalCards = cards.filter((c) => c.goal != null)
  const totGoal = goalCards.length === cards.length && cards.length ? sum(goalCards, (c) => c.goal) : null
  // План-на-сегодня по сети = Σ план закрытых дней. Держим суммой (не средним):
  // он сравнивается с суммой факта на одной денежной шкале.
  const totPlanRealized = sum(cards, (c) => c.planRealized || 0)
  // Прогресс месяца по времени. Парки могут отличаться на день (разная дата
  // последнего закрытого дня) — берём максимум закрытых дней и максимум длины месяца:
  // шкала времени общая для сети, отставание одного парка её не должно укорачивать.
  const daysDone = cards.length ? Math.max(...cards.map((c) => c.daysDone || 0)) : null
  const daysTotal = cards.length ? Math.max(...cards.map((c) => c.daysTotal || 0)) : null
  const opv = cards.map((c) => c.onPlan).filter((v) => v != null && Number.isFinite(v))
  const onPlanAvg = opv.length ? opv.reduce((a, b) => a + b, 0) / opv.length : null
  const tailCumSum = sum(cards, (c) => c.tailCum || 0)
  const months = cards.map((c) => c.month).filter(Boolean).sort()
  // моментум прогноза (landing) и исполнения (onPlan) — стрелки как в журнале
  const LTHR = 5000 * (nLanding || 1)
  const trendForecast = nLanding === 0 ? null : (dLanding > LTHR ? 'up' : dLanding < -LTHR ? 'down' : 'flat')
  const meanDOnPlan = nOnPlan ? dOnPlan / nOnPlan : null
  const trendPlanFact = meanDOnPlan == null ? null : (meanDOnPlan > 0.003 ? 'up' : meanDOnPlan < -0.003 ? 'down' : 'flat')
  return {
    cards,
    totals: {
      target: totTarget, goal: totGoal, earned: totEarned, landing: totLanding,
      planRealized: totPlanRealized, daysDone, daysTotal,
      goalParks: goalCards.length, goalPartial: goalCards.length > 0 && goalCards.length < cards.length,
      landDev: totTarget ? totLanding / totTarget - 1 : 0,
      fcSig: sigClass(totTarget ? totLanding / totTarget : null),
      onPlanAvg, tailCumSum,
      trendForecast, trendPlanFact,
      month: months.length ? months[months.length - 1] : null,
      anyAssume: cards.some((c) => c.assume),
    },
  }
}

// Список месяцев набора для парка + выбор последнего (max month).
// ── ВЫБОР МЕСЯЦА ПО УМОЛЧАНИЮ (ТЗ-6 §2.1) ───────────────────────────────────
// Правило одно на весь дневной слой: и «Контроль дня», и виджет месяца на Главной
// обязаны показывать ОДИН и тот же месяц, иначе Главная и экран контроля разойдутся.
//
// 1. текущий календарный месяц по МСК есть в данных → берём его;
// 2. иначе — последний месяц НЕ ПОЗЖЕ текущего;
// 3. иначе (в данных только будущее) — последний доступный.
//
// Пункт 2 — суть правки. Раньше брался просто максимум, и как только контур B
// заводил маску следующего месяца заранее (план есть, дни пустые), экран
// перепрыгивал на пустой месяц, а живой текущий пропадал. Теперь будущий месяц
// сам не выбирается — он доступен только вручную через пикер.
//
// `now` инъектируется в тестах: правило завязано на календарь, и проверять его
// «когда наступит август» — не приёмка, а ожидание.
export function pickMonth(months, now = new Date()) {
  const list = (Array.isArray(months) ? months : []).filter(Boolean).slice().sort()
  if (!list.length) return null
  const t = mskToday(now)
  const cur = t && t.ym
  if (cur && list.includes(cur)) return cur
  if (cur) {
    const past = list.filter((m) => m <= cur)
    if (past.length) return past[past.length - 1]
  }
  return list[list.length - 1]
}

// ── КАКИЕ МЕСЯЦЫ ПРЕДЛАГАТЬ В ПИКЕРЕ (решение владельца 31.07) ──────────────
// «Июль и далее каждый следующий, для которого есть план».
//
// Апрель–июнь 2026 лежат в данных ПОЛНОСТЬЮ (30/30 закрытых дней, журнал), но
// залиты они как база для калибровки коэффициентов дней недели, а не как месяцы
// контроля: сам «Контроль дня» ведётся с июля. По форме они неотличимы от июля,
// поэтому отличить их можно только этой границей — вычислить её из данных нечем.
export const DAILY_FIRST_MONTH = '2026-07'

/**
 * Месяцы парка для пикера: есть ПЛАН и месяц не раньше DAILY_FIRST_MONTH.
 * По возрастанию (разворачивает вызывающий).
 *
 * Фолбэк намеренный: если под границу не попал НИ ОДИН месяц (дев-фикстура живёт
 * в 2025 году, да и границу когда-нибудь сдвинут), возвращаем всё, что есть с
 * планом. Пустой пикер и экран без данных — цена выше, чем лишний месяц в списке.
 */
export function monthsForPicker(setsByKey, parkId, first = DAILY_FIRST_MONTH) {
  const withPlan = Object.values(setsByKey || {})
    .filter((s) => s && s.park === parkId && Number(s.month_target) > 0)
    .map((s) => String(s.month))
    .sort()
  const scoped = withPlan.filter((m) => m >= first)
  return scoped.length ? scoped : withPlan
}

export function monthsForPark(setsByKey, parkId) {
  const months = Object.values(setsByKey || {})
    .filter((s) => (s.park || '') === parkId)
    .map((s) => s.month)
    .sort()
  return months
}
export function setForParkMonth(setsByKey, parkId, month) {
  return Object.values(setsByKey || {}).find((s) => s.park === parkId && s.month === month) || null
}
