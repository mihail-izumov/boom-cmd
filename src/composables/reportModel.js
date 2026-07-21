// Модель формы «Отчёт дня» — ЧИСТЫЕ функции без DOM/Vue (тестируются в node).
//
// Контракт (ТЗ §4, §7):
//   • отчитываются 3 парка: ohta / piterland / iyun (MARI не сдаёт дневной отчёт);
//   • обязательные для всех: revenue, cashless, cash, visitors_total, visitors_new,
//     weather; comment — необязателен;
//   • только Июнь дополнительно: topups, sessions (обязательные), promo, rev_y,
//     rev_vk (необязательные). Охта/Питерленд чеки/пополнения/сессии НЕ вводят —
//     эти счётчики берутся только из системной выгрузки (блок-напоминание в UI);
//   • валидация БЕЗ допусков: cashless + cash === revenue ровно, до рубля;
//     visitors_new ≤ visitors_total; дата не в будущем; Июнь: sessions ≤ topups.

export const REPORT_PARK_IDS = ['ohta', 'piterland', 'iyun']

// Поля, которые вводит парк (без park/date/weather/comment — они отдельные блоки).
export function numericFieldsFor(park) {
  const base = [
    { key: 'revenue', required: true },
    { key: 'cashless', required: true },
    { key: 'cash', required: true },
    { key: 'visitors_total', required: true },
    { key: 'visitors_new', required: true },
  ]
  if (park === 'iyun') {
    base.push(
      { key: 'topups', required: true },
      { key: 'sessions', required: true },
      { key: 'promo', required: false },
      { key: 'rev_y', required: false },
      { key: 'rev_vk', required: false },
    )
  }
  return base
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
    revenue: '', cashless: '', cash: '',
    visitors_total: '', visitors_new: '',
    topups: '', sessions: '', promo: '', rev_y: '', rev_vk: '',
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

  // безнал + нал = выручка, РОВНО до рубля (никаких допусков — ТЗ §4)
  let sum = null
  if (nums.revenue != null && nums.cashless != null && nums.cash != null) {
    const s = nums.cashless + nums.cash
    if (s !== nums.revenue) {
      errors.sum = true
      sum = { sum: s, revenue: nums.revenue }
    }
  }

  if (nums.visitors_total != null && nums.visitors_new != null &&
      nums.visitors_new > nums.visitors_total) errors.visitors = true

  if (form.park === 'iyun' && nums.topups != null && nums.sessions != null &&
      nums.sessions > nums.topups) errors.sessions = true

  const ok = missing.length === 0 && Object.keys(errors).length === 0
  return { ok, missing, errors, sum, notYesterday }
}

// Тело POST (без гейт-ключа `key` — его добавляет useReport из useAccessKey).
// Необязательные пустые поля не отправляются; чужие парку поля — не отправляются.
export function buildPayload(form) {
  const p = {
    park: form.park,
    date: form.date,
    revenue: toInt(form.revenue),
    cashless: toInt(form.cashless),
    cash: toInt(form.cash),
    visitors_total: toInt(form.visitors_total),
    visitors_new: toInt(form.visitors_new),
    weather: form.weather,
  }
  if (form.park === 'iyun') {
    p.topups = toInt(form.topups)
    p.sessions = toInt(form.sessions)
    for (const k of ['promo', 'rev_y', 'rev_vk']) {
      const n = toInt(form[k])
      if (n != null) p[k] = n
    }
  }
  const c = String(form.comment ?? '').trim()
  if (c) p.comment = c
  return p
}
