// dailySignals.js — «Сигнал дня» (v3, полоса B). ЧИСТЫЙ JS: на верхнем уровне
// нет vue/DOM (можно импортировать в Node/verify). Доступ к localStorage/fetch —
// только внутри функций и под guard'ами.
//
// Полоса B ТОЛЬКО рендерит payload (sets[key].signals) — ничего не пересчитываем
// и не сочиняем (ТЗ v3 §5). Здесь: выбор актуального сигнала, лента месяца,
// статусы прочитанности (localStorage, только пары «park:date»→viewed|read;
// фраза доступа сюда НЕ попадает — гейт как был, в памяти) и тело записи
// signal_read (единственная новая запись фронта, в inbox-канал).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Валидные записи, отсортированные по дате ПО ВОЗРАСТАНИЮ. Порядок в payload не
// гарантирован — сортируем на фронте (ТЗ §1). Битые записи (без валидной даты)
// и не-объекты отбрасываем — рендер не роняем (правило §7 контракта).
export function sortSignals(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && typeof s === 'object' && DATE_RE.test(String(s.date || '')))
    .slice()
    .sort((a, b) => (String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0))
}

// Актуальный сигнал = запись с максимальной датой (не обязательно сегодня —
// дата свежести честно показывается).
export function latestSignal(sorted) {
  return sorted.length ? sorted[sorted.length - 1] : null
}

// Лента месяца = все прочие записи, новые сверху. Единственный сигнал → пусто.
export function feedSignals(sorted) {
  return sorted.length > 1 ? sorted.slice(0, -1).reverse() : []
}

// Точка статуса. Цвет — ТОЛЬКО в точке (текст монохромный, DESIGN-STANDARD).
// Неизвестный статус → нейтраль, рендер не роняем (ТЗ §1).
export const SIGNAL_DOT = { ok: 'var(--positive)', warn: 'var(--warning)', focus: 'var(--negative)' }
export function signalDot(status) {
  return SIGNAL_DOT[status] || 'var(--text-muted)'
}

// ── Статусы прочитанности (на устройстве, D-17) ──
// Хранилище — один namespaced ключ localStorage с JSON-картой «park:date»→state.
// Значения: 'viewed' | 'read'. Фраза доступа НЕ хранится. Статус пер-девайсный:
// канон прочтения для владельца — лист signal_reads в inbox, локальный — только UX.
const LS_KEY = 'bc:daily:signal_reads'
export function stateKey(park, date) { return `${park}:${date}` }

export function loadReadStore() {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(LS_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}
export function saveReadStore(store) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LS_KEY, JSON.stringify(store || {}))
  } catch {
    /* приватный режим / переполнение — молча игнорируем, UX не критичен */
  }
}
// 'none' | 'viewed' | 'read'
export function statusOf(store, park, date) {
  const v = store ? store[stateKey(park, date)] : undefined
  return v === 'read' ? 'read' : v === 'viewed' ? 'viewed' : 'none'
}
export function markState(store, park, date, state) {
  store[stateKey(park, date)] = state
  return store
}

// ── Запись прочтения (signal_read) ──
// Тело POST по контракту ТЗ §2. redirect:'follow', без кастомных заголовков —
// как форма. read-only не нарушаем: пишем только в inbox-канал VITE_REPORT_API.
export function buildSignalReadBody(key, park, signalDate) {
  return { key, type: 'signal_read', park, signal_date: signalDate }
}
// Отправка. fetchImpl инъектируется в тестах (реального URL в тестах нет, §6).
export async function postSignalRead({ api, key, park, signalDate, fetchImpl }) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!f) throw new Error('fetch недоступен')
  const res = await f(api, {
    method: 'POST',
    body: JSON.stringify(buildSignalReadBody(key, park, signalDate)),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Источник недоступен (${res.status})`)
  const json = await res.json()
  if (!json || json.ok !== true) throw new Error(json?.error || 'Отказ бэка')
  return true
}
