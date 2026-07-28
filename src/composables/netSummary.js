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
// Единственный импорт из i18n — арифметика дат (чистая, без DOM/локали). Дублировать
// её здесь не стали: цикла нет, i18n/summary.js обратно на этот модуль не смотрит.
import { addDays } from '../i18n/summary.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Срез формы: «YYYY-MM-DD HH:MM» (допускаем и голую дату, и разделитель 'T').
const ASOF_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?$/

// Порядок карточек на экране = порядок каденсов.
export const CADENCES = ['day', 'week', 'month']

// `data_asof` — момент забора формы, из которого посчитаны цифры. В UI НЕ выводим
// (ТЗ v2 §4): это не граница данных, а время сборки — у дня date=24.07 при
// data_asof=25.07 12:28. Поле нужно ТОЛЬКО как тай-брейк при равном date.
// Битое/отсутствующее значение → '' (такая запись считается старшей): payload без
// data_asof отбирается ровно как раньше, по max(date).
export function asofOf(entry) {
  const s = entry && typeof entry === 'object' ? String(entry.data_asof || '').trim() : ''
  return ASOF_RE.test(s) ? s.replace('T', ' ') : ''
}

// Порядок ВОЗРАСТАНИЯ: сперва date, при равенстве — data_asof. Равенство date
// реально: дневные строки копятся, дозаливки одного дня дают несколько записей.
// Обе даты — ISO-строки, лексикографическое сравнение = хронологическое.
function byDateThenAsof(a, b) {
  const da = String(a.date)
  const db = String(b.date)
  if (da !== db) return da < db ? -1 : 1
  const aa = asofOf(a)
  const ab = asofOf(b)
  if (aa !== ab) return aa < ab ? -1 : 1
  return 0 // Array.sort стабилен → при полном равенстве порядок payload сохранён
}

// Валидные записи, отсортированные ПО ВОЗРАСТАНИЮ (date, затем data_asof). Порядок
// в payload не гарантирован. Битые записи (не-объект, чужой cadence, кривая дата)
// отбрасываем — рендер не роняем; незнакомые ключи внутри записи не мешают (ТЗ §4.4).
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
    .sort(byDateThenAsof)
}

// Актуальная запись каденса = max(date) ВНУТРИ каденса, при равенстве — max(data_asof).
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

// ── Лента каденса (ТЗ v2 §3.2) ──
// Все записи каденса, НОВОЕ СВЕРХУ. Обратная хронология сама даёт фокус на
// актуальном — автоскролла нет намеренно.
export function feedOf(sorted, cadence) {
  const out = []
  for (const s of sorted) if (s.cadence === cadence) out.unshift(s)
  return out
}

// ── Месяц записи (v2.2) ──
// День и месячная сводка — по своей дате. Неделя — по ЧЕТВЕРГУ (якорь+3): это
// ISO-правило, и оно же даёт «месяц, в котором лежит большинство дней недели».
// Иначе неделя 29.06–05.07 (пять июльских дней из семи) уехала бы в июнь, хотя в
// мастере она — первая неделя ИЮЛЯ.
export function monthKeyOf(entry) {
  if (!entry || typeof entry !== 'object') return ''
  const iso = String(entry.date || '')
  if (!DATE_RE.test(iso)) return ''
  const anchor = entry.cadence === 'week' ? addDays(iso, 3) : iso
  return anchor.slice(0, 7)
}

// День недели по ISO-дате: Пн=1 … Вс=7 (как dow в dailyModel).
function dowOf(iso) {
  const t = new Date(`${iso}T00:00:00Z`)
  const d = t.getUTCDay()
  return d === 0 ? 7 : d
}

// Номер недели ВНУТРИ месяца — по тем же правилам, что «Контроль Дня» (dailyModel:
// новая неделя начинается в понедельник, первая — та, с которой месяц начался,
// даже если она неполная). Нужен для заголовка «Неделя 3» вместо «Сводка недели».
export function weekIndexOf(entry) {
  if (!entry || typeof entry !== 'object' || entry.cadence !== 'week') return null
  const iso = String(entry.date || '')
  if (!DATE_RE.test(iso)) return null
  const first = `${monthKeyOf(entry)}-01`
  // якорь в прошлом месяце (месяц начался среди недели) → это неделя №1
  if (iso < first) return 1
  const day = Number(iso.slice(8, 10))
  const dow1 = dowOf(first)
  if (dow1 === 1) return Math.floor((day - 1) / 7) + 1
  const firstMonday = 9 - dow1 // число первого понедельника месяца
  return 2 + Math.floor((day - firstMonday) / 7)
}

