// signalComments.js — комментарий управляющей к «Сигналу Дня» (NET-235, D-188).
// ЧИСТЫЙ JS: на верхнем уровне нет vue и DOM, всё проверяется в node без jsdom.
// Доступ к localStorage и fetch — только внутри функций и под guard'ами, и только через
// `window.*` (голые браузерные объекты в этом проекте дважды уходили в catch молча).
//
// ЗАЧЕМ. С 16.10 «Отчёт Дня» за все три парка сдаёт Екатерина (D-182), а написать о дне
// можно было только при сдаче отчёта. Последний комментарий в отчётах — 27.09: контур не
// знает, что происходит в залах. Управляющие каждый день открывают «Сигнал Дня» своего
// парка и ставят ему оценку — поле поставлено туда.
//
// ЧЕМ ОТЛИЧАЕТСЯ ОТ ОТМЕТКИ. Отметка — событие «прочитал», у неё очередь, ретраи и
// дедупликация по паре (парк, дата). Комментарий — сообщение: каждое «Отправить» —
// отдельная строка на бэке, повтор — это второе сообщение, а не дубль. Поэтому очереди
// и автоповторов здесь нет намеренно: повтор после потерянного ответа записал бы то же
// самое дважды. Не ушло — текст остаётся в поле, человек жмёт ещё раз сам (§А.4 задания).
//
// Тело запроса — новый вид `signal_comment`, `signal_read` не тронут:
//   { key, action:'signal_comment', park, signal_date, comment, source:'front' }
// `source` бэк всё равно ставит сам (правило v3.9), в теле он — для читателя контракта.

import { failure, fetchWithTimeout, transportFailure, isRetriableStatus } from './netPolicy.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Лимит — тот же, что COMMENT_MAX в скрипте приёма. Поле не даёт набрать больше
// (maxlength), бэк страхует и обрезает, а не отклоняет.
export const COMMENT_MAX = 1000
// Сколько отправленных показывать под полем (§А.3: «последние три за этот сигнал»).
export const COMMENT_LOG_MAX = 3
// Счётчик знаков появляется у края лимита: на коротком тексте он только шумит, а у
// края объясняет, почему поле перестало принимать буквы.
export const COMMENT_COUNTER_FROM = 900

/** Текст как он уйдёт: \r\n → \n, края без пробелов и пустых строк, середина как есть. */
export function normalizeComment(text) {
  return String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim()
}

/** То же, что сделает бэк: не длиннее COMMENT_MAX и без половинки эмодзи на разрезе. */
export function clipComment(text) {
  let s = normalizeComment(text)
  if (s.length <= COMMENT_MAX) return s
  s = s.slice(0, COMMENT_MAX)
  const last = s.charCodeAt(s.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1)
  return s.replace(/\s+$/, '')
}

/** Можно ли нажать «Отправить»: пустое поле или одни пробелы — нельзя (§А.4). */
export function canSendComment(text, sending = false) {
  return !sending && normalizeComment(text).length > 0
}

export function buildSignalCommentBody(key, park, signalDate, comment) {
  return {
    key,
    action: 'signal_comment',
    park,
    signal_date: signalDate,
    comment: clipComment(comment),
    source: 'front',
  }
}

/**
 * Одна попытка отправки. Бросает Error с полем `retriable` (как netPolicy): транспортная
 * осечка — true (экран подскажет про VPN), осознанный отказ бэка — false.
 * Возврат: { msk, truncated } — `msk` это 'yyyy-MM-dd HH:mm:ss' МСК от бэка или ''.
 * fetchImpl инъектируется в приёмке; без него — общий fetch с потолком ожидания.
 */
export async function postSignalComment({ api, key, park, signalDate, comment, fetchImpl }) {
  const body = JSON.stringify(buildSignalCommentBody(key, park, signalDate, comment))
  // Без Content-Type: «простой» запрос без CORS-preflight (Apps Script не отвечает на
  // OPTIONS), redirect:'follow' — /exec отвечает 302 на googleusercontent. Как у отчёта.
  const init = { method: 'POST', body, redirect: 'follow' }
  let res
  try {
    res = fetchImpl ? await fetchImpl(api, init) : await fetchWithTimeout(api, init)
  } catch (e) {
    throw transportFailure(e)
  }
  if (!res.ok) throw failure(`Источник недоступен (${res.status})`, isRetriableStatus(res.status))
  let json
  try {
    json = await res.json()
  } catch {
    throw failure('Ответ не разобран', true)
  }
  if (!json || json.ok !== true) throw failure(json?.error || 'Отказ бэка', false)
  return {
    msk: typeof json.commented_msk === 'string' ? json.commented_msk : '',
    truncated: !!json.truncated,
  }
}

