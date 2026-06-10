// i18n для раздела «Проекты».
// Принцип: данные на английском (status — EN-enum), UI по-русски.
// Направления (`directions`) — свободный пользовательский вокабуляр на русском
// прямо в данных, словаря для них нет (см. PRODUCT-PRINCIPLES §5).
// Имена парков — единый источник в `src/data/parks.js`; PARK_RU / PARK_SHORT
// строятся отсюда, чтобы не было двух правд.
//
// TZ-3.3 §2: парк-бейджей на карточках больше нет — scope задаёт сам фильтр.
// Поэтому `parkLabelForCard` удалён. Остался `parkLabelForDetail` — для
// текст-поля «Парки» в `ProjectDetail`.

import { PARKS } from '../data/parks.js'

export const STATUS_RU = {
  Backlog: 'Бэклог',
  Planned: 'Запланировано',
  'In Progress': 'В работе',
  Done: 'Готово',
}

export const PRIORITY_RU = {
  0: 'Без приоритета',
  1: 'Срочно',
  2: 'Высокий',
  3: 'Средний',
  4: 'Низкий',
}

// Поля проекта в модалке.
export const FIELD_RU = {
  status: 'Статус',
  priority: 'Приоритет',
  directions: 'Направления',
  parks: 'Парки',
  target: 'Ориентир',
  description: 'Описание',
  items: 'Задачи и вехи',
}

// Производные словари из единого справочника парков.
export const PARK_RU = Object.fromEntries(PARKS.map((p) => [p.id, p.name]))
export const PARK_SHORT = Object.fromEntries(PARKS.map((p) => [p.id, p.short || p.name]))

// Порядок групп проектов: актуальное сверху.
export const STATUS_ORDER = ['In Progress', 'Planned', 'Backlog', 'Done']

// Дефолт-сворачивание по статусу: true = развёрнуто.
export const STATUS_DEFAULT_OPEN = {
  'In Progress': true,
  Planned: true,
  Backlog: false,
  Done: false,
}

// Сортировка проектов внутри группы:
// Urgent(1) → High(2) → Medium(3) → Low(4) → None(0) в конце;
// при равенстве — порядок мока.
const PRIORITY_RANK = { 1: 0, 2: 1, 3: 2, 4: 3, 0: 4 }
export function priorityRank(p) {
  return PRIORITY_RANK[p] ?? 5
}

// Безопасный перевод с фолбэком — неизвестное значение не роняет UI.
export const t = (dict, key) => (key != null && dict[key] != null ? dict[key] : String(key))

// Русское склонение для счётчиков.
export function pluralRu(n, forms) {
  const abs = Math.abs(Number(n) || 0)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export const TASKS_PLURAL = ['задача', 'задачи', 'задач']
export const PROJECTS_PLURAL = ['проект', 'проекта', 'проектов']

// Подпись поля «Парки» в модалке проекта (TZ-3.3 §2):
//   'network' (или undefined/неизвестное) → 'Вся сеть'
//   [a]            → полное имя парка
//   [a, b, c, ...] → имена через ' · '
export function parkLabelForDetail(parks) {
  if (!parks || parks === 'network' || parks === 'all') return 'Вся сеть'
  if (!Array.isArray(parks) || parks.length === 0) return 'Вся сеть'
  return parks.map((id) => t(PARK_RU, id)).join(' · ')
}
