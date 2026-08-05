// Модель формы «Отчёт дня» — ЧИСТЫЕ функции без DOM/Vue (тестируются в node).
//
// Контракт v2 (ТЗ v2 §2–3, §6):
//   • отчитываются 3 парка: ohta / piterland / iyun (MARI не сдаёт дневной отчёт);
//   • обязательные для ВСЕХ: revenue, cashless, cash, site («Личный кабинет»,
//     ТРЕТЬЕ слагаемое — не часть безнала; нет канала → вводят 0),
//     visitors_total, visitors_new, topups, sessions, weather;
//   • receipts — только Охта/Питерленд (обязателен); у Июня receipts пока НЕ
//     собирается (v2.3; D-10 пересмотрен — у Июня есть чеки дня ≠ пополнениям,
//     поле отложено в v2.4, см. журнал контура B);
//   • только Июнь дополнительно: promo, rev_y, rev_vk (необязательные);
//   • валидация БЕЗ допусков: cashless + cash + site === revenue ровно, до
//     рубля; visitors_new ≤ visitors_total; дата не в будущем; sessions ≤
//     topups (у всех, у кого оба поля). topups ≤ receipts НЕ проверять —
//     пакеты дают «Кол-во» без чеков;
//   • comment — необязателен.

export const REPORT_PARK_IDS = ['ohta', 'piterland', 'iyun']

// Смысловые карты формы (ТЗ v2 §1): «Деньги» / «Игроки» / «Чеки».
// Карта «День» (погода + комментарий) — отдельные контролы экрана.
export function fieldGroupsFor(park) {
  const money = [
    { key: 'revenue', required: true },
    { key: 'cashless', required: true },
    { key: 'cash', required: true },
    { key: 'site', required: true },
  ]
  const players = [
    { key: 'visitors_total', required: true },
    { key: 'visitors_new', required: true },
  ]
  const checks = []
  if (park === 'ohta' || park === 'piterland') checks.push({ key: 'receipts', required: true })
  checks.push(
    { key: 'topups', required: true },
    { key: 'sessions', required: true },
  )
  if (park === 'iyun') {
    checks.push(
      { key: 'promo', required: false },
      { key: 'rev_y', required: false },
      { key: 'rev_vk', required: false },
    )
  }
  return [
    { section: 'money', fields: money },
    { section: 'players', fields: players },
    { section: 'checks', fields: checks },
  ]
}

// Плоский список числовых полей парка (порядок = порядок рендера).
export function numericFieldsFor(park) {
  return fieldGroupsFor(park).flatMap((g) => g.fields)
}

// 'YYYY-MM-DD' по ЛОКАЛЬНОМУ времени устройства (управляющий вносит «свой вчера»).
export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function todayISO(now = new Date()) {
  return toISODate(now)
}
export function yesterdayISO(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return toISODate(d)
}

// Пустая форма. Значения числовых полей — строки (инпуты), парсинг при валидации.
export function emptyForm(park = '', now = new Date()) {
  return {
    park,
    date: yesterdayISO(now),
    revenue: '', cashless: '', cash: '', site: '',
    visitors_total: '', visitors_new: '',
    receipts: '', topups: '', sessions: '', promo: '', rev_y: '', rev_vk: '',
    weather: '',
    comment: '',
  }
}

// строка-инпут → целое ≥0 | null (пусто/мусор). Рубли — целыми (ТЗ §3).
export function toInt(v) {
  const s = String(v ?? '').trim()
  if (!s || !/^\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

// Валидация формы. Возвращает:
//   { ok, missing:[key], errors:{sum?, visitors?, sessions?, date_future?},
//     sum:{sum,revenue}|null, notYesterday }
// ok === true ⇔ отправка разрешена (все обязательные + ни одной ошибки).
// notYesterday — НЕ блокирует (жёлтая плашка «проверьте дату»).
export function validate(form, now = new Date()) {
  const missing = []
  const errors = {}

  if (!REPORT_PARK_IDS.includes(form.park)) missing.push('park')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.date || ''))) missing.push('date')
  if (!form.weather) missing.push('weather')

  const nums = {}
  for (const f of numericFieldsFor(form.park)) {
    const n = toInt(form[f.key])
    nums[f.key] = n
    if (f.required && n == null) missing.push(f.key)
  }

  // дата: не в будущем (сравнение локальных ISO-строк корректно лексикографически)
  const today = todayISO(now)
  if (!missing.includes('date') && form.date > today) errors.date_future = true
  const notYesterday = !missing.includes('date') && !errors.date_future &&
    form.date !== yesterdayISO(now)

  // безнал + нал + личный кабинет = выручка, РОВНО до рубля (ТЗ v2 §2)
  let sum = null
  if (nums.revenue != null && nums.cashless != null && nums.cash != null &&
      nums.site != null) {
    const s = nums.cashless + nums.cash + nums.site
    if (s !== nums.revenue) {
      errors.sum = true
      sum = { sum: s, revenue: nums.revenue }
    }
  }

  if (nums.visitors_total != null && nums.visitors_new != null &&
      nums.visitors_new > nums.visitors_total) errors.visitors = true

  // sessions ≤ topups — у всех, у кого оба поля (ТЗ v2 §3).
  // topups ≤ receipts НЕ проверяем: пакеты дают «Кол-во» без чеков.
  if (nums.topups != null && nums.sessions != null &&
      nums.sessions > nums.topups) errors.sessions = true

  const ok = missing.length === 0 && Object.keys(errors).length === 0
  return { ok, missing, errors, sum, notYesterday }
}

