// Чистая модель раздела «Драйверы роста»: join периодов к драйверам, фильтр
// парк+статус, сортировка, счётчики чипов. Без Vue/DOM — тестируется отдельно
// (по образцу dailyModel.js / netSummary.js). Источник данных — верхнеуровневые
// payload.drivers + payload.driver_periods из дневного пейлоада.

import { STATUS_ORDER, STATUS_FILTER_ORDER, DRIVER_PARK_ORDER } from '../i18n/drivers.js'

const RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]))

// ── ОХВАТ vs ЗАПУСК (NET-33, задание 07.08) ─────────────────────────────────
// До 07.08 парки драйвера выводились ИСКЛЮЧИТЕЛЬНО из периодов, а период по
// регламенту контура B означает ФАКТ ЗАПУСКА. Цепочка: драйвер не запущен →
// периодов нет → парков нет → в карточке парка драйвера не существует. Так из
// раздела выпадали шесть драйверов из тринадцати, и это читалось как потеря данных.
//
// Теперь у драйвера ДВА разных множества парков, и путать их нельзя:
//   • `parks`       — где ВКЛЮЧЁН по факту (собирается контуром B из периодов);
//   • `scope_parks` — где ПРИМЕНИМ по паспорту (`охват:`; «сеть» контур B сам
//                     разворачивает в три действующих парка, MARI в неё не входит).
// Фильтр по парку идёт по ОХВАТУ, деление на группы внутри — по ЗАПУСКУ.
//
// Формат в payload — массив ключей. Строка через «;» принимается тоже: пока в бою
// Apps Script до v3.17, полей нет вовсе, а после — они массивы; строковая ветка
// оставлена как страховка от ручной правки листа, где столбец собран из ячейки.
export function toKeys(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean)
  const s = String(v ?? '').trim()
  if (!s) return []
  return s.split(/[;,]/).map((x) => x.trim()).filter(Boolean)
}

// Где драйвер ПРИМЕНИМ. Пусто (старый payload / поле не доехало) → фолбэк на факт
// запуска: раздел тогда работает ровно как до NET-33, а не прячет всё подряд.
export function scopeParks(d) {
  const s = toKeys(d && d.scope_parks)
  return s.length ? s : parkList(d)
}

// Где драйвер ВКЛЮЧЁН. Поле `parks` не мапилось Apps Script с самого появления
// раздела, поэтому фолбэк на периоды обязателен — иначе на боевом payload до
// v3.17 «работают» стало бы ноль у всех парков.
export function parkList(d) {
  const p = toKeys(d && d.parks)
  if (p.length) return p
  return [...new Set((d && d.periods ? d.periods : []).map((x) => x && x.park).filter(Boolean))]
}

// Работает ли драйвер в парке (в отличие от «применим в парке»).
export const runsIn = (d, park) => parkList(d).includes(park)
// Применим ли драйвер к парку (включая уже работающие).
export const appliesTo = (d, park) => scopeParks(d).includes(park)

// «Запущен» = есть хотя бы один период по парку (карточка так решает «не запущен ни
// в одном парке»). НЕ завязано на имя статуса — устойчиво к словарю контура B.
export const isLaunched = (d) => !!(d && Array.isArray(d.periods) && d.periods.length > 0)

// Периоды по паркам присоединяем к драйверу по code (контракт — плоский массив,
// связь через code, а не вложенность).
export function joinDrivers(drivers, periods) {
  const byCode = {}
  for (const p of Array.isArray(periods) ? periods : []) {
    if (!p || !p.code) continue
    ;(byCode[p.code] || (byCode[p.code] = [])).push(p)
  }
  return (Array.isArray(drivers) ? drivers : [])
    .filter((d) => d && d.code)
    .map((d) => ({ ...d, periods: byCode[d.code] || [] }))
}

// Опции чипа «Парк» — ФИКСИРОВАННЫЕ три действующих СПб (§0.1 п.2). НЕ из данных и
// НЕ из глобального parks.js: MARI исключён совсем, а не «подхватится». Показываем
// все три всегда (как песочница), даже если у парка сейчас 0 драйверов.
export function parkOptions() {
  return DRIVER_PARK_ORDER.slice()
}

// Проходит ли драйвер текущие фильтры. fStatus/fPark === 'all' → без ограничения.
//
// ⚠ ПРАВИЛО ИЗМЕНЕНО 07.08 (NET-33). Было: выбран парк → только драйверы с ПЕРИОДОМ
// в нём, незапущенные видны лишь во «Всей сети». Из-за этого на вопрос «что мне ещё
// предстоит в Питерленде» раздел отвечал молчанием. Стало: выбран парк → драйверы,
// применимые к парку (`scope_parks`), то есть и работающие, и предстоящие. Деление
// на две группы делает splitByRun — оно и отвечает «работает или ещё нет».
export function matches(d, fPark, fStatus) {
  if (fStatus !== 'all' && d.status !== fStatus) return false
  if (fPark !== 'all') return appliesTo(d, fPark)
  return true
}

// Две группы внутри выбранного парка (§2.3 задания 07.08), в этом порядке:
//   running    — парк есть в `parks` (работает по факту);
//   applicable — парк есть в `scope_parks`, но нет в `parks` («что мне предстоит»).
// Вторая группа — НЕ ошибка и не «скоро будет»: это ответ на вопрос владельца,
// который до 07.08 было негде задать. Под «Всей сетью» деление смысла не имеет
// (применим — где?), поэтому там остаётся группировка по статусу.
export function splitByRun(list, park) {
  const running = [], applicable = []
  for (const d of list || []) (runsIn(d, park) ? running : applicable).push(d)
  return { running: sortDrivers(running), applicable: sortDrivers(applicable) }
}

// Сортировка: по статусу (идёт→пауза→готов→разработка→backlog→закрыт), внутри — по коду.
export function sortDrivers(list) {
  return [...list].sort(
    (a, b) =>
      (RANK[a.status] ?? 99) - (RANK[b.status] ?? 99) ||
      String(a.code).localeCompare(String(b.code)),
  )
}

// Отфильтрованный + отсортированный список для рендера.
export function visibleDrivers(joined, fPark, fStatus) {
  return sortDrivers(joined.filter((d) => matches(d, fPark, fStatus)))
}

// Счётчики чипа «Парк» — по ОХВАТУ (то же правило, что у matches: чип и список
// обязаны отвечать одинаково, иначе «3» на чипе откроет список из шести).
// 'all' — все драйверы.
export function parkCounts(joined, parkIds) {
  const c = { all: joined.length }
  for (const id of parkIds) c[id] = joined.filter((d) => appliesTo(d, id)).length
  return c
}

// Счётчики чипа «Статус» — по ВСЕМ статусам, реально присутствующим в данных
// (включая незнакомые словарю), чтобы ни один статус не потерялся из фильтра.
export function statusCounts(joined) {
  const c = { all: joined.length }
  for (const d of joined) {
    const s = d.status || ''
    if (!s) continue
    c[s] = (c[s] || 0) + 1
  }
  return c
}

// Опции чипа «Статус» — статусы, реально встречающиеся в данных. Известные (по
// STATUS_FILTER_ORDER) идут в заданном порядке, любые неожиданные значения контура B
// добавляются в хвост по алфавиту. Пустой статус игнорируем.
export function statusOptions(joined) {
  const present = new Set()
  for (const d of joined) if (d.status) present.add(d.status)
  const known = STATUS_FILTER_ORDER.filter((s) => present.has(s))
  const extra = [...present].filter((s) => !STATUS_FILTER_ORDER.includes(s)).sort()
  return [...known, ...extra]
}
