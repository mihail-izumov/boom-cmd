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

export const L = {
  daily: 'Контроль Дня',
  goals: 'Цели и планы',
  planfact: 'План/Факт',
  tail: 'Разрыв',
  forecast: 'Прогноз выручки',
  pace: 'Прогноз/План',
}
