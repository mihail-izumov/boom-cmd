// i18n для раздела «Аналитика».
// Принцип: данные на английском (домены, поля), UI по-русски.
// Подписи полей — из DATA-CONTRACT §2 (источник истины).
// Имена парков берём из src/data/parks.js (одна правда на проект).

import { PARKS } from '../data/parks.js'

// Домены = вкладки внутри секции (без 'home' — это специальный главный экран).
export const DOMAIN_ORDER = [
  'revenue',
  'players',
  'cards',
  'game_econ',
  'prizes',
  'reviews',
]

// Русские названия вкладок (из чертежа struktura_dashboard.html + контракта §2).
export const DOMAIN_RU = {
  revenue: 'Пополнения',
  players: 'Игроки',
  cards: 'Карты',
  game_econ: 'Чек игры',
  prizes: 'Призотека',
  reviews: 'Отзывы',
}

// Русские подписи полей (DATA-CONTRACT §2 — копировать дословно).
export const FIELD_RU = {
  // revenue
  total_revenue: 'Итого выручка',
  cashless: 'Безнал',
  cash: 'Нал',
  website: 'Сайт',
  receipts: 'Чеки',
  // players
  visitors_total: 'Посетителей всего',
  new_visitors: 'Новых',
  new_share_pct: 'Доля новых',
  capture_rate_pct: 'Capture rate (от трафика ТЦ)',
  // cards
  cards_in_system: 'Карт в системе',
  returning_pct: 'Вернувшихся',
  avg_visits: 'Средних визитов',
  outstanding_points_rub: 'Непогашенные очки-деньги',
  unredeemed_tickets_qty: 'Невыкупленные тикеты',
  max_payment_rub: 'Макс. платёж',
  // game_econ
  games: 'Игры',
  avg_game_price: 'Средняя цена игры',
  game_revenue: 'Игровая выручка (очки-деньги)',
  tickets_issued: 'Тикетов выдано',
  bonus_points: 'Бонусные очки',
  ticket_loop_pct: 'Тикетный контур',
  payout_share_pct: 'Payout от игровой выручки',
  // prizes
  prizes_given: 'Призов выдано',
  prize_cost: 'Себестоимость',
  profitability_pct: 'Прибыльность',
  payout_target_pct: 'Payout призотеки (цель 20–25%)',
  // reviews
  yandex_total: 'Отзывы Яндекс (всего)',
  twogis_total: 'Отзывы 2ГИС (всего)',
  yandex_growth: 'Прирост Яндекс за месяц',
  // derived (производные, не из API)
  avg_check: 'Средний чек',
}

// Единицы — для подписей рядом со значениями.
export const UNIT = {
  rub: '₽',
  qty: 'шт',
  pct: '%',
  people: 'чел',
  visits_per_card: 'виз./карту',
}

// Период — для сегмент-переключателя и сводок.
// Подписи компактные: «Месяц» (дефолт; на UI подменяется именем текущего
// месяца), «3 мес», «12 мес» — по запросу владельца.
export const PERIODS = [
  { id: 'month', label: 'Месяц', months: 1 },
  { id: 'q', label: '3 мес', months: 3 },
  { id: 'year', label: '12 мес', months: 12 },
]

export const PERIOD_LABEL = {
  month: 'Месяц',
  q: '3 мес',
  year: '12 мес',
}

// Производный словарь имён парков (через единый справочник).
export const PARK_RU = Object.fromEntries(PARKS.map((p) => [p.id, p.name]))

// Безопасный перевод с фолбэком.
export const t = (dict, key) => (key != null && dict[key] != null ? dict[key] : String(key))

// Русское склонение для счётчиков (как в i18n/projects.js).
export function pluralRu(n, forms) {
  const abs = Math.abs(Number(n) || 0)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export const MONTHS_PLURAL = ['месяц', 'месяца', 'месяцев']
export const REVIEWS_PLURAL = ['отзыв', 'отзыва', 'отзывов']

// Месяц 'YYYY-MM' → 'мес YYYY' (для трендов и подписей последнего месяца).
const MONTH_RU_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]
export function monthLabel(ym) {
  if (typeof ym !== 'string') return '—'
  const [y, m] = ym.split('-')
  const mi = Number(m)
  if (!Number.isFinite(mi) || mi < 1 || mi > 12) return ym
  return `${MONTH_RU_SHORT[mi - 1]} ${y}`
}

