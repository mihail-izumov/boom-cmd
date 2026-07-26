// i18n раздела «Сводки сети». Данные — английские ключи (cadence/status), UI —
// русский. Месяцы — ЗАХАРДКОЖЕННЫЙ массив, Intl НЕ используем: ICU-локаль в
// Node-сборке/CI нестабильна (то же правило, что в i18n/daily.js §DOW).

import { ddmm } from './daily.js'

// Неразрывный пробел записан escape'ом намеренно: невидимый символ в исходнике
// теряется при любой автоматической правке файла и молча ломает подписи.
const NBSP = '\u00A0'

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

// Подписи сегментированного переключателя каденса (ТЗ v2 §3.1).
// Внутри выбранного месяца месячная сводка ровно одна — потому «Месяц», не «Месяцы».
export const CADENCE_SEG = {
  day: 'Дни',
  week: 'Недели',
  month: 'Месяц',
}

// Подпись месяца для селектора: «Июль 2026» из ключа 'YYYY-MM'.
export function monthLabel(key) {
  return periodLabel('month', `${String(key || '')}-01`)
}

// Заголовок карточки — БЕЗ периода: период идёт отдельным бейджем рядом (v2.1),
// разделителей «·» в разделе больше нет.
// Неделя называется по номеру внутри месяца — «Неделя 3», как в «Контроле Дня»
// (v2.3). Номер считает слой данных (netSummary.weekIndexOf), сюда приходит готовым;
// его нет (битая запись) — падаем на общее «Сводка недели».
export function cardTitle(cadence, weekIdx = null) {
  if (cadence === 'week' && weekIdx) return `Неделя ${weekIdx}`
  return CADENCE_TITLE[cadence] || 'Сводка'
}

export const L = {
  section: 'Сводки сети',
  home_tile: 'Сводки',
  back: 'Главная',
  seg_aria: 'Период сводок',
  more: 'Подробнее',
  less: 'Свернуть',
  empty: 'Сводок пока нет',
  empty_hint: 'Раздел подхватит их автоматически, когда контур соберёт сводку по сети.',
  error: 'Не удалось загрузить сводки',
  retry: 'Повторить',
  lead: 'Где сеть сейчас и куда движется. Цифры парков собраны в сетевые на стороне данных.',
}