// Месяцы, по которым есть ХОТЬ ОДНА запись любого каденса. Новые сверху.
export function monthsOf(raw) {
  const seen = new Set()
  for (const s of sortSummaries(raw)) {
    const k = monthKeyOf(s)
    if (k) seen.add(k)
  }
  return [...seen].sort().reverse()
}

// { day: [...], week: [...], month: [...] } — новое сверху в каждом каденсе.
// Каденс без записей присутствует пустым массивом: сегмент показываем всегда,
// внутри пустого — общий пустой стейт раздела.
// `month` ('YYYY-MM') сужает ленты до одного месяца; null — без фильтра.
export function feedByCadence(raw, month = null) {
  const sorted = month
    ? sortSummaries(raw).filter((s) => monthKeyOf(s) === month)
    : sortSummaries(raw)
  const out = {}
  for (const c of CADENCES) out[c] = feedOf(sorted, c)
  return out
}

// Стабильный ключ записи для v-for и карты раскрытия. Дата одна на несколько
// записей, потому в ключ входит и срез, и позиция в ленте.
export function entryKey(cadence, entry, i = 0) {
  const a = asofOf(entry)
  return `${cadence}:${entry && entry.date}${a ? `@${a}` : ''}#${i}`
}

// ── Под-метки внутри блока (v2.6, ЗАДАНИЕ-фронт-рендер-сводок §3.1) ──
// Недельные и месячные блоки выросли до 1–1,5 тыс. знаков и читаются сплошняком.
// Внутри они уже структурны: смысловой кусок открывается короткой фразой с
// двоеточием («Главное:», «Факт недели:», «Охта Молл:»). Это КОНВЕНЦИЯ регламента,
// а не поле контракта, поэтому рендер обязан работать и без под-меток.
//
// Lookbehind из задания (проверка «перед этим была точка с пробелом») НЕ
// используем намеренно: browserslist проекта
// держит iOS ≥15, а Safari выучил lookbehind только в 16.4 — регэксп упал бы при
// разборе бандла и уронил всё приложение. Позиции считаем сканом.
export const SUBLABEL_MAX = 32
// Под-метка: с заглавной, без точек и двоеточий внутри, длиной 3…32 вместе с ней.
const SUB_RE = /^([А-ЯЁA-Z][^.:]{2,31}):\s/u

// [{ label, text }] — под-пункты блока. Под-меток меньше двух → пустой массив:
// блок рендерится сплошным абзацем, как раньше (обратная совместимость с днями и
// со всей исторической лентой).
export function splitSubItems(rest) {
  const s = typeof rest === 'string' ? rest.trim() : ''
  if (!s) return []
  // кандидаты на под-метку: начало текста и позиции сразу после «. »
  const starts = [0]
  const re = /\.\s+/g
  let m
  while ((m = re.exec(s))) starts.push(m.index + m[0].length)

  const hits = []
  for (const at of starts) {
    const mm = SUB_RE.exec(s.slice(at))
    if (mm) hits.push({ at, label: mm[1], from: at + mm[0].length })
  }
  if (hits.length < 2) return []

  const items = []
  const intro = s.slice(0, hits[0].at).trim()
  if (intro) items.push({ label: null, text: intro })
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].at : s.length
    items.push({ label: h.label, text: s.slice(h.from, end).trim() })
  })
  return items
}

// ── Разбивка последнего блока на абзацы (v2.5) ──
// Данные приходят ОДНИМ абзацем (перевод строки ломает пайплайн контура), поэтому
// «Сеть суммарно… / по сети надо…» и финальную директиву разносит РЕНДЕР.
// Порядок предложений не меняем — только вставляем разрывы.

// Предложения по тому же правилу, что метка блока: точка, ЗА которой пробел.
// «Итог месяца (на 23.07)» и «1,01 млн ₽» не рвутся: там за точкой не пробел.
export function splitSentences(text) {
  const s = typeof text === 'string' ? text.trim() : ''
  if (!s) return []
  const out = []
  let start = 0
  const re = /\.\s+/g
  let m
  while ((m = re.exec(s))) {
    out.push(s.slice(start, m.index + 1).trim())
    start = m.index + m[0].length
  }
  const tail = s.slice(start).trim()
  if (tail) out.push(tail)
  // Хвост без букв (эмодзи, «🚀») — не предложение: приклеиваем к предыдущему.
  return out.reduce((acc, x) => {
    if (acc.length && !/[\p{L}]/u.test(x)) acc[acc.length - 1] += ` ${x}`
    else acc.push(x)
    return acc
  }, [])
}

// Предложение с сетевым итогом — то, что владелец просит вынести отдельной строкой.
export const TOTAL_RE = /(по\s+сети\s+надо|сет[иь]\s+суммарно|суммарно\s+по\s+сети)/i

