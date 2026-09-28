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
//     topups (у всех, у кого оба поля);
//   • comment — необязателен.
//
// v2.4 (NET-152) — жёсткие стопы по отношениям, пороги замерены контуром B по истории:
//   • Ф-1: receipts ÷ topups вне 1,0–3,0 — стоп (Охта/Питер). Прежнее «topups ≤
//     receipts не проверять — пакеты дают „Кол-во“ без чеков» СНЯТО: с D-160
//     пополнения считаются только по строкам «Очки-Деньги» с операцией «Покупка
//     очков», бонусные пакеты в них не входят, и чеков дня меньше, чем пополнений,
//     не было ни разу за 161 день (минимум отношения 1,13);
//   • Ф-2: topups ÷ sessions > 2,0 — стоп (все парки; максимум факта 1,26).
//
// v2.5 (NET-91, решение владельца 28.09.2026) — карта «Дни рождения», все три парка:
//   • bd_sum «Дни рождения: сумма, ₽» и bd_cards «Дни рождения: карт» — из того же отчёта
//     «Выручка», строки праздничного пакета; bd_parties «Сколько было праздников» — со слов смены;
//   • ВСЕ ТРИ НЕОБЯЗАТЕЛЬНЫЕ и НИ ОДНОЙ жёсткой проверки: «эту цифру даёт команда и может не
//     дать, и тогда отправка отчёта не должна встать из-за этой цифры». Только жёлтые строки
//     (softWarnings). Праздников больше, чем карт, — тоже жёлтая, не стоп: пакет могли
//     оплатить в другой день, в кассе дата чека, а не праздника;
//   • пустое поле НЕ уходит в payload (ключа нет), ноль уходит нулём: «не заполнили» ≠
//     «праздников не было». Бэк (Apps Script v3.22) страхует то же самое со своей стороны.

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
  // v2.5 (NET-91): дни рождения — у всех трёх парков, все необязательные
  const birthdays = BD_FIELDS.map((key) => ({ key, required: false }))
  return [
    { section: 'money', fields: money },
    { section: 'players', fields: players },
    { section: 'checks', fields: checks },
    { section: 'birthdays', fields: birthdays },
  ]
}

// v2.5 (NET-91): ключи payload карты «Дни рождения» и цена карты праздничного пакета.
// Во всех 70 днях кассы июнь–август сумма ДР ровно равна картам × 1 000 ₽ (замер контура B).
export const BD_FIELDS = ['bd_sum', 'bd_cards', 'bd_parties']
export const BD_CARD_RUB = 1000

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
    bd_sum: '', bd_cards: '', bd_parties: '',
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

// ── v2.4 (NET-152): пороги отношений ──
// Замер контура B 21.09.2026 по всей истории, где заполнены оба поля. Пороги записаны
// в ДЕСЯТЫХ, и сравнение идёт в целых числах (receipts*10 против topups*11), чтобы
// граница не зависела от того, как округлится деление: 110 чеков на 100 пополнений —
// ровно 1,10, внутри коридора, а не «чуть меньше» из-за двоичной дроби.
//
// Ф-1 · «Чеков за день» ÷ «Пополнений за день» — только парки с полем receipts.
// Факт 161 дня Охты и Питерленда: 1,13…1,49, медиана 1,32. Жёсткий коридор 1,0–3,0 не
// задевает ни одного настоящего дня; мягкий 1,10–1,60 лишь чуть шире факта.
export const RECEIPTS_HARD_TENTHS = [10, 30] // 1,0 … 3,0 — вне него стоп
export const RECEIPTS_SOFT_TENTHS = [11, 16] // 1,10 … 1,60 — вне него жёлтая строка
// Ф-2 · «Пополнений» ÷ «Чеков с пополнением» — все парки. Факт 220 дней: 1,00…1,26.
// Порог 2,0 принят владельцем 21.09 (в разборе 17.09 обсуждалось 3,0).
export const SESSIONS_HARD_MAX_TENTHS = 20 // больше 2,0 — стоп

// K для текстов Ф-1: отношение, округлённое до десятых (778 ÷ 85 = 9,15 → 9,2).
export function ratioTenths(a, b) {
  return b > 0 ? Math.round((a / b) * 10) / 10 : null
}

