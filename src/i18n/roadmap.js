// i18n словари EN→RU (TEAM_ROADMAP §6) + безопасный перевод + русское склонение.
// Принцип: данные хранятся на английском, переводим только при отрисовке.

export const STATUS_RU = {
  Backlog: 'Бэклог',
  Todo: 'К выполнению',
  'In Progress': 'В работе',
  'In Review': 'На ревью',
  Done: 'Готово',
  Canceled: 'Отменено',
}

export const PRIORITY_RU = {
  0: 'Без приоритета',
  1: 'Срочно',
  2: 'Высокий',
  3: 'Средний',
  4: 'Низкий',
}

export const ESTIMATE_RU = {
  XS: '15–30 минут',
  S: '1–2 часа',
  M: 'полдня',
  L: 'целый день',
  XL: '2–3 дня',
}

export const FIELD_RU = {
  title: 'Заголовок',
  project: 'Проект',
  status: 'Статус',
  priority: 'Приоритет',
  estimate: 'Оценка',
  labels: 'Теги',
  assignee: 'Исполнитель',
  target: 'Ориентир',
  description: 'Описание',
}

// Порядок секций на доске (DESIGN-STANDARD §3.4 + TZ-2 §4).
// Canceled — в конце, скрываем секцию, если пуста.
export const STATUS_ORDER = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done', 'Canceled']

// Маппинг статуса на CSS-токен цвета-точки (значения — из --st-*).
export const STATUS_TOKEN = {
  Backlog: 'var(--st-backlog)',
  Todo: 'var(--st-todo)',
  'In Progress': 'var(--st-progress)',
  'In Review': 'var(--st-review)',
  Done: 'var(--st-done)',
  Canceled: 'var(--st-canceled)',
}

// Безопасный перевод с фолбэком: неизвестное значение не роняет UI.
export const t = (dict, key) => (key != null && dict[key] != null ? dict[key] : String(key))

// Русское склонение для счётчиков:
//   pluralRu(1, ['задача','задачи','задач']) → 'задача'
//   pluralRu(2, ['задача','задачи','задач']) → 'задачи'
//   pluralRu(5, ['задача','задачи','задач']) → 'задач'
export function pluralRu(n, forms) {
  const abs = Math.abs(Number(n) || 0)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1]
  return forms[2]
}

export const TASKS_PLURAL = ['задача', 'задачи', 'задач']
