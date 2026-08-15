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

// Лента = все прочие записи, новые сверху. Единственный сигнал → пусто.
export function feedSignals(sorted) {
  return sorted.length > 1 ? sorted.slice(0, -1).reverse() : []
}

// ── Два горизонта (решение владельца 04.08) ──
// SIGNAL_MARKABLE_DAYS — горизонт ДЕЙСТВИЯ: что ещё можно отметить.
// READS_PROJECTION_DAYS (45, Apps Script) — горизонт ЗНАНИЯ: на какую глубину бэк
// отдаёт статус отметки.
//
// ⚠ ИНВАРИАНТ: окно действия обязано лежать СТРОГО ВНУТРИ горизонта знания. Нарушишь —
// фронт предложит отметить день, статус которого не знает, и после смены устройства
// предложит второй раз. Ровно этот дефект чинило D-36. Меняешь одну константу —
// проверь вторую (комментарий продублирован у READS_PROJECTION_DAYS в скрипте).
//
// Почему 14, а не «всё подряд»: отметка меряет скорость реакции парка на сигнал
// (read_at = первое нажатие). Разрешив догонять сигналы месячной давности, метрику
// превращаем из «прочитал вовремя» в «зачёт по посещаемости». 14 дней покрывают
// отпуск и болезнь, но не обнуляют смысл.
export const SIGNAL_MARKABLE_DAYS = 14

// Возраст сигнала в целых календарных днях. Битая дата → null (не отрицательное
// число: «неизвестно» и «из будущего» — разные вещи, и путать их нельзя).
export function signalAgeDays(date, now = new Date()) {
  const s = String(date || '')
  if (!DATE_RE.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const then = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - then) / 86400000)
}

// Можно ли ещё отметить. Сигнал «из будущего» (age < 0) отмечаем — так бывает при
// расхождении часовых поясов устройства и контура, и запрещать это незачем.
export function isMarkable(date, now = new Date(), days = SIGNAL_MARKABLE_DAYS) {
  const age = signalAgeDays(date, now)
  return age !== null && age < days
}

// ── Пул сигналов карточки (Ф-7) ──
// Раньше карточка жила внутри ОДНОГО набора `парк:месяц`, поэтому 01.08 сигнал за
// 31.07 физически исчезал из ленты и становился неотмечаемым — граница месяца рвала
// окно. Теперь пул собирается по всем месяцам парка сразу:
//   • всё, что попадает в окно действия (сквозь границу месяца), — рабочая часть;
//   • плюс весь выбранный в пикере месяц — чтобы архив листался как раньше.
// Дубли по дате схлопываем: один день — одна запись.
export function collectSignals(sets, park, month, now = new Date(), days = SIGNAL_MARKABLE_DAYS) {
  if (!park) return []
  const prefix = `${park}:`
  const all = []
  for (const [key, set] of Object.entries(sets || {})) {
    if (!key.startsWith(prefix) || !set || !Array.isArray(set.signals)) continue
    for (const s of set.signals) all.push(s)
  }
  const seen = new Set()
  const ym = String(month || '')
  return sortSignals(all).filter((s) => {
    if (seen.has(s.date)) return false
    seen.add(s.date)
    return isMarkable(s.date, now, days) || String(s.date).slice(0, 7) === ym
  })
}

