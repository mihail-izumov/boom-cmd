// i18n Главного экрана (виджеты). Данные — из daily-агрегата; здесь — форматтеры
// (₽/млн/% до десятых) и подписи. UI по-русски. Хардкод hex нет (DESIGN-STANDARD).

import { DASH } from './analytics.js'

const NBSP = ' '
const MINUS = '−'

// ₽-млн, только число до десятых: 5_402_293 → «5,4».
export function mlnNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  return (Number(n) / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
// ₽-млн со знаком рубля слитно (для мелкой подписи): «₽5,4 млн».
export function mlnRub(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  return `₽${(Number(n) / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NBSP}млн`
}
// Накопленный хвост со знаком: −₽ 0,2 млн (минус = опережение), +₽ 0,3 млн (недобор).
export function mlnSigned(n) {
  if (n == null || !Number.isFinite(Number(n))) return DASH
  const v = Number(n)
  const sign = v < 0 ? MINUS : v > 0 ? '+' : ''
  const abs = (Math.abs(v) / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  // знак — пробел — ₽ слитно с цифрой — пробел — млн
  return `${sign}${NBSP}₽${abs}${NBSP}млн`
}
// Доля-фракция → «103,7%» (до десятых). x=1.037 → 103,7%.
export function pct1(x) {
  if (x == null || !Number.isFinite(Number(x))) return DASH
  return `${(Number(x) * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
// Доля-фракция → «96%» (целое). x=0.96 → 96%.
export function pctWhole(x) {
  if (x == null || !Number.isFinite(Number(x))) return DASH
  return `${Math.round(Number(x) * 100)}%`
}
// Знаковое отклонение (как в отчётах): x=-0.077 → «−7,7%», x=0.023 → «+2,3%».
export function pctDelta(x) {
  if (x == null || !Number.isFinite(Number(x))) return DASH
  const v = Number(x) * 100
  const sign = v < 0 ? MINUS : '+'
  return `${sign}${Math.abs(v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

const MONTH = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
// 'YYYY-MM' → «Июль 2026» (с заглавной).
export function monthCap(ym) {
  if (typeof ym !== 'string') return ''
  const [y, m] = ym.split('-')
  const mi = Number(m)
  if (!(mi >= 1 && mi <= 12)) return ym
  return `${MONTH[mi - 1]}${NBSP}${y}`
}

// v3.1: счётчики Главной из daily-пейлоада (data.stats). Числа — из системы
// (журнал чекапов на бэке): чекапов может быть много, сигнал — один в день,
// потому счётчики расходятся. Фронт только рендерит; нет stats → '—'.
export function readCounters(data) {
  const s = data && data.stats && typeof data.stats === 'object' ? data.stats : null
  const num = (v) => (v != null && Number.isFinite(Number(v)) ? String(Number(v)) : null)
  return { checkups: s ? num(s.checkups) : null, signals: s ? num(s.signals) : null }
}

// Русское склонение по числу: 1 чекап · 2 чекапа · 5 чекапов · 21 чекап.
// Формы задаются тройкой [один, два, пять]. Число берём по модулю: 111 → «чекапов»
// (11–14 всегда пятая форма), 121 → «чекап».
export function plural(n, forms) {
  const v = Math.abs(Number(n))
  if (!Number.isFinite(v)) return forms[2]
  const i = Math.floor(v) % 100
  const j = i % 10
  if (i > 10 && i < 20) return forms[2]
  if (j > 1 && j < 5) return forms[1]
  if (j === 1) return forms[0]
  return forms[2]
}

const CHECKUPS = ['Чекап', 'Чекапа', 'Чекапов']
const SIGNALS = ['Сигнал', 'Сигнала', 'Сигналов']
const REVIEWS = ['Разбор', 'Разбора', 'Разборов'] // D-19: журнал «Разбор полёта»

// Подпись под счётчиком. Числа нет («—») → форма родительного множественного,
// как было до склонения: «Чекапов», «Сигналов», «Разборов».
export function checkupsWord(n) {
  return n == null ? CHECKUPS[2] : plural(n, CHECKUPS)
}
export function signalsWord(n) {
  return n == null ? SIGNALS[2] : plural(n, SIGNALS)
}
export function reviewsWord(n) {
  return n == null ? REVIEWS[2] : plural(n, REVIEWS)
}

export const L = {
  daily: 'Контроль Дня',
  goals: 'Цели и планы',
  planfact: 'План/Факт',
  tail: 'Разрыв',
  forecast: 'Прогноз выручки',
  pace: 'Прогноз/План',
  checkups: 'Чекапов',
  signals: 'Сигналов',
}
