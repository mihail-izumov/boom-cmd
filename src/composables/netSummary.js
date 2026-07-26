// netSummary.js — «Сводки сети» (день / неделя / месяц). ЧИСТЫЙ JS: на верхнем
// уровне нет vue/DOM (импортируется в Node/verify). Доступ к localStorage — только
// внутри функций и под guard'ами (переиспользуем хранилище dailySignals).
//
// СВОДКА ≠ СИГНАЛ. Сигнал — парковая дневная карточка (headline+action, daily_signals).
// Сводка — сетевая, формат из ТРЁХ блоков (block1/block2/block3), приходит отдельным
// верхнеуровневым полем payload.net_summary (по образцу payload.stats), НЕ в sets[k].
//
// Слой ТОЛЬКО рендерит payload: ничего не пересчитываем и не сочиняем (ТЗ §4).
// Здесь: валидация/сортировка записей, выбор актуальной по каденсу, разбор блока
// на метку и абзац, статусы прочитанности по ключу «summary:{cadence}:{date}».

import { loadReadStore, saveReadStore, markState, statusOf, signalDot } from './dailySignals.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Порядок карточек на экране = порядок каденсов.
export const CADENCES = ['day', 'week', 'month']

// Валидные записи, отсортированные по дате ПО ВОЗРАСТАНИЮ. Порядок в payload не
// гарантирован. Битые записи (не-объект, чужой cadence, кривая дата) отбрасываем —
// рендер не роняем; незнакомые ключи внутри записи не мешают (ТЗ §4.4).
export function sortSummaries(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (s) =>
        s &&
        typeof s === 'object' &&
        CADENCES.includes(String(s.cadence || '')) &&
        DATE_RE.test(String(s.date || '')),
    )
    .slice()
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0))
}

// Актуальная запись каденса = максимальная date ВНУТРИ своего каденса.
export function latestOf(sorted, cadence) {
  let out = null
  for (const s of sorted) if (s.cadence === cadence) out = s // отсортировано по возрастанию
  return out
}

// [{cadence, entry}] в порядке CADENCES — только те каденсы, что есть в данных.
export function latestByCadence(raw) {
  const sorted = sortSummaries(raw)
  return CADENCES.map((cadence) => ({ cadence, entry: latestOf(sorted, cadence) })).filter((x) => x.entry)
}

// Точка статуса. Цвет — ТОЛЬКО в точке, текст монохромный (DESIGN-STANDARD §3.3, D-16).
// Шкала та же, что у сигнала (ok|warn|focus), потому переиспользуем signalDot:
// неизвестный статус → нейтраль, рендер не роняем.
export const summaryDot = signalDot

// ── Разбор блока на метку и абзац (ТЗ §4.5) ──
// Метка = текст ДО первой точки, ЗА КОТОРОЙ идёт пробельный символ. Наивное «до
// первой точки» ломается на боевой строке «Итог месяца (на 23.07). Сеть факт …»
// (дало бы «Итог месяца (на 23»). Кап нужен, чтобы жирным не уехало целое
// предложение: длиннее LABEL_MAX → метку не выделяем, блок идёт сплошным абзацем.
export const LABEL_MAX = 32

export function splitBlock(text, cap = LABEL_MAX) {
  const s = typeof text === 'string' ? text.trim() : ''
  if (!s) return { label: null, rest: '' }
  const m = /\.\s/.exec(s)
  if (!m) return { label: null, rest: s }
  const label = s.slice(0, m.index)
  if (!label || label.length > cap) return { label: null, rest: s }
  return { label, rest: s.slice(m.index + 1).trim() }
}

// Блоки записи в порядке 1→2→3, пустые отброшены. `head: true` у первого блока —
// он свёрнут по умолчанию (ТЗ §4.4).
export function blocksOf(entry) {
  if (!entry || typeof entry !== 'object') return []
  return ['block1', 'block2', 'block3']
    .map((key, i) => ({ key, head: i === 0, ...splitBlock(entry[key]) }))
    .filter((b) => b.rest)
}

// ── Статусы прочитанности (на устройстве) ──
// Хранилище общее с сигналами (один namespaced ключ localStorage), ключ записи —
// «summary:{cadence}:{date}»: с парковыми ключами «{park}:{date}» не пересекается.
// Кнопка «Прочитал ✓» на сводках — фаза 2; сейчас только новое → открыто.
export function summaryScope(cadence) {
  return `summary:${cadence}`
}
export function summaryKey(cadence, date) {
  return `${summaryScope(cadence)}:${date}`
}
export function summaryStatusOf(store, cadence, date) {
  return statusOf(store, summaryScope(cadence), date)
}
export function markSummaryState(store, cadence, date, state) {
  return markState(store, summaryScope(cadence), date, state)
}

export { loadReadStore, saveReadStore }