// Живая сводка производных (ТЗ v2 §5) — расчёт на лету, В PAYLOAD НЕ УХОДИТ
// (канон считает контур B). Деление на 0/пусто → null (плитка не показывается).
// Доли — в диапазоне 0..1 (форматирование в % — слой i18n).
export function derived(form) {
  const n = (k) => toInt(form[k])
  const div = (a, b) => (a != null && b != null && b > 0 ? a / b : null)
  const revenue = n('revenue')
  const topups = n('topups')
  return {
    // Средний чек: revenue ÷ receipts. Июнь — revenue ÷ topups; это средний
    // размер пополнения, показывается как «Ср. пополнение» (i18n, v2.3 §3).
    avg_check: form.park === 'iyun' ? div(revenue, topups) : div(revenue, n('receipts')),
    per_topup: div(revenue, topups),
    topups_per_session: div(topups, n('sessions')),
    cash_share: div(n('cash'), revenue),
    site_share: div(n('site'), revenue),
    new_share: div(n('visitors_new'), n('visitors_total')),
  }
}

// Мягкие предупреждения (v2.3 §4) — все парки, НЕ блокируют отправку (в validate()
// их нет; кнопка «Отправить» на них не смотрит). Появляются при заполненных
// участвующих полях. Ловят ввод из итоговой строки отчёта «Выручка» (боевой кейс
// Июня 22.07: ср.пополнение падает до ~482 ₽ при привычных ~600–750). Тексты — i18n.
export const SOFT_WARN_AVG_MIN = 500
export const SOFT_WARN_AVG_MAX = 1500
export const SOFT_WARN_RATIO_MAX = 1.5
export function softWarnings(form) {
  const out = []
  const revenue = toInt(form.revenue)
  const topups = toInt(form.topups)
  const sessions = toInt(form.sessions)
  // ср. пополнение = выручка ÷ пополнения; вне коридора 500–1500 ₽ → предупреждение
  if (revenue != null && topups != null && topups > 0) {
    const avg = revenue / topups
    if (avg < SOFT_WARN_AVG_MIN || avg > SOFT_WARN_AVG_MAX) {
      out.push({ key: 'avg_topup', value: Math.round(avg) })
    }
  }
  // пополнения ÷ сессии > 1,5 → предупреждение (обычно ~1,1)
  if (topups != null && sessions != null && sessions > 0 &&
      topups / sessions > SOFT_WARN_RATIO_MAX) {
    out.push({ key: 'topups_per_session' })
  }
  return out
}

// Тело POST (без гейт-ключа `key` — его добавляет useReport из useAccessKey).
// Контракт §6: site — все парки; receipts — только Охта/Питер; topups/sessions —
// у всех; promo/rev_y/rev_vk — Июнь, необязательные (пустые не отправляются).
export function buildPayload(form) {
  const p = {
    park: form.park,
    date: form.date,
    revenue: toInt(form.revenue),
    cashless: toInt(form.cashless),
    cash: toInt(form.cash),
    site: toInt(form.site),
    visitors_total: toInt(form.visitors_total),
    visitors_new: toInt(form.visitors_new),
    topups: toInt(form.topups),
    sessions: toInt(form.sessions),
    weather: form.weather,
  }
  if (form.park === 'ohta' || form.park === 'piterland') {
    p.receipts = toInt(form.receipts)
  }
  if (form.park === 'iyun') {
    for (const k of ['promo', 'rev_y', 'rev_vk']) {
      const n = toInt(form[k])
      if (n != null) p[k] = n
    }
  }
  const c = String(form.comment ?? '').trim()
  if (c) p.comment = c
  return p
}

// ═══════════ ПОЛИТИКА ПОВТОРОВ ОТПРАВКИ (v2.4, 05.08.2026) ═══════════
// Живёт здесь, а не в useReport.js, по той же причине, по которой здесь живёт
// вся валидация: модуль чист от vue и DOM, значит политику можно прогнать в
// приёмке без jsdom и без таймеров. useReport.js её импортирует.
//
// Повод: 05.08 Охта дважды не смогла отправить отчёт, а журнал выполнений Apps
// Script за это время не показал ни одной ошибки и вообще ни одного запроса —
// POST умирал по дороге к Google, в сети ТЦ. Со второй-третьей попытки уходил.

// Паузы перед 2-й и 3-й попытками, мс. Три попытки суммарно.
// Больше трёх не делаем: если не прошло за ~6 секунд, это уже не осечка, а
// обрыв, и человеку честнее увидеть плашку и решить самому.
export const RETRY_DELAYS_MS = [1500, 4000]

// Сколько ждём ответ ОДНОЙ попытки. `doPost` на бэке отрабатывает 1–3 с (журнал
// выполнений), так что 25 с — это заведомо не «медленно», а «висит». Без потолка
// зависший запрос держит кнопку в «Отправляем…» до таймаута браузера, то есть
// минуты, и повтор не наступает никогда.
export const ATTEMPT_TIMEOUT_MS = 25000

/**
 * Транспортная осечка (повторяем) или отказ по существу (не повторяем).
 *   408/425/429 и любые 5xx — перегрузка, квота, прокси: повтор осмыслен;
 *   прочие 4xx — запрос не тот, повтор ничего не изменит;
 *   статуса нет вовсе — это сетевой сбой, повторяем.
 */
export function isRetriableStatus(status) {
  const n = Number(status)
  if (!isFinite(n)) return true
  return n === 408 || n === 425 || n === 429 || n >= 500
}