// Блоки записи, где ПОСЛЕДНИЙ («Фокус» / «Вывод») разложен на абзацы:
//   kind: 'text'  — обычный абзац (метка блока остаётся на первом),
//         'total' — строка сетевого итога,
//         'final' — финальная директива, отдельным абзацем.
// Меньше двух предложений — делить нечего, блок остаётся как был.
function splitFocus(last) {
  const sents = splitSentences(last.rest)
  if (sents.length < 2) return [{ ...last, kind: 'text' }]

  const totalIdx = sents.findIndex((x) => TOTAL_RE.test(x))
  const lastIdx = sents.length - 1
  const parts = []
  let cur = null
  sents.forEach((x, i) => {
    // разрыв перед итогом, СРАЗУ ПОСЛЕ него (итог — своя строка, а не начало
    // абзаца) и перед финальной директивой
    if (!cur || i === totalIdx || i === totalIdx + 1 || i === lastIdx) {
      cur = {
        key: `${last.key}-${i}`,
        head: false,
        label: null,
        sep: '.',
        kind: i === totalIdx ? 'total' : i === lastIdx ? 'final' : 'text',
        rest: '',
      }
      parts.push(cur)
    }
    cur.rest = cur.rest ? `${cur.rest} ${x}` : x
  })

  // Метка блока («Фокус на субботу») остаётся у первого абзаца. Если первым идёт
  // сам итог — метку выносим в отдельную строку над ним, иначе итог перестаёт
  // быть отдельной строкой, ради чего всё и делалось.
  if (last.label) {
    if (parts[0].kind === 'total') {
      parts.unshift({ key: `${last.key}-label`, head: false, label: last.label, sep: '.', kind: 'text', rest: '' })
    } else {
      parts[0].label = last.label
    }
  }
  return parts
}

export function focusBlocks(entry) {
  const all = blocksOf(entry)
  if (!all.length) return all
  const parts = splitFocus(all[all.length - 1])
  if (parts.length < 2) return all
  return [...all.slice(0, -1), ...parts]
}

// Итоговый список абзацев карточки (v2.6). Порядок разбора для КАЖДОГО блока:
//   1) есть под-метки (≥2) → метка блока своей строкой + строка на под-пункт;
//   2) иначе последний блок → разбивка «Фокуса» по предложениям (v2.5);
//   3) иначе — блок как есть, одним абзацем.
// kind: 'text' — обычный абзац · 'sub' — под-пункт · 'total' — сетевой итог ·
// 'final' — финальная директива. sep — чем возвращать разделитель метки.
export function renderBlocks(entry) {
  const all = blocksOf(entry)
  if (!all.length) return []
  const out = []
  all.forEach((b, i) => {
    const subs = splitSubItems(b.rest)
    if (subs.length) {
      if (b.label) out.push({ key: `${b.key}-h`, label: b.label, sep: '.', kind: 'text', rest: '' })
      subs.forEach((it, j) => out.push({
        key: `${b.key}-s${j}`,
        label: it.label,
        sep: ':',
        kind: it.label ? 'sub' : 'text',
        rest: it.text,
      }))
      return
    }
    if (i === all.length - 1) {
      out.push(...splitFocus(b))
      return
    }
    out.push({ ...b, sep: '.', kind: 'text' })
  })
  return out
}

// ── Бейдж периода (v2.1) ──
// Статус несёт ЗАЛИВКА бейджа с датой, отдельной цветной точки больше нет.
// Текст на бейдже монохромный (DESIGN-STANDARD §3.5): тёмный ink на светлой
// заливке (жёлтая/зелёная), белый — на насыщенной (красная, серая нейтраль).
// Пары посчитаны по WCAG, все ≥4.5:1 — таблица в отчёте о реализации.
const SUMMARY_INK = {
  ok: 'var(--accent-ink)',    // #1C1B18 на #2F9E54 — 5.04:1
  warn: 'var(--accent-ink)',  // #1C1B18 на #FFC833 — 11.12:1
  focus: 'var(--ink-on-color)', // #FFFFFF на #D92D20 — 4.83:1
}
export function summaryInk(status) {
  return SUMMARY_INK[status] || 'var(--ink-on-color)' // нейтраль #6F6D66 — 5.18:1
}

// Цвет статуса. Шкала та же, что у сигнала (ok|warn|focus), потому переиспользуем
// signalDot: неизвестный статус → нейтраль, рендер не роняем. С v2.1 этот цвет —
// заливка бейджа с датой, а не отдельная точка.
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
// В UI сейчас НЕ используется: бейдж «новое» снят (ТЗ v2 §3.3). Модуль оставлен
// живым под кнопку «Прочитал ✓» следующей фазы — удалять его не надо.
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