// 'YYYY-MM' → короткое имя месяца с большой буквы («Май») — для подписи
// переключателя периода «Месяц», когда хотим конкретный месяц.
export function monthShortCap(ym) {
  if (typeof ym !== 'string') return ''
  const [, m] = ym.split('-')
  const mi = Number(m)
  if (!Number.isFinite(mi) || mi < 1 || mi > 12) return ''
  const w = MONTH_RU_SHORT[mi - 1]
  return w.charAt(0).toUpperCase() + w.slice(1)
}

// 'YYYY-MM' → 'YYYY' (для бейджей y/y и подписей).
export function yearOf(ym) {
  return typeof ym === 'string' ? ym.slice(0, 4) : ''
}

// === Форматтеры числовых значений ====================================
// Локализованный вывод (ru-RU): неразрывный пробел в разрядах, запятая
// в дробных. Везде null/undefined/NaN → прочерк «—» (§4 контракта).

const NBSP = ' '
export const DASH = '—'

function safeNum(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Целое число с разделителями (1 234 567).
export function formatInt(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  return Math.round(v).toLocaleString('ru-RU').replace(/\s/g, NBSP)
}

// Рубли целые (1 234 567 ₽).
export function formatRub(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  return `${formatInt(v)}${NBSP}₽`
}

// Рубли с двумя знаками после запятой (568,73 ₽) — для среднего чека и
// средней цены игры. Округление .toFixed(2) (half-away-from-zero в V8).
export function formatRub2(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  return `${v.toFixed(2).replace('.', ',')}${NBSP}₽`
}

// Процент с заданным числом знаков (по умолчанию 1): 58,1 %.
export function formatPct(n, digits = 1) {
  const v = safeNum(n)
  if (v === null) return DASH
  return `${v.toFixed(digits).replace('.', ',')}${NBSP}%`
}

// Рост к прошлому периоду: +12,3 % / −5,1 % / —.
// Минус — типографский (U+2212), не дефис.
export function formatGrowth(n, digits = 1) {
  const v = safeNum(n)
  if (v === null) return DASH
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  const abs = Math.abs(v).toFixed(digits).replace('.', ',')
  return `${sign}${abs}${NBSP}%`
}

// Компактные деньги для подписей трендов: 5,9 млн ₽ / 1,2 тыс ₽ / 750 ₽.
export function formatRubCompact(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}${NBSP}млн${NBSP}₽`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(0)}${NBSP}тыс${NBSP}₽`
  return `${formatInt(v)}${NBSP}₽`
}

// Целое со знаком: +172 / −172 / 0 / —. Минус — типографский U+2212.
// Применять для дельта-метрик в штуках (например, прирост отзывов —
// может быть отрицательным, когда Яндекс модерирует/удаляет отзывы).
export function formatIntSigned(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  if (v === 0) return formatInt(0)
  const sign = v > 0 ? '+' : '−'
  return `${sign}${formatInt(Math.abs(v))}`
}

