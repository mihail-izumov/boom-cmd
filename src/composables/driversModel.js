// Чистая модель раздела «Драйверы роста»: join периодов к драйверам, фильтр
// парк+статус, сортировка, счётчики чипов. Без Vue/DOM — тестируется отдельно
// (по образцу dailyModel.js / netSummary.js). Источник данных — верхнеуровневые
// payload.drivers + payload.driver_periods из дневного пейлоада.

import { PARKS_BY_ID } from '../data/parks.js'
import { STATUS_ORDER, DRIVER_PARK_ORDER, isActive } from '../i18n/drivers.js'

const RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]))

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

// Опции чипа «Парк» — из данных: только парки, реально встречающиеся в периодах.
// Порядок — DRIVER_PARK_ORDER (MARI в хвосте), затем любые неизвестные id из данных.
// Так MARI и будущие парки подхватятся без правки кода.
export function parkOptions(joined) {
  const present = new Set()
  for (const d of joined) for (const p of d.periods) if (p.park) present.add(p.park)
  const ordered = DRIVER_PARK_ORDER.filter((id) => present.has(id))
  const extra = [...present].filter((id) => !DRIVER_PARK_ORDER.includes(id)).sort()
  return [...ordered, ...extra].filter((id) => PARKS_BY_ID[id] || true)
}

// Проходит ли драйвер текущие фильтры. fPark/fStatus === 'all' → без ограничения.
// Активные — по подключённым паркам; незапущенные — видны при любом выборе парка.
export function matches(d, fPark, fStatus) {
  if (fStatus !== 'all' && d.status !== fStatus) return false
  if (fPark !== 'all') {
    if (isActive(d.status)) return d.periods.some((p) => p.park === fPark)
    return true
  }
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

// Счётчики чипа «Парк». Активные — считаются по подключённому парку; незапущенные
// попадают в счётчик КАЖДОГО парка (они потенциально сетевые). 'all' — всего.
export function parkCounts(joined, parkIds) {
  const c = { all: joined.length }
  for (const id of parkIds) {
    c[id] = joined.filter((d) => (isActive(d.status) ? d.periods.some((p) => p.park === id) : true)).length
  }
  return c
}

// Счётчики чипа «Статус». Чип показываем только если счётчик > 0 (см. секцию).
export function statusCounts(joined) {
  const c = { all: joined.length }
  for (const s of STATUS_ORDER) c[s] = joined.filter((d) => d.status === s).length
  return c
}
