// Единый справочник парков сети (PRODUCT-PRINCIPLES §2).
// Имена парков живут ТОЛЬКО здесь — i18n, ParkBadge, селектор и Home берут отсюда.
//
//   name  — полное имя (Home, chooser, детали проекта).
//   short — сокращение для парк-бейджа на узких карточках (short || name).
//   city  — для группировки в chooser и подписи в Home.

export const PARKS = [
  { id: 'mari',      name: 'MARI',      short: 'MARI',      city: 'Москва' },
  { id: 'ohta',      name: 'Охта Молл', short: 'Охта',      city: 'Санкт-Петербург' },
  { id: 'piterland', name: 'Питерленд', short: 'Питерленд', city: 'Санкт-Петербург' },
  { id: 'iyun',      name: 'Июнь',      short: 'Июнь',      city: 'Санкт-Петербург' },
]

export const PARKS_BY_ID = Object.fromEntries(PARKS.map((p) => [p.id, p]))

export const PARKS_BY_CITY = PARKS.reduce((acc, p) => {
  if (!acc[p.city]) acc[p.city] = []
  acc[p.city].push(p)
  return acc
}, {})

// Стабильный порядок городов в chooser-е.
export const CITY_ORDER = ['Москва', 'Санкт-Петербург']