// ── Подпись «Отправлено ЧЧ:ММ» ───────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
function localDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/**
 * Запись журнала из ответа бэка. Время — то, что ЗАПИСАЛ бэк (МСК), а не часы телефона:
 * ровно так расхождение на час у отчёта и было бы поймано за день, а не за две недели.
 * Бэк времени не вернул (dev-имитация) — тогда часы устройства, честнее, чем ничего.
 */
export function sentEntry(text, msk, now = new Date()) {
  const ok = typeof msk === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(msk)
  return {
    day: ok ? msk.slice(0, 10) : localDay(now),
    time: ok ? msk.slice(11, 16) : `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    text: clipComment(text),
    ts: now.getTime(),
  }
}

/** «Отправлено 14:32» за сегодня; за прошлые дни — с датой, иначе время читается как сегодняшнее. */
export function sentLabel(entry, now = new Date(), word = 'Отправлено') {
  if (!entry || !entry.time) return word
  if (!entry.day || entry.day === localDay(now)) return `${word} ${entry.time}`
  const [, m, d] = entry.day.split('-')
  return `${word} ${d}.${m}, ${entry.time}`
}

// ── Хранилища на устройстве ─────────────────────────────────────────────────
// Журнал отправленного (последние три на пару парк:дата) и черновик поля. Это удобство
// этого телефона, а не данные: канон — лист signal_comments на бэке. Черновик нужен,
// чтобы набранное не пропадало, если ушёл на экран входа или телефон выгрузил вкладку.
const LOG_KEY = 'bc:daily:signal_comments_sent'
const DRAFT_KEY = 'bc:daily:signal_comment_draft'
// Пар парк:дата храним не больше, чем нужно для «этот сигнал» с запасом.
const KEEP_KEYS = 20

export const commentKey = (park, date) => `${park}:${date}`

function storage() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}
function readMap(name) {
  try {
    const ls = storage()
    if (!ls) return {}
    const obj = JSON.parse(ls.getItem(name) || '{}')
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  } catch {
    return {}
  }
}
// Обрезка по дате в ключе: самые старые пары уходят первыми.
function prune(map) {
  const keys = Object.keys(map)
  if (keys.length <= KEEP_KEYS) return map
  const byDate = keys.sort((a, b) => (a.slice(-10) < b.slice(-10) ? 1 : a.slice(-10) > b.slice(-10) ? -1 : 0))
  const out = {}
  byDate.slice(0, KEEP_KEYS).forEach((k) => { out[k] = map[k] })
  return out
}
function writeMap(name, map) {
  try {
    const ls = storage()
    if (ls) ls.setItem(name, JSON.stringify(prune(map || {})))
  } catch {
    /* приватный режим / переполнение — журнал деградирует до сессионного */
  }
}

export function loadCommentLog() { return readMap(LOG_KEY) }
export function saveCommentLog(map) { writeMap(LOG_KEY, map) }

/** Новая запись сверху, хвост дальше третьей отрезается. Возвращает НОВУЮ карту. */
export function pushCommentLog(map, park, date, entry) {
  const k = commentKey(park, date)
  const prev = Array.isArray(map && map[k]) ? map[k] : []
  return { ...(map || {}), [k]: [entry, ...prev].slice(0, COMMENT_LOG_MAX) }
}

/** Отправленные по паре, новые сверху, только валидные записи. */
export function commentsFor(map, park, date) {
  if (!park || !DATE_RE.test(String(date || ''))) return []
  const list = map ? map[commentKey(park, date)] : null
  return Array.isArray(list)
    ? list.filter((e) => e && typeof e === 'object' && typeof e.text === 'string' && e.text).slice(0, COMMENT_LOG_MAX)
    : []
}

export function loadDraft(park, date) {
  const v = readMap(DRAFT_KEY)[commentKey(park, date)]
  return typeof v === 'string' ? v : ''
}
export function saveDraft(park, date, text) {
  const map = readMap(DRAFT_KEY)
  const k = commentKey(park, date)
  if (normalizeComment(text)) map[k] = String(text)
  else delete map[k]
  writeMap(DRAFT_KEY, map)
}
export function clearDraft(park, date) { saveDraft(park, date, '') }
