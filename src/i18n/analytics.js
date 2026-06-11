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
export const PERIODS = [
  { id: 'month', label: 'Месяц', months: 1 },
  { id: 'q', label: '3 месяца', months: 3 },
  { id: 'year', label: 'Год', months: 12 },
]

// Подпись окна периода у заголовка / бейджа.
export const PERIOD_LABEL = {
  month: 'Месяц',
  q: '3 месяца',
  year: 'Год',
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

// Компактные количества: 12 тыс / 1,2 млн.
export function formatIntCompact(n) {
  const v = safeNum(n)
  if (v === null) return DASH
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}${NBSP}млн`
  if (abs >= 1_000) return `${Math.round(v / 1_000)}${NBSP}тыс`
  return formatInt(v)
}