// Точка статуса. Цвет — ТОЛЬКО в точке (текст монохромный, DESIGN-STANDARD).
// Неизвестный статус → нейтраль, рендер не роняем (ТЗ §1).
export const SIGNAL_DOT = { ok: 'var(--positive)', warn: 'var(--warning)', focus: 'var(--negative)' }
export function signalDot(status) {
  return SIGNAL_DOT[status] || 'var(--text-muted)'
}
// Лёгкая тонировка плашки под статус (сеть, v3.1): цвет-маркер 12% на surface.
// Текст на плашке остаётся монохромным; цвет несёт статус (color-mix от токенов).
export function signalTint(status) {
  return `color-mix(in srgb, ${signalDot(status)} 12%, var(--surface))`
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

// ── Проекция уже записанных отметок (payload.signal_reads, бэк v3.9 / D-36) ──
// Локальное состояние (localStorage выше) — пер-девайсное и врёт при смене телефона
// или чистке кэша: канон прочтения живёт в листе signal_reads. Бэк отдаёт не лист,
// а КОМПАКТНУЮ проекцию — одну строку на парк, максимум три: {park, signal_date,
// read_at, score}. Фронт сверяет signal_date проекции с датой сигнала, который рисует.
// Пустота приходит как [] (а НЕ отсутствием ключа) — иначе «никто не отметил» не
// отличить от «поле не доехало со старого деплоя», а это и был корень D-36.
export function normalizeReads(raw) {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (r) => r && typeof r === 'object' && String(r.park || '') && DATE_RE.test(String(r.signal_date || '')),
  )
}
// Запись проекции для пары (парк, дата сигнала) либо null. Сравнение строгое по дате:
// отметка вчерашнего сигнала НЕ должна гасить кнопку у сегодняшнего.
export function readFor(reads, park, date) {
  if (!park || !DATE_RE.test(String(date || ''))) return null
  return normalizeReads(reads).find(
    (r) => String(r.park) === String(park) && String(r.signal_date) === String(date),
  ) || null
}
// Дата отметки для подписи кнопки: 'yyyy-MM-dd HH:mm' → 'yyyy-MM-dd'. Битый штамп → ''.
export function readDay(entry) {
  const s = String((entry && entry.read_at) || '')
  return DATE_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : ''
}
// ⚠ ЕДИНСТВЕННОЕ место, где оценка достаётся из записи проекции (NET-62).
// Формула `Number(entry.score)` жила в двух копиях — в кнопке и в стартовом значении
// модалки, — и обе врали: `Number(null)` и `Number('')` дают 0, а `Number.isInteger(0)`
// — true. Пара «прочитал, но не оценил» приходит из проекции как `score: null` и
// рисовалась как оценка «0», то есть как суждение «сигнал бесполезен». Одиннадцать
// дней при зелёной приёмке; управляющий Питерленда услышал на разборе свой ноль за
// 12.08, которого не ставил. Отсюда же попадали настоящие нули в лист: модалка
// открывалась на нуле уже «тронутой», и одно нажатие «Отправить» записывало его.
//
// Копий больше не заводим: и кнопка, и модалка спрашивают ЗДЕСЬ.
// null — это «не оценил», ноль — это оценка. Разница стоила двух недель разбора.
export function scoreOf(entry) {
  if (!entry || typeof entry !== 'object') return null
  return normalizeScore(entry.score)
}

// ── Эхо записанной оценки (NET-61 §2.2) ──
// Проекция `payload.signal_reads` — канон, но она приезжает только со СЛЕДУЮЩЕЙ
// загрузкой payload. Без локального эха экран после отправки не меняется вообще:
// «Показывается, что прочитана, а что я поставила оценку — ничего не меняется.
// Я думала, что не проходит, периодически даже два раза ставила оценку» (разбор
// 14.08). Отсюда и дубли нажатий, и «забываю оценивать».
//
// Пишем сюда ТОЛЬКО подтверждённое бэком значение (score:'added'|'updated') — эхо
// обязано означать «записано», а не «отправлено». Неразличимость этих двух вещей и
// породила проблему; повторять её в новом виде смысла нет.
//
// ⚠ Цена: эхо пер-девайсное. Если ту же пару переоценят с другого устройства,
// здесь останется наше последнее записанное значение, пока проекция не совпадёт с
// ним. Для парка это один телефон, а врать «свежим» числом с чужого устройства
// хуже, чем показать своё последнее.
const ECHO_KEY = 'bc:daily:signal_score_echo'
export function loadScoreEcho() {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(ECHO_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}
export function saveScoreEcho(map) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(ECHO_KEY, JSON.stringify(map || {}))
  } catch {
    /* приватный режим / переполнение — эхо деградирует до сессионного */
  }
}
export function setScoreEcho(map, park, date, score) {
  const next = { ...(map || {}) }
  const s = normalizeScore(score)
  if (s === null) delete next[stateKey(park, date)]
  else next[stateKey(park, date)] = s
  return next
}
export function echoScore(map, park, date) {
  return normalizeScore(map ? map[stateKey(park, date)] : null)
}