// Ф-1: жёсткая проверка «Чеков за день». null — всё в порядке или считать не из чего.
// Пополнений ноль — отношения нет, проверку не делаем (делить не на что, а K = ∞ в
// тексте для человека бессмысленно).
export function receiptsRatioError(park, receipts, topups) {
  if (park !== 'ohta' && park !== 'piterland') return null
  if (receipts == null || topups == null || topups <= 0) return null
  const [min, max] = RECEIPTS_HARD_TENTHS
  if (receipts * 10 < topups * min) return { kind: 'low', receipts, topups }
  if (receipts * 10 > topups * max) return { kind: 'high', receipts, topups, k: ratioTenths(receipts, topups) }
  return null
}

// Ф-2: жёсткая проверка «Чеков с пополнением». Сессий ноль при ненулевых пополнениях —
// тоже стоп: каждое пополнение пробито в каком-то чеке, «ноль таких чеков» — это число
// не из той строки, ровно класс ошибки 15.09.
export function sessionsRatioError(topups, sessions) {
  if (topups == null || sessions == null || topups <= 0) return null
  if (topups * 10 > sessions * SESSIONS_HARD_MAX_TENTHS) return { topups, sessions }
  return null
}

// Валидация формы. Возвращает:
//   { ok, missing:[key], errors:{sum?, visitors?, sessions?, date_future?,
//     receipts_ratio?, sessions_ratio?}, sum:{sum,revenue}|null, notYesterday }
// errors.receipts_ratio = { kind:'low'|'high', receipts, topups, k? } (v2.4 Ф-1);
// errors.sessions_ratio = { topups, sessions } (v2.4 Ф-2).
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

  // sessions ≤ topups — у всех, у кого оба поля (ТЗ v2 §3). Без изменений в v2.4.
  if (nums.topups != null && nums.sessions != null &&
      nums.sessions > nums.topups) errors.sessions = true

  // v2.4 Ф-1: чеки ÷ пополнения вне 1,0–3,0 (Охта/Питер).
  const rr = receiptsRatioError(form.park, nums.receipts, nums.topups)
  if (rr) errors.receipts_ratio = rr
  // v2.4 Ф-2: пополнения ÷ сессии больше 2,0 (все парки). С «сессии > пополнений»
  // не пересекается по построению: там отношение меньше 1.
  const sr = sessionsRatioError(nums.topups, nums.sessions)
  if (sr) errors.sessions_ratio = sr

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
//
// v2.4 Ф-5: коридор ср. пополнения — СВОЙ У КАЖДОГО ПАРКА (5-й…95-й процентиль,
// замер контура B 21.09.2026, 246 дней). Общий 500–1500 ₽ был шире факта любого парка
// и почти не срабатывал: у Питерленда настоящий верх 1 257 ₽, а строка включалась на 1 500.
export const AVG_TOPUP_CORRIDOR = {
  ohta: [940, 1360],
  piterland: [830, 1190],
  iyun: [580, 990],
}
export const SOFT_WARN_RATIO_MAX = 1.5
export function softWarnings(form) {
  const out = []
  const revenue = toInt(form.revenue)
  const topups = toInt(form.topups)
  const sessions = toInt(form.sessions)
  const receipts = (form.park === 'ohta' || form.park === 'piterland') ? toInt(form.receipts) : null
  // ср. пополнение = выручка ÷ пополнения; вне коридора парка → предупреждение
  const corridor = AVG_TOPUP_CORRIDOR[form.park]
  if (corridor && revenue != null && topups != null && topups > 0) {
    const avg = revenue / topups
    const [min, max] = corridor
    if (avg < min || avg > max) {
      out.push({ key: 'avg_topup', value: Math.round(avg), min, max })
    }
  }
  // v2.4 Ф-1, мягко: чеки ÷ пополнения вне 1,10–1,60 (Охта/Питер). Когда уже сработал
  // жёсткий стоп (вне 1,0–3,0), жёлтую строку не дублируем: про ту же пару чисел
  // человек видит красную, две строки подряд читались бы как два разных дефекта.
  if (receipts != null && topups != null && topups > 0 &&
      !receiptsRatioError(form.park, receipts, topups) &&
      (receipts * 10 < topups * RECEIPTS_SOFT_TENTHS[0] || receipts * 10 > topups * RECEIPTS_SOFT_TENTHS[1])) {
    out.push({ key: 'receipts_ratio', k: ratioTenths(receipts, topups) })
  }
  // пополнения ÷ сессии > 1,5 → предупреждение (обычно ~1,1). Порог и текст v2.3 не
  // менялись; при жёстком стопе Ф-2 (> 2,0) строка не дублируется — по той же причине.
  if (topups != null && sessions != null && sessions > 0 &&
      topups / sessions > SOFT_WARN_RATIO_MAX &&
      !sessionsRatioError(topups, sessions)) {
    out.push({ key: 'topups_per_session' })
  }
  // v2.5 (NET-91): дни рождения — ТОЛЬКО мягко, отправку не держит ни одна из строк.
  const bdSum = toInt(form.bd_sum)
  const bdCards = toInt(form.bd_cards)
  const bdParties = toInt(form.bd_parties)
  if ((bdSum == null) !== (bdCards == null)) {
    out.push({ key: 'bd_pair' })                      // сумма и карты — из одних и тех же строк
  } else if (bdSum != null && bdCards != null && bdSum !== bdCards * BD_CARD_RUB) {
    out.push({ key: 'bd_sum_cards', sum: bdSum, cards: bdCards })
  }
  if (bdParties != null && bdCards != null && bdParties > bdCards) {
    out.push({ key: 'bd_parties', parties: bdParties, cards: bdCards })
  }
  if (bdSum != null && revenue != null && bdSum > revenue) {
    out.push({ key: 'bd_over_revenue', sum: bdSum, revenue })
  }
  return out
}

