// i18n раздела «Сводки сети». Данные — английские ключи (cadence/status), UI —
// русский. Месяцы — ЗАХАРДКОЖЕННЫЙ массив, Intl НЕ используем: ICU-локаль в
// Node-сборке/CI нестабильна (то же правило, что в i18n/daily.js §DOW).

import { ddmm, DOW_FULL } from './daily.js'

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

// День недели по ISO-дате, с заглавной: «Пятница». Считаем из даты, а не из
// данных, и без Intl — ICU-локаль в Node-сборке нестабильна (правило файла).
export function dowTitle(iso) {
  // Форму даты проверяем строго: utc() терпим к мусору («24.07.2026» он разберёт
  // как 24-й год) и молча вернул бы неверный день недели.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return ''
  const t = utc(iso)
  if (!t) return ''
  const d = t.getUTCDay() // 0=Вс
  const name = DOW_FULL[d === 0 ? 6 : d - 1]
  return name ? name[0].toUpperCase() + name.slice(1) : ''
}

// Заголовок карточки — БЕЗ периода: период идёт отдельным бейджем рядом (v2.1),
// разделителей «·» в разделе больше нет.
//   неделя → «Неделя 3» — номер внутри месяца, как в «Контроле Дня» (v2.3);
//            номер считает netSummary.weekIndexOf, сюда приходит готовым,
//            нет номера (битая запись) → общее «Сводка недели»;
//   день   → «Пятница» — реальный день недели из даты (v2.5), по образцу недель;
//   месяц  → «Сводка месяца».
export function cardTitle(cadence, { weekIdx = null, date = null } = {}) {
  if (cadence === 'week' && weekIdx) return `Неделя ${weekIdx}`
  if (cadence === 'day') return dowTitle(date) || CADENCE_TITLE.day
  return CADENCE_TITLE[cadence] || 'Сводка'
}

// Подпись среза формы под заголовком: «данные на 25.07» (v2.5).
// Показываем ТОЛЬКО дату: время забора формы пользователю ничего не даёт, а
// смысл подписи — снять путаницу «почему сводка за 24.07, если прислали 25-го».
// Среза нет (старый payload) → пусто, строка не рендерится.
export function asofLabel(asof) {
  const s = String(asof || '').slice(0, 10)
  const d = ddmm(s)
  return d ? `данные на ${d}` : ''
}

export const L = {
  // Раздел переименован «Сводки сети» → «Тренды» (правка владельца 28.07);
  // внутренние ключи/id (`summary`) и заголовки карточек «Сводка дня/недели/месяца»
  // не тронуты — переименован только раздел (плитка Главной + заголовок страницы).
  section: 'Тренды',
  home_tile: 'Тренды',
  back: 'Главная',
  seg_aria: 'Период сводок',
  more: 'Подробнее',
  less: 'Свернуть',
  empty: 'Сводок пока нет',
  empty_hint: 'Раздел подхватит их автоматически, когда контур соберёт сводку по сети.',
  error: 'Не удалось загрузить сводки',
  retry: 'Повторить',
  // Перенос строки задан явно (\n) и рендерится через whitespace-pre-line:
  // фраза должна ложиться ровно в две строки, а не по ширине экрана.
  lead: 'Где парки сегодня и\nкакой прогноз на месяц',
}
