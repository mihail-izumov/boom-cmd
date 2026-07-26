// i18n раздела «Сводки сети». Данные — английские ключи (cadence/status), UI —
// русский. Месяцы — ЗАХАРДКОЖЕННЫЙ массив, Intl НЕ используем: ICU-локаль в
// Node-сборке/CI нестабильна (то же правило, что в i18n/daily.js §DOW).

import { ddmm } from './daily.js'

const NBSP = ' '

const MONTH_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

// 'YYYY-MM-DD' → Date в UTC (без локальной таймзоны — арифметика дат стабильна).
function utc(iso) {
  const s = String(iso || '')
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  const d = Number(s.slice(8, 10))
  if (!(y && m && d)) return null
  return new Date(Date.UTC(y, m - 1, d))
}
// ISO + N дней → 'YYYY-MM-DD'.
export function addDays(iso, n) {
  const t = utc(iso)
  if (!t) return String(iso || '')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

// Подпись периода по каденсу и якорю:
//   day   → «24.05»            (якорь = день, за который цифры)
//   week  → «12.05–18.05»      (якорь = понедельник, +6)
//   month → «Май 2026»         (якорь = 1-е число)
export function periodLabel(cadence, date) {
  const iso = String(date || '')
  if (cadence === 'week') return `${ddmm(iso)}–${ddmm(addDays(iso, 6))}`
  if (cadence === 'month') {
    const mi = Number(iso.slice(5, 7))
    const y = iso.slice(0, 4)
    if (!(mi >= 1 && mi <= 12)) return iso
    return `${MONTH_NOM[mi - 1]}${NBSP}${y}`
  }
  return ddmm(iso)
}

export const CADENCE_TITLE = {
  day: 'Сводка дня',
  week: 'Сводка недели',
  month: 'Сводка месяца',
}

// Полный заголовок карточки: «Сводка недели · 12.05–18.05».
export function cardTitle(cadence, date) {
  const head = CADENCE_TITLE[cadence] || 'Сводка'
  const per = periodLabel(cadence, date)
  return per ? `${head}${NBSP}·${NBSP}${per}` : head
}

export const L = {
  section: 'Сводки сети',
  home_tile: 'Сводки',
  back: 'Главная',
  new: 'новое',
  more: 'Подробнее',
  less: 'Свернуть',
  empty: 'Сводок пока нет',
  empty_hint: 'Раздел подхватит их автоматически, когда контур соберёт сводку по сети.',
  error: 'Не удалось загрузить сводки',
  retry: 'Повторить',
  lead: 'Где сеть сейчас и куда движется. Цифры парков собраны в сетевые на стороне данных.',
}
