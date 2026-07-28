// i18n под-страницы «Контроль Дня». Данные — английские ключи, UI — русский.
// Формат ₽/int/growth ПЕРЕИСПОЛЬЗУЕМ из i18n/analytics.js (не дублируем); здесь —
// только дневные компактные форматтеры (млн/тыс, 2 знака) и подписи.

import { formatInt, formatGrowth, DASH } from './analytics.js'

const NBSP = ' '

// «4,77 млн» (2 знака) — hero/прогноз/недели.
export function mln(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  return `${(Number(n) / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}млн`
}
// «128 тыс» — таблицы дней.
export function ths(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  return `${formatInt(Math.round(Number(n) / 1000))}${NBSP}тыс`
}
// «+128 тыс» / «−128 тыс» (минус типографский, через formatInt).
export function thsSigned(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  const v = Number(n)
  return `${v >= 0 ? '+' : '−'}${formatInt(Math.round(Math.abs(v) / 1000))}${NBSP}тыс`
}
// доля-фракция → «+1,4 %» / «−8,2 %» (переиспользует formatGrowth аналитики).
export function pctSigned(x) {
  if (x == null || !Number.isFinite(Number(x))) return DASH
  return formatGrowth(Number(x) * 100)
}
// доля-фракция → «95%» (без знака, целое) — «идём к плану».
export function pctWhole(x) {
  if (x == null || !Number.isFinite(Number(x))) return DASH
  return `${Math.round(Number(x) * 100)}%`
}

// Месяцы (родительный для «13 июля»; именительный для заголовка).
const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

// 'YYYY-MM' → «июль 2026».
export function monthTitle(ym) {
  if (typeof ym !== 'string') return ''
  const [y, m] = ym.split('-')
  const mi = Number(m)
  if (!Number.isFinite(mi) || mi < 1 || mi > 12) return ym
  return `${MONTH_NOM[mi - 1]} ${y}`
}
// day-of-month + 'YYYY-MM' → «13 июля».
export function dayGen(dd, ym) {
  const mi = Number(String(ym).split('-')[1])
  const g = MONTH_GEN[mi - 1] || ''
  return `${dd} ${g}`
}
// имя дня месяца из ISO → «13 июля».
export function dayGenIso(iso) {
  return dayGen(Number(iso.slice(8)), iso.slice(0, 7))
}

// Дни недели для полосы A (v3) — ЗАХАРДКОЖЕННЫЕ RU-массивы. Intl /
// toLocaleDateString('ru') НЕ используем: ICU-локаль в Node-сборке/CI нестабильна
// (снапшоты тестов поплывут). Индекс — Пн=0..Вс=6 (dow−1). Строчные: строки
// «Вчера {пн}» и «Сегодня {суббота}».
export const DOW_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
export const DOW_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

// 'YYYY-MM-DD' → «16.05» (DD.MM, без локали).
export function ddmm(iso) {
  const s = String(iso || '')
  if (s.length < 10) return s
  return `${s.slice(8, 10)}.${s.slice(5, 7)}`
}
// Целые рубли с разделителем тысяч: «44 000 ₽».
export function rubWhole(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  return `${formatInt(Math.round(Number(n)))}${NBSP}₽`
}

// Короткий код активности для бейджей (v2.2 §3, display-only): суффикс после
// последнего дефиса — «Питер-Г1» → «Г1». В данных/payload код остаётся полным,
// парко-имённым; в пультах контура B — тот же split('-').pop().
export const actCode = (c) => String(c ?? '').split('-').pop()

// Токен-класс заливки по sigClass → CSS-переменная сигнала.
export const SIG_VAR = { good: 'var(--positive)', warn: 'var(--warning)', bad: 'var(--negative)', idle: 'var(--line)' }

// Три состояния достижимости цели (v2.1 §5, D-16). Цветная — ТОЛЬКО точка-индикатор,
// текст всегда монохромный (DESIGN-STANDARD); рядом с точкой смысл дублируется словами.
export const GOAL_STATE = {
  ok:     { dot: 'var(--positive)', label: 'цель достижима',             journal: '✓ достижима' },
  record: { dot: 'var(--warning)',  label: 'нужен рекордный темп',       journal: '↑ рекордный темп' },
  out:    { dot: 'var(--negative)', label: 'фокус — минимум отставания', journal: 'вне досягаемости' },
}

export const L = {
  home_banner: 'Контроль Дня',
  back: 'Главная',
  title: 'Контроль Дня',
  empty_park: 'Дневного слоя по этому парку пока нет',
  empty_park_hint: 'Страница подхватит его автоматически, когда данные появятся.',
  target: 'Цель месяца',
  forecast: 'Прогноз выручки',
  forecast_hint: 'при текущем темпе',
  to_earn: 'осталось заработать',
  earned: 'заработано',
  will_add: 'прогноз добавит',
  gap: 'по прогнозу не хватит',
  kpi_earned: 'Заработано',
  kpi_onplan: 'Идём к плану',
  kpi_tail: 'Хвост накоплен',
  kpi_pace: 'Нужный темп на остаток',
  by_weeks: 'По неделям',
  summary: 'Сводка по неделям',
  month: 'Месяц',
  plan: 'план',
  fact: 'факт',
  need: 'надо',
  progress: 'прогресс',
  days_by_plan: 'Дни по плану',
  above: 'выше плана',
  close: 'близко 85–99%',
  below: 'ниже 85%',
  journal: 'Журнал прогноза',
  metrics: 'Метрики по дням',
  coef: 'Коэффициенты дней недели',
  activities: 'Активности и гипотезы',
  lever: 'Главный рычаг цели',
  network: 'Вся сеть',
  net_target: 'цель сети',
  net_earned: 'заработано',
  net_forecast: 'прогноз',
  assume: 'допущение',
  // v3 «Контроль Дня» — сигнал дня (полоса B) + «Как идёт день» (полоса A)
  signal_title: 'Сигнал Дня',
  signal_by: 'разбор аналитика от',
  signal_new: 'новое',
  signal_read: 'Прочитала',
  signal_read_done: 'Прочитано',
  signal_feed: 'Ранее в этом месяце',
  signal_error: 'Не удалось отметить. Проверьте связь и попробуйте ещё раз.',
  signal_empty: 'Разбор аналитика появится позже.',
  // v3.2: модалка оценки пользы Сигнала (открывается кнопкой «Прочитала»).
  // Вопрос — дословно от владельца (правка 28.07). Оценка уходит вместе с
  // отметкой прочтения (signal_read + score) в лист signal_scores на бэке.
  signal_rate_q: 'Оцените пользу Сигнала?',
  signal_rate_min: '0 — не полезно',
  signal_rate_max: '10 — очень полезно',
  signal_rate_send: 'Отправить',
  signal_rate_aria: 'Оценка пользы Сигнала от 0 до 10',
  day_title: 'Как идёт день',
}