// ── Запись прочтения (signal_read) ──
// Тело POST по контракту ТЗ §2 + v3.2: опциональная оценка пользы `score` (0–10,
// целое) из модалки «Оцените пользу Сигнала?». score валидируем здесь и кладём в
// тело ТОЛЬКО валидным — иначе поле опускаем (обратная совместимость: старый бэк
// лишнее поле игнорирует, новый пишет его в лист signal_scores). redirect:'follow',
// без кастомных заголовков — как форма. read-only не нарушаем: пишем только в
// inbox-канал VITE_REPORT_API.
export function normalizeScore(score) {
  // ⚠ Пустое значение НЕ равно нулю. Number(null) и Number('') дают 0 — целое и в
  // диапазоне 0..10, — поэтому без этой проверки «оценки нет» уезжало на бэк как
  // score:0, то есть как суждение «сигнал бесполезен». Отсекаем до приведения типа.
  if (score === null || score === undefined || score === '') return null
  const n = Number(score)
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null
}
export function buildSignalReadBody(key, park, signalDate, score) {
  const body = { key, type: 'signal_read', park, signal_date: signalDate }
  const s = normalizeScore(score)
  if (s !== null) body.score = s
  return body
}
// Отправка. fetchImpl инъектируется в тестах (реального URL в тестах нет, §6).
//
// Возвращает КОНТРАКТ ОТВЕТА целиком: { read, score }.
// Раньше здесь стояло `return true` — поля `read` и `score` выбрасывались молча.
// Бэк с 30.07 честно сообщает, записалась ли оценка (score: 'added'|'updated'|
// 'failed'|'rejected'|null), а фронт рапортовал успех и гасил кнопку навсегда.
// Это молчаливая деградация ровно того класса, который описан в «Граблях» скрипта.
export async function postSignalRead({ api, key, park, signalDate, score, fetchImpl }) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!f) throw new Error('fetch недоступен')
  const res = await f(api, {
    method: 'POST',
    body: JSON.stringify(buildSignalReadBody(key, park, signalDate, score)),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Источник недоступен (${res.status})`)
  const json = await res.json()
  if (!json || json.ok !== true) throw new Error(json?.error || 'Отказ бэка')
  return { read: json.read || 'added', score: json.score ?? null }
}

// ── Очередь отправки (outbox) ──
// Отметка перестаёт быть одноразовым выстрелом. Управляющие работают в ТЦ со рваной
// связью; раньше упавший POST терялся вместе с намерением (postError жил в памяти
// компонента и не переживал перезагрузку). Теперь намерение лежит на устройстве,
// пока бэк его не подтвердит.
//
// Ретраи безопасны БЕЗ правок бэка — это его существующее свойство: appendRead_
// дедуплицирует по (park, signal_date, source) и не трогает read_at, appendScore_
// перезаписывает оценку. Сколько бы раз очередь ни повторила запрос, лишних строк
// не появится, а read_at останется временем первого нажатия.
const OUTBOX_KEY = 'bc:daily:signal_outbox'

// Ошибки, при которых повторять бессмысленно: тело запроса не станет валиднее само.
// Без этого списка очередь уходит в вечную петлю — например, doPost сверяет park с
// whitelist БЕЗ нормализации, и 'Ohta' даст 'bad park' на любой попытке.
const PERMANENT = ['bad key', 'bad park', 'bad date', 'unauthorized']
export function isPermanentError(msg) {
  const s = String(msg || '').toLowerCase()
  return PERMANENT.some((p) => s.includes(p))
}
// Бэкофф между попытками; дальше — раз в открытие приложения.
export function backoffMs(attempts) {
  return [2000, 10000, 60000][Math.min(Math.max(attempts - 1, 0), 2)]
}

export function loadOutbox() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((i) => i && typeof i === 'object' && i.park && DATE_RE.test(String(i.signal_date || ''))) : []
  } catch {
    return []
  }
}
export function saveOutbox(list) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(Array.isArray(list) ? list : []))
  } catch {
    /* приватный режим / переполнение — очередь деградирует до одноразовой отправки */
  }
}
export function findItem(list, park, date) {
  return (list || []).find((i) => i.park === park && i.signal_date === date) || null
}
// Постановка в очередь. Повторное нажатие ОБНОВЛЯЕТ элемент, а не плодит новые:
// ключ — пара (парк, дата сигнала), ровно как ключ дедупликации на бэке.
// score === undefined означает «не трогать оценку» (кнопка «Прочитано» без модалки).
export function enqueueRead(list, { park, signal_date, score }) {
  const out = (list || []).slice()
  const at = out.findIndex((i) => i.park === park && i.signal_date === signal_date)
  const prev = at >= 0 ? out[at] : null
  const item = {
    park,
    signal_date,
    score: score === undefined ? (prev ? prev.score : null) : normalizeScore(score),
    created_at: prev ? prev.created_at : new Date().toISOString(),
    attempts: 0,          // сбрасываем: пользователь нажал заново, ждать бэкофф незачем
    last_error: '',
    dead: false,
    read_ok: prev ? !!prev.read_ok : false,
  }
  if (at >= 0) out[at] = item
  else out.push(item)
  return out
}
export function dropItem(list, park, date) {
  return (list || []).filter((i) => !(i.park === park && i.signal_date === date))
}

// Разбор ответа бэка → что делать с элементом очереди.
// 'done'   — всё записано, элемент убрать;
// 'retry'  — половина не доехала, оставить и повторить;
// 'dead'   — повторять бессмысленно, показать человеку.
export function resolveItem(item, res) {
  const sentScore = item.score !== null && item.score !== undefined
  if (!sentScore) return { action: 'done' }
  if (res.score === 'added' || res.score === 'updated') return { action: 'done' }
  // 'rejected' — оценка не пройдёт валидацию и на второй попытке. Прочтение при этом
  // записано, поэтому долг снимаем, но честно говорим, что оценки нет.
  if (res.score === 'rejected') return { action: 'dead', error: 'оценка отклонена' }
  // 'failed' | null — прочтение доехало, оценка нет. Досылаем только её.
  return { action: 'retry', error: 'оценка не сохранилась', readOk: true }
}
