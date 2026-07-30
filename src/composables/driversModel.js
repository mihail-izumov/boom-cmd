// Чистая модель раздела «Драйверы роста»: join периодов к драйверам, фильтр
// парк+статус, сортировка, счётчики чипов. Без Vue/DOM — тестируется отдельно
// (по образцу dailyModel.js / netSummary.js). Источник данных — верхнеуровневые
// payload.drivers + payload.driver_periods из дневного пейлоада.

import { STATUS_ORDER, STATUS_FILTER_ORDER, DRIVER_PARK_ORDER } from '../i18n/drivers.js'

const RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]))

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
// §0.1 п.1/п.4: выбран ПАРК → только драйверы с периодом в этом парке. Незапущенные
// (нет периодов) видны ТОЛЬКО во «Всей сети» (fPark==='all'), не под конкретным парком.
export function matches(d, fPark, fStatus) {
  if (fStatus !== 'all' && d.status !== fStatus) return false
  if (fPark !== 'all') return (d.periods || []).some((p) => p.park === fPark)
  return true
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

// Счётчики чипа «Парк» — драйверы с периодом в этом парке (§0.1 п.1: без «утечки»
// незапущенных под каждый парк). 'all' — все драйверы (в т.ч. незапущенные).
export function parkCounts(joined, parkIds) {
  const c = { all: joined.length }
  for (const id of parkIds) {
    c[id] = joined.filter((d) => (d.periods || []).some((p) => p.park === id)).length
  }
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
