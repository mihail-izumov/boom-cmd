// i18n и палитра раздела «Драйверы роста» (под-страница дашборда).
// Принцип DESIGN-STANDARD §3.4–3.6: цвет — ТОЛЬКО в заливке статус-бейджа,
// текст всегда монохромный (var(--text)); все цвета — из токенов main.css,
// хардкод hex запрещён. Раздел отвечает на «что подключено и что готовится»,
// НЕ на «что сработало» — метрику/результат не показываем.
//
// Данные приходят из дневного пейлоада (?action=daily): payload.drivers +
// payload.driver_periods (см. useDaily.normalize). Статус — русский enum из
// контура B (backlog — единственный латинский), type — латинский код с переводом.

import { PARKS_BY_ID } from '../data/parks.js'
import { pluralRu } from './projects.js'

// ── Порядок сортировки карточек (актуальное сверху). «черновик» — реальный статус
//    из контура B (наблюдался в проде), стоит в группе «готовится/в очереди». ──
export const STATUS_ORDER = ['идёт', 'пауза', 'готов', 'разработка', 'черновик', 'backlog', 'закрыт']

// Порядок чипов фильтра статуса: активные → готовящиеся → завершённые. Реальный
// список чипов строится ИЗ ДАННЫХ (driversModel.statusOptions) — известные по этому
// порядку, любые неожиданные значения контура B добавляются в хвост. Так фронт не
// теряет статус, которого нет в этом списке (баг «не все статусы»: словарь прода
// разошёлся с зашитым — был только backlog/разработка, а пришёл «черновик»).
export const STATUS_FILTER_ORDER = ['идёт', 'готов', 'разработка', 'черновик', 'backlog', 'пауза', 'закрыт']

// «Запущен» ли драйвер — определяется НАЛИЧИЕМ периодов по паркам, а не именем
// статуса (driversModel.isLaunched). Так фильтр по парку устойчив к смене словаря
// статусов на стороне контура B: запущенные фильтруются по подключённым паркам,
// незапущенные видны при ЛЮБОМ выборе парка.

// Подписи статусов на чипах (данные — уже по-русски, здесь только регистр/показ).
export const STATUS_LABEL = {
  'идёт': 'Идёт',
  'готов': 'Готов',
  'разработка': 'Разработка',
  'черновик': 'Черновик',
  'backlog': 'Backlog',
  'пауза': 'Пауза',
  'закрыт': 'Закрыт',
}

// Подпись статуса с фолбэком: известный → из словаря; неизвестный (новый статус
// контура B) → как есть с большой буквы, чтобы чип всё равно отрисовался.
export function statusLabel(status) {
  if (STATUS_LABEL[status]) return STATUS_LABEL[status]
  const s = String(status || '')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// ── Статус-бейдж: цвет = сигнал, ЗАЛИВКА мягким тоном через color-mix, текст
//    монохромный. Идиома color-mix — как signalTint в dailySignals.js.
//    Токены сверены по src/styles/main.css §3.6:
//      --positive #2F9E54 · --warning #FFC833 · --info #2563EB · --st-backlog #8A8880 ·
//      --st-todo #6F6D66 · --text-muted #6F6D66.
//    Пауза/закрыт — НЕЙТРАЛИ (оранжевый/фиолетовый убраны по решению владельца):
//      пауза — нейтраль + пунктирная рамка (сигнал «временно выключено»);
//      закрыт — нейтраль темнее backlog (базовый токен темнее → тон читается глубже).
//    Красный (--negative) НЕ используем — он зарезервирован под Urgent.
export const STATUS_STYLE = {
  'идёт': { token: 'var(--positive)', mix: 18 },
  'готов': { token: 'var(--warning)', mix: 22 },
  'разработка': { token: 'var(--info)', mix: 16 },
  'черновик': { token: 'var(--st-backlog)', mix: 55 }, // нейтраль (готовится/черновик)
  'backlog': { token: 'var(--st-backlog)', mix: 60 },
  'пауза': { token: 'var(--st-todo)', mix: 45, dashed: true },
  'закрыт': { token: 'var(--text-muted)', mix: 55 },
}

// Заливка бейджа по статусу (мягкий тон на холсте карточки).
export function statusFill(status) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.backlog
  return `color-mix(in srgb, ${s.token} ${s.mix}%, var(--surface))`
}
export const statusDashed = (status) => !!(STATUS_STYLE[status] && STATUS_STYLE[status].dashed)

// ── Тип драйвера: нейтральный контурный бейдж, визуально СЛАБЕЕ статуса.
export const TYPE_RU = {
  promo: 'акция',
  sales: 'продажи',
  product: 'продукт',
  traffic: 'трафик',
  loyalty: 'возвраты',
  ops: 'операционка',
}

// ── Парки. Порядок фильтра — Охта · Питерленд · Июнь · MARI (MARI в хвосте,
//    подхватится автоматически, когда появится в данных). Имена — из parks.js.
export const DRIVER_PARK_ORDER = ['ohta', 'piterland', 'iyun', 'mari']
export const parkLabel = (id) => (PARKS_BY_ID[id] && PARKS_BY_ID[id].name) || id

// Русское склонение счётчика «Всего N драйверов» (см. i18n/projects.js pluralRu).
export const DRIVERS_PLURAL = ['драйвер', 'драйвера', 'драйверов']

// ── Форматтер даты старта в парке: 'YYYY-MM-DD' → «13.07.26» (как в песочнице).
export function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  if (!y || !m || !d) return String(iso)
  return `${d}.${m}.${y.slice(2)}`
}

// Поле «Запуск» — либо дата, либо триггер словами («по триггеру — 3-я неделя месяца»).
// Apps Script отдаёт дату канонично (ISO), текст — как есть; здесь ISO приводим к
// русскому виду, текст не трогаем.
export function launchLabel(v) {
  const s = String(v || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? fmtDate(s) : s
}

// Безопасный перевод с фолбэком (по образцу i18n/projects.js t()).
export const tr = (dict, key) => (key != null && dict[key] != null ? dict[key] : String(key))

// ── Подписи UI (данные — EN/RU-коды, интерфейс по-русски).
export const L = {
  title: 'Драйверы роста',
  subtitle: 'Что подключено, что готовится и что в очереди',
  filter_park: 'Парк',
  filter_status: 'Статус',
  all: 'Все',
  total: (n) => `Всего ${n} ${pluralRu(n, DRIVERS_PLURAL)}`,
  empty_filters: 'Ничего не подходит под фильтры',
  empty_scope_network: 'В разделе «Вся сеть» драйверов нет',
  empty_scope_park: (name) => `В парке «${name}» драйверов нет`,
  empty_scope_hint: 'Смотрите другой парк или «Вся сеть» в фильтре сверху.',
  loading: 'Загрузка…',
  error_title: 'Не удалось загрузить драйверы',
  retry: 'Повторить',
  // Пустой источник ≠ ошибка: вкладок нет / пайплайн ещё не выгрузил.
  // Формулировка честная — не выдаём «драйверов нет» за «данные не доехали».
  empty_title: 'Драйверов пока нет',
  empty_hint: 'Раздел заполнится, когда контур данных выгрузит драйверы в дневную таблицу.',
  not_launched: 'не запущен ни в одном парке',
  row_parks: 'Парки',
  row_launch: 'Запуск',
  row_goal: 'Цель',
  row_program: 'Программа',
}
