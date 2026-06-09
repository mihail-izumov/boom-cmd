// i18n для раздела «Проекты».
// Принцип: данные на английском (status — EN-enum), UI по-русски.
// Направления (`directions`) — свободный пользовательский вокабуляр на русском прямо в данных,
// словаря для них нет (см. PRODUCT-PRINCIPLES §5, TZ-2-Projects §2/§9).

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

// Справочник парков сети (PRODUCT-PRINCIPLES §2).
export const PARK_RU = {
  mari: 'MARI',
  ohta: 'Охта',
  piterland: 'Питерленд',
  iyun: 'Июнь',
}

// Порядок групп: актуальное сверху (TZ-2-Projects §4).
export const STATUS_ORDER = ['In Progress', 'Planned', 'Backlog', 'Done']

// Дефолт-сворачивание по статусу: true = развёрнуто.
export const STATUS_DEFAULT_OPEN = {
  'In Progress': true,
  Planned: true,
  Backlog: false,
  Done: false,
}

// Сортировка проектов внутри группы (по решению владельца):
// Urgent(1) → High(2) → Medium(3) → Low(4) → None(0) в конце; при равенстве — порядок мока.
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
export const PARKS_PLURAL = ['парк', 'парка', 'парков']

// Подпись парк-бейджа по правилу владельца:
//   "all"      → 'Вся сеть'
//   [a]        → имя парка
//   [a, b]     → 'MARI · Охта'
//   [a, b, c+] → '3 парка(а/ов)'
// Возвращает null, если бейдж не нужен показывать на карточке (parks === 'all').
export function parkLabelForCard(parks) {
  if (!parks || parks === 'all') return null
  if (!Array.isArray(parks) || parks.length === 0) return null
  if (parks.length === 1) return t(PARK_RU, parks[0])
  if (parks.length === 2) return `${t(PARK_RU, parks[0])} · ${t(PARK_RU, parks[1])}`
  return `${parks.length} ${pluralRu(parks.length, PARKS_PLURAL)}`
}

// Полная подпись парков для модалки (включая «Вся сеть»).
export function parkLabelForDetail(parks) {
  if (!parks || parks === 'all') return 'Вся сеть'
  if (!Array.isArray(parks) || parks.length === 0) return 'Вся сеть'
  return parks.map((id) => t(PARK_RU, id)).join(' · ')
}