// Компактные количества: 12 тыс / 1,2 млн.
export function formatIntCompact(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}${NBSP}млн`
  if (abs >= 1_000) return `${Math.round(v / 1_000)}${NBSP}тыс`
  return formatInt(v)
}

// === Балансовые карточки (вариант B, утверждён владельцем) =============
// Подписи «баланс на {дата}» + строка «Δ за период». Текст СТРОГО
// монохромный (DESIGN-STANDARD: цветного текста нет, никаких
// зелёных/красных дельт) — форматтеры отдают только строку, окраской
// не управляют.

// 'YYYY-MM' → 'DD.MM.YYYY' последнего дня месяца (подпись «баланс на …»).
export function lastDayLabel(ym) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return DASH
  const [y, m] = ym.split('-').map(Number)
  if (!Number.isFinite(m) || m < 1 || m > 12) return DASH
  const d = new Date(y, m, 0).getDate() // день 0 след. месяца = последний день этого
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

// Названия балансовых карточек (данные — английские ключи, UI — русский).
export const BALANCE_TITLES = {
  obligations: 'Непогашенные обязательства',
  cards_in_system: 'Карт в системе',
  outstanding_points: 'Непогашенные очки-деньги',
  unredeemed_tickets: 'Невыкупленные тикеты',
}

export const BALANCE_LABELS = {
  onDate: (ym) => `баланс на ${lastDayLabel(ym)}`,
  onVariousDates: 'баланс на разные даты',
  delta: 'Δ за период',
  deltaVariousSpans: 'Δ за разные периоды',
  deltaSpan: (from, to) =>
    from === to ? `Δ за ${monthLabel(from)}` : `Δ за ${monthLabel(from)}–${monthLabel(to)}`,
  // Локализованный месяц («дек 2025»), не сырой YYYY-MM — решение владельца.
  deltaNoData: (prevYm) => `нет данных за ${monthLabel(prevYm)}`,
  deltaParks: (k, n) => `${k} из ${n} парков`,
}

// Заголовок балансовой карточки: «{Название} · баланс на 31.05.2026».
// dates — выход lastInPeriod().dates (одного или нескольких полей);
// разные даты у парков → существующий паттерн «на разные даты»
// (детали по паркам — MultiDateNotice).
export function balanceTitle(key, dates) {
  const base = t(BALANCE_TITLES, key)
  const uniq = [...new Set((dates || []).filter(Boolean))]
  if (uniq.length === 1) return `${base} · ${BALANCE_LABELS.onDate(uniq[0])}`
  if (uniq.length > 1) return `${base} · ${BALANCE_LABELS.onVariousDates}`
  return base
}

// Рубли со знаком: +12 345 ₽ / −6 789 ₽ / 0 ₽ / — (минус U+2212).
export function formatRubSigned(n) {
  const s = formatIntSigned(n)
  return s === DASH ? DASH : `${s}${NBSP}₽`
}

// Штуки со знаком: +3 шт / −6 789 шт / 0 шт / —.
export function formatQtySigned(n) {
  const s = formatIntSigned(n)
  return s === DASH ? DASH : `${s}${NBSP}шт`
}

// Подпись строки Δ: обычная / усечённый диапазон / «разные периоды
// у парков» (паттерн MultiDateNotice — без перечисления, решение
// владельца). dRub/dQty — выходы balanceDelta().
export function deltaRowLabel(dRub, dQty) {
  if ((dRub && dRub.multipleSpans) || (dQty && dQty.multipleSpans)) {
    return BALANCE_LABELS.deltaVariousSpans
  }
  const span = (dRub && dRub.span) || (dQty && dQty.span)
  if (span) return BALANCE_LABELS.deltaSpan(span.from, span.to)
  return BALANCE_LABELS.delta
}

// Однострочная версия для KPI-плитки Сводного экрана:
//   «Δ за период: +12 345 ₽ · −6 789 шт» (+ « · 2 из 3 парков» на сети
//   при частичной Δ) / «Δ за период: нет данных за дек 2025».
export function deltaLine(dRub, dQty, { network = false } = {}) {
  const vRub = dRub ? dRub.value : null
  const vQty = dQty ? dQty.value : null
  if (vRub === null && vQty === null) {
    const prev = (dRub && dRub.prevMonth) || (dQty && dQty.prevMonth) || null
    return `${BALANCE_LABELS.delta}: ${BALANCE_LABELS.deltaNoData(prev)}`
  }
  let line = `${deltaRowLabel(dRub, dQty)}: ${formatRubSigned(vRub)} · ${formatQtySigned(vQty)}`
  if (network && dRub && vRub !== null && dRub.contribParks < dRub.totalParks) {
    line += ` · ${BALANCE_LABELS.deltaParks(dRub.contribParks, dRub.totalParks)}`
  }
  return line
}