// ── v2.4 Ф-3: отчёт за эту дату уже есть ──
// Выручка парка за дату из дневного слоя (payload `?action=daily`, sets[].days[]), или
// null — если дня в слое нет, выручка пустая/нулевая или слой не загружен. Ключ набора
// («park:month») не разбираем: ищем по полям park и month самого набора — так функция не
// зависит от того, как бэк склеивает ключ.
//
// Граница, которую надо знать: дневной слой — это КАНОН, туда день попадает после
// утреннего забора. Отчёт, отправленный сегодня и ещё не внесённый, здесь не виден, и
// пересдачу по нему форма не заметит. Для случая 16.09 (пересдача прошлого дня легла на
// уже закрытый день) этого достаточно.
export function existingRevenue(daily, park, date) {
  if (!daily || typeof daily !== 'object' || !daily.sets) return null
  if (!park || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null
  const month = date.slice(0, 7)
  for (const s of Object.values(daily.sets)) {
    if (!s || s.park !== park || s.month !== month || !Array.isArray(s.days)) continue
    const d = s.days.find((x) => x && x.date === date)
    if (!d || d.rev == null || d.rev === '') continue
    const rev = Number(d.rev)
    if (Number.isFinite(rev) && rev > 0) return Math.round(rev)
  }
  return null
}

// Тело POST (без гейт-ключа `key` — его добавляет useReport из useAccessKey).
// Контракт §6: site — все парки; receipts — только Охта/Питер; topups/sessions —
// у всех; promo/rev_y/rev_vk — Июнь, необязательные (пустые не отправляются).
// v2.5 (NET-91): bd_sum/bd_cards/bd_parties — все парки, необязательные, пустые не отправляются.
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
  for (const k of BD_FIELDS) {
    const n = toInt(form[k])
    if (n != null) p[k] = n
  }
  const c = String(form.comment ?? '').trim()
  if (c) p.comment = c
  return p
}

// Политика повторов отправки переехала в `netPolicy.js` (05.08, вечер): в тот же
// день выяснилось, что чтение дневного слоя страдает ровно тем же — единственная
// попытка без потолка ожидания. Правила общие для записи и чтения, и держать их в
// модели формы отчёта стало неверно. Здесь оставлена только ссылка, чтобы поиск по
// `RETRY_DELAYS_MS` в этом файле не заканчивался пустотой.
