// Единый справочник парков сети (PRODUCT-PRINCIPLES §2).
// Имена парков живут ТОЛЬКО здесь — i18n, ParkBadge, селектор и Home берут отсюда.
//
//   name    — полное имя (Home, chooser, детали проекта).
//   short   — сокращение для парк-бейджа на узких карточках (short || name).
//   city    — для группировки в chooser и подписи в Home.
//   enabled — флаг отображения в UI (пилюля парка, chooser). По умолчанию true.
//             Парк, который пока не открыт (Июнь — на запуске), остаётся в
//             архитектуре, но не показывается в выборе до открытия. PARKS_BY_ID
//             включает его — id может встречаться в данных/моках; UI же ходит
//             через PARKS_VISIBLE / PARKS_VISIBLE_BY_CITY.

export const PARKS = [
  { id: 'mari',      name: 'MARI',      short: 'MARI',      city: 'Москва',           enabled: true  },
  { id: 'ohta',      name: 'Охта Молл', short: 'Охта',      city: 'Санкт-Петербург',  enabled: true  },
  { id: 'piterland', name: 'Питерленд', short: 'Питерленд', city: 'Санкт-Петербург',  enabled: true  },
  { id: 'iyun',      name: 'Июнь',      short: 'Июнь',      city: 'Санкт-Петербург',  enabled: true  },
]

export const PARKS_BY_ID = Object.fromEntries(PARKS.map((p) => [p.id, p]))

// Видимые в UI парки — chooser / пилюля показывают только их (TZ-Аналитика,
// ответ владельца). Закрытые (enabled:false) живут в справочнике для данных
// и будущего открытия — без правки кода.
export const PARKS_VISIBLE = PARKS.filter((p) => p.enabled !== false)

export const PARKS_BY_CITY = PARKS.reduce((acc, p) => {
  if (!acc[p.city]) acc[p.city] = []
  acc[p.city].push(p)
  return acc
}, {})

export const PARKS_VISIBLE_BY_CITY = PARKS_VISIBLE.reduce((acc, p) => {
  if (!acc[p.city]) acc[p.city] = []
  acc[p.city].push(p)
  return acc
}, {})

// Стабильный порядок городов в chooser-е.
export const CITY_ORDER = ['Москва', 'Санкт-Петербург']
