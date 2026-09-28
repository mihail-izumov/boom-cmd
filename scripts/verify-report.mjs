// Локальная приёмка страницы «Отчёт Дня» v2/v2.1 (D-12). Запуск: `node scripts/verify-report.mjs`.
// v2.1: подпись/тултипы поля сессий (§1), «Переменно / затрудняюсь» (§2),
// дата без border-t (§3), заголовок «Отчёт Дня» (§4).
// v2.2: строка сверки без «владельца» (§1), вводная строка и постоянные хинты
// карты «Чеки» + пример в тултипе сессий (§2, только Охта/Питер).
// v2.3: тултипы Июня операционные без «1 пополнение = 1 чек» (§1); вводная строка
// и хинты включены Июню (§2); плитка «Ср. пополнение» Июню (§3); мягкие
// предупреждения о вводе из итоговой строки — синтетика 482/700/1,6/1,1 (§4).
// v2.4 (NET-152): жёсткие стопы чеки÷пополнения (Ф-1) и пополнения÷сессии (Ф-2),
// вопрос при пересдаче за уже сданную дату по дневному слою (Ф-3), хинты пополнений
// с «Очки-Деньги» (Ф-4), коридор ср. пополнения по парку (Ф-5), блок «Как получить
// отчёт» (Ф-6). Приёмка §8 задания — отдельным блоком «v2.4 · приёмка §8».
// v2.5 (NET-91, 28.09.2026): карта «Дни рождения» — три необязательных поля, только жёлтые
// строки, пустое не уходит в тело POST. Блоки «NET-91 · модель» и «NET-91 · jsdom».
//
// Двухслойная проверка:
//   1) ЧИСТАЯ МОДЕЛЬ (reportModel.js, без DOM): все блокировки ТЗ v2 §2–3 —
//      cashless+cash+site===revenue ровно (без допусков), visitors_new ≤
//      visitors_total, дата не в будущем, sessions ≤ topups (все парки),
//      receipts обязателен только у Охты/Питера, обязательность полей,
//      payload §6, живая сводка derived() (§5).
//   2) ЖИВОЙ РЕНДЕР В JSDOM: временная lib-сборка Vite (экран + оболочка
//      репортёра), монтирование в jsdom, прогон формы событиями: смысловые
//      карты, «игроки» в текстах, отсутствие §5.8-блока v1, тихая строка
//      недельной сверки, сводка «Проверь себя», тап «Отправить» с ошибками
//      НЕ шлёт POST, тело POST по §6, экран успеха, красная плашка без
//      потери данных.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  emptyForm, validate, buildPayload, derived, numericFieldsFor, toInt,
  yesterdayISO, todayISO, softWarnings,
  existingRevenue, receiptsRatioError, sessionsRatioError, AVG_TOPUP_CORRIDOR, toISODate,
  BD_FIELDS, BD_CARD_RUB,
} from '../src/composables/reportModel.js'
// Политика повторов общая для записи и чтения — живёт в netPolicy.js (05.08, вечер).
import { RETRY_DELAYS_MS, ATTEMPT_TIMEOUT_MS, isRetriableStatus } from '../src/composables/netPolicy.js'
import {
  rub, L, FIELD_LABELS, WEATHER_OPTIONS, TIPS, TIPS_IYUN,
  WEEKLY_NOTE, CHECKS_INTRO, CHECKS_INTRO_IYUN, FIELD_HINTS, hintFor,
  checksIntroFor, summaryLabelFor, summaryValue, softWarnMessage,
  receiptsRatioMessage, sessionsRatioMessage, RESUBMIT, CHECKS_EXCLUDED,
  HOWTO_TITLE, HOWTO_NOTE, HOWTO_PLAYGROUND, howtoRowsFor,
  BIRTHDAYS_INTRO, SECTION_TITLES,
} from '../src/i18n/report.js'
import { NET_HINTS } from '../src/i18n/net.js'
import { formatInt } from '../src/i18n/analytics.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let ok = true
const check = (label, pass, got) => {
  ok = ok && !!pass
  console.log(`${pass ? '✓' : '✗'}  ${label}${got !== undefined ? `  (${got})` : ''}`)
}

// ═══════════════ 1. Чистая модель ═══════════════
console.log('=== reportModel: базовые ===')
const NOW = new Date(2026, 6, 21, 12, 0, 0) // 21.07.2026 локально
check('вчера = 2026-07-20', yesterdayISO(NOW) === '2026-07-20', yesterdayISO(NOW))
check('сегодня = 2026-07-21', todayISO(NOW) === '2026-07-21')
check('toInt("120 000") → null (пробелы не пропускаем)', toInt('120 000') === null)
check('toInt("-5") → null', toInt('-5') === null)
check('toInt("0") → 0', toInt('0') === 0)
check('toInt("207249") → 207249', toInt('207249') === 207249)

// revenue = cashless + cash + site (три слагаемых, §2)
function filled(park = 'piterland', over = {}) {
  const base = {
    ...emptyForm(park, NOW),
    revenue: '207249', cashless: '147834', cash: '44415', site: '15000',
    visitors_total: '300', visitors_new: '40',
    topups: '180', sessions: '160',
    weather: 'rain_all',
  }
  if (park === 'ohta' || park === 'piterland') base.receipts = '265'
  return { ...base, ...over }
}

console.log('\n=== reportModel: состав полей v2 ===')
{
  const keys = (park) => numericFieldsFor(park).map((f) => f.key)
  check('Питер: money-поля включают site',
    keys('piterland').includes('site'))
  check('Питер: receipts/topups/sessions есть',
    ['receipts', 'topups', 'sessions'].every((k) => keys('piterland').includes(k)))
  check('Охта: receipts есть', keys('ohta').includes('receipts'))
  check('Июнь: receipts пока НЕ собирается (v2.3; поле отложено в v2.4)',
    !keys('iyun').includes('receipts'))
  check('Июнь: topups/sessions/promo/rev_y/rev_vk есть',
    ['topups', 'sessions', 'promo', 'rev_y', 'rev_vk'].every((k) => keys('iyun').includes(k)))
  const req = (park, k) => numericFieldsFor(park).find((f) => f.key === k)?.required
  check('site обязателен (все парки)',
    req('ohta', 'site') && req('piterland', 'site') && req('iyun', 'site'))
  check('topups/sessions обязательны у всех',
    ['ohta', 'piterland', 'iyun'].every((p) => req(p, 'topups') && req(p, 'sessions')))
  check('receipts обязателен у Охты/Питера',
    req('ohta', 'receipts') === true && req('piterland', 'receipts') === true)
  check('promo/rev_y/rev_vk необязательны',
    req('iyun', 'promo') === false && req('iyun', 'rev_y') === false && req('iyun', 'rev_vk') === false)
}

console.log('\n=== reportModel: блокировки §2–3 ===')
check('пустая форма НЕ ок', validate(emptyForm('', NOW), NOW).ok === false)
check('заполненный Питер ок', validate(filled(), NOW).ok === true)
{
  const v = validate(filled('piterland', { site: '15001' }), NOW)
  check('сумма трёх слагаемых ±1 ₽ блокирует (без допусков)', v.ok === false && v.errors.sum === true)
  check('данные для текста: sum=207250, revenue=207249',
    v.sum && v.sum.sum === 207250 && v.sum.revenue === 207249)
}
check('site пустой → блокирует (обязателен)',
  validate(filled('piterland', { site: '' }), NOW).missing.includes('site'))
check('site=0 валиден (канала нет — вводят 0)',
  validate(filled('piterland', { site: '0', cash: '59415' }), NOW).ok === true)
check('receipts пустой у Питера → блокирует',
  validate(filled('piterland', { receipts: '' }), NOW).missing.includes('receipts'))
check('topups пустой у Питера → блокирует (теперь у всех)',
  validate(filled('piterland', { topups: '' }), NOW).missing.includes('topups'))
check('sessions > topups блокирует у Питера (не только Июнь)',
  validate(filled('piterland', { sessions: '181' }), NOW).errors.sessions === true)
// v2.4 Ф-1: правило v2 «topups > receipts не блокирует» СНЯТО — с D-160 пакеты в
// пополнения не входят, и чеков меньше, чем пополнений, не было ни разу за 161 день.
check('topups > receipts теперь блокирует (v2.4 Ф-1: чеки ÷ пополнения < 1,0)',
  (() => { const v = validate(filled('piterland', { topups: '300', sessions: '290' }), NOW)
    return v.ok === false && v.errors.receipts_ratio?.kind === 'low' })())
check('visitors_new > total блокирует',
  validate(filled('piterland', { visitors_new: '301' }), NOW).errors.visitors === true)
check('visitors_new == total ок',
  validate(filled('piterland', { visitors_new: '300' }), NOW).ok === true)
check('дата в будущем блокирует',
  validate(filled('piterland', { date: '2026-07-22' }), NOW).errors.date_future === true)
check('сегодня — не блокирует, но notYesterday',
  (() => { const v = validate(filled('piterland', { date: '2026-07-21' }), NOW); return v.ok && v.notYesterday })())
check('вчера — без плашки', validate(filled(), NOW).notYesterday === false)
check('погода обязательна',
  validate(filled('piterland', { weather: '' }), NOW).missing.includes('weather'))
check('комментарий необязателен', validate(filled(), NOW).ok === true)

console.log('\n=== reportModel: Июнь ===')
const iyunOver = {
  revenue: '100000', cashless: '60000', cash: '30000', site: '10000',
  topups: '120', sessions: '110', receipts: '',
}
check('Июнь без topups/sessions НЕ ок',
  validate(filled('iyun', { ...iyunOver, topups: '', sessions: '' }), NOW).missing.includes('topups'))
check('Июнь с topups/sessions ок', validate(filled('iyun', iyunOver), NOW).ok === true)
check('Июнь sessions > topups блокирует',
  validate(filled('iyun', { ...iyunOver, sessions: '121' }), NOW).errors.sessions === true)
check('Июнь: receipts не требуется',
  !validate(filled('iyun', iyunOver), NOW).missing.includes('receipts'))
check('Июнь promo/rev_y/rev_vk необязательны',
  validate(filled('iyun', iyunOver), NOW).ok === true)

console.log('\n=== reportModel: payload §6 ===')
{
  const p = buildPayload(filled('piterland', { comment: '  гроза  ' }))
  check('park/date/числа — типы верные',
    p.park === 'piterland' && p.date === '2026-07-20' && p.revenue === 207249 &&
    p.cashless === 147834 && p.cash === 44415 && p.visitors_total === 300 && p.visitors_new === 40)
  check('site в payload числом', p.site === 15000)
  check('receipts/topups/sessions в payload у Питера',
    p.receipts === 265 && p.topups === 180 && p.sessions === 160)
  check('comment триммится', p.comment === 'гроза')
  check('у Питера НЕТ promo/rev_*',
    !('promo' in p) && !('rev_y' in p) && !('rev_vk' in p))
  check('weather — слаг', p.weather === 'rain_all')
  check('ключа `key` в payload НЕТ (добавляет useReport)', !('key' in p))
}
{
  const p = buildPayload(filled('iyun', { ...iyunOver, promo: '7', rev_y: '', rev_vk: '2' }))
  check('Июнь: site/topups/sessions в payload',
    p.site === 10000 && p.topups === 120 && p.sessions === 110)
  check('Июнь: receipts в payload НЕТ', !('receipts' in p))
  check('Июнь: promo=7, rev_vk=2, rev_y отсутствует',
    p.promo === 7 && p.rev_vk === 2 && !('rev_y' in p))
  const p2 = buildPayload(filled('iyun', iyunOver))
  check('Июнь: пустой comment не отправляется', !('comment' in p2))
}
{
  const keys = Object.keys(buildPayload(filled()))
  const DERIVED = ['avg_check', 'per_topup', 'topups_per_session', 'cash_share', 'site_share', 'new_share']
  check('производные §5 в payload НЕ уходят', DERIVED.every((k) => !keys.includes(k)))
}

console.log('\n=== reportModel: живая сводка derived() §5 ===')
{
  const d = derived(filled())
  check('средний чек = revenue ÷ receipts ≈ 782,07',
    Math.abs(d.avg_check - 207249 / 265) < 1e-9)
  check('чек/пополнение = revenue ÷ topups',
    Math.abs(d.per_topup - 207249 / 180) < 1e-9)
  check('попол/сессию = 180 ÷ 160 = 1.125', d.topups_per_session === 1.125)
  check('доля нала = cash ÷ revenue', Math.abs(d.cash_share - 44415 / 207249) < 1e-9)
  check('доля ЛК = site ÷ revenue', Math.abs(d.site_share - 15000 / 207249) < 1e-9)
  check('доля новых = 40 ÷ 300', Math.abs(d.new_share - 40 / 300) < 1e-9)
}
{
  const d = derived(filled('piterland', { receipts: '0', sessions: '', revenue: '' }))
  check('÷0 → null (средний чек)', d.avg_check === null)
  check('пустой revenue → null (чек/попол, доли)',
    d.per_topup === null && d.cash_share === null && d.site_share === null)
  check('пустые sessions → null', d.topups_per_session === null)
  const d2 = derived(emptyForm('piterland', NOW))
  check('пустая форма → все производные null', Object.values(d2).every((x) => x === null))
}
{
  const d = derived(filled('iyun', iyunOver))
  check('Июнь: avg_check = revenue ÷ topups (плитка «Ср. пополнение», v2.3 §3)',
    Math.abs(d.avg_check - 100000 / 120) < 1e-9)
  check('Июнь: плитка avg_check подписана «Ср. пополнение» (не «Средний чек»)',
    summaryLabelFor('iyun', 'avg_check') === 'Ср. пополнение')
  check('Охта/Питер: avg_check остаётся «Средний чек»',
    summaryLabelFor('piterland', 'avg_check') === 'Средний чек')
}

console.log('\n=== reportModel: мягкие предупреждения §4 (все парки, НЕ блокируют; коридор Июня 580–990 — v2.4 Ф-5) ===')
{
  const warnKeys = (over) => softWarnings(filled('iyun', { ...iyunOver, ...over })).map((w) => w.key)
  check('Июнь: ср.пополнение 482 ₽ (<580) → предупреждение',
    warnKeys({ revenue: '48200', cashless: '30000', cash: '10000', site: '8200', topups: '100', sessions: '90' }).includes('avg_topup'))
  check('Июнь: ср.пополнение 700 ₽ (в коридоре 580–990) → без предупреждения',
    !warnKeys({ revenue: '70000', cashless: '40000', cash: '20000', site: '10000', topups: '100', sessions: '95' }).includes('avg_topup'))
  check('Июнь: ср.пополнение 1600 ₽ (>990) → предупреждение',
    warnKeys({ revenue: '160000', cashless: '100000', cash: '40000', site: '20000', topups: '100', sessions: '95' }).includes('avg_topup'))
  check('попол/сессии 1,6 (>1,5) → предупреждение',
    warnKeys({ revenue: '112000', cashless: '70000', cash: '30000', site: '12000', topups: '160', sessions: '100' }).includes('topups_per_session'))
  check('попол/сессии 1,1 (≤1,5) → без предупреждения',
    !warnKeys({ revenue: '77000', cashless: '47000', cash: '20000', site: '10000', topups: '110', sessions: '100' }).includes('topups_per_session'))
  const warnForm = filled('iyun', { ...iyunOver, revenue: '48200', cashless: '30000', cash: '10000', site: '8200', topups: '100', sessions: '90' })
  check('предупреждение НЕ блокирует: validate().ok === true при активном предупреждении',
    validate(warnForm, NOW).ok === true && softWarnings(warnForm).length > 0)
  check('пустая форма → без предупреждений', softWarnings(emptyForm('iyun', NOW)).length === 0)
}

// ═══════════════ v2.4 · NET-152 — модель (Ф-1 … Ф-6) ═══════════════
console.log('\n=== NET-152 · модель: Ф-1 чеки ÷ пополнения (Охта/Питер) ===')
{
  // Охта, 85 пополнений: выручка 100 000 → ср.пополнение 1 176 ₽ (в коридоре Охты),
  // сессий 80 → 1,06 (норма). Меняется только число чеков.
  const ohta = (receipts, topups = 85) => filled('ohta', {
    revenue: '100000', cashless: '60000', cash: '30000', site: '10000',
    receipts: String(receipts), topups: String(topups), sessions: '80',
  })
  const v778 = validate(ohta(778), NOW)
  check('778 при 85 → стоп «больше 3,0», K = 9,2 (боевой случай 11.09)',
    v778.ok === false && v778.errors.receipts_ratio?.kind === 'high' && v778.errors.receipts_ratio.k === 9.2,
    JSON.stringify(v778.errors.receipts_ratio))
  check('80 при 85 → стоп «меньше 1,0»', validate(ohta(80), NOW).errors.receipts_ratio?.kind === 'low')
  check('112 при 85 (1,32) → проходит', validate(ohta(112), NOW).ok === true)
  check('112 при 85 → ни одного предупреждения', softWarnings(ohta(112)).length === 0,
    JSON.stringify(softWarnings(ohta(112))))
  check('150 при 85 (1,76) → проходит (мягкая не блокирует)', validate(ohta(150), NOW).ok === true)
  const w150 = softWarnings(ohta(150)).find((w) => w.key === 'receipts_ratio')
  check('150 при 85 → мягкая строка про чеки, K = 1,8', !!w150 && w150.k === 1.8, JSON.stringify(w150))
  check('граница 3,0 включительно: 255 при 85 — не стоп', receiptsRatioError('ohta', 255, 85) === null)
  check('256 при 85 (3,01) — стоп', receiptsRatioError('ohta', 256, 85)?.kind === 'high')
  check('граница 1,0 включительно: 85 при 85 — не стоп (но жёлтая: ниже 1,10)',
    receiptsRatioError('ohta', 85, 85) === null &&
    softWarnings(ohta(85)).some((w) => w.key === 'receipts_ratio'))
  const soft = (r, t) => softWarnings(filled('piterland', {
    revenue: String(t * 1000), cashless: String(t * 1000), cash: '0', site: '0',
    receipts: String(r), topups: String(t), sessions: String(t),
  })).some((w) => w.key === 'receipts_ratio')
  check('мягкий коридор 1,10–1,60 включительно: 110/100 и 160/100 — без жёлтой',
    !soft(110, 100) && !soft(160, 100))
  check('109/100 и 161/100 — жёлтая', soft(109, 100) && soft(161, 100))
  check('Июнь — проверки чеков нет (поля нет)', receiptsRatioError('iyun', 778, 85) === null)
  check('пополнений 0 — отношения нет, проверки нет', receiptsRatioError('ohta', 50, 0) === null)
  check('при стопе жёлтая про чеки не дублирует красную',
    !softWarnings(ohta(778)).some((w) => w.key === 'receipts_ratio'))
  check('текст стопа «больше 3,0» — дословно',
    receiptsRatioMessage(v778.errors.receipts_ratio) ===
      'Чеков за день (778) в 9,2 раз больше пополнений (85). Обычно их больше в полтора раза. Проверьте число по отчёту.')
  check('текст стопа «меньше 1,0» — дословно',
    receiptsRatioMessage(validate(ohta(80), NOW).errors.receipts_ratio) ===
      'Чеков за день (80) меньше, чем пополнений (85). Так не бывает: каждое пополнение — это чек. Проверьте оба числа по отчёту.')
  check('текст жёлтой строки про чеки — дословно',
    softWarnMessage(w150) === 'Проверьте чеки: на 10 пополнений у вас обычно от 11 до 16 чеков, сейчас 1,8.')
}

console.log('\n=== NET-152 · модель: Ф-2 пополнения ÷ сессии > 2,0 (все парки) ===')
{
  // Июнь, 88 пополнений, выручка 66 000 → 750 ₽ (в коридоре Июня 580–990).
  const iyun = (sessions, topups = 88) => filled('iyun', {
    ...iyunOver, revenue: '66000', cashless: '40000', cash: '20000', site: '6000',
    topups: String(topups), sessions: String(sessions),
  })
  const v2 = validate(iyun(2), NOW)
  check('Июнь 2 при 88 → стоп (боевой случай 15.09)', v2.ok === false && !!v2.errors.sessions_ratio)
  check('Июнь 87 при 88 → проходит без предупреждений',
    validate(iyun(87), NOW).ok === true && softWarnings(iyun(87)).length === 0,
    JSON.stringify(softWarnings(iyun(87))))
  check('граница 2,0 включительно: 44 при 88 — не стоп, но мягкая v2.3 (> 1,5) есть',
    validate(iyun(44), NOW).ok === true && softWarnings(iyun(44)).some((w) => w.key === 'topups_per_session'))
  check('43 при 88 (2,05) — стоп', !!validate(iyun(43), NOW).errors.sessions_ratio)
  check('сессий 0 при 88 пополнениях — стоп', sessionsRatioError(88, 0) !== null)
  check('пополнений 0 — проверки нет', sessionsRatioError(0, 0) === null)
  check('Охта и Питер — та же проверка (все парки)',
    !!validate(filled('ohta', { sessions: '80', topups: '180' }), NOW).errors.sessions_ratio &&
    !!validate(filled('piterland', { sessions: '80', topups: '180' }), NOW).errors.sessions_ratio)
  check('при стопе мягкая v2.3 про сессии не дублирует красную',
    !softWarnings(iyun(2)).some((w) => w.key === 'topups_per_session'))
  check('«сессии ≤ пополнения» — без изменений', validate(iyun(89), NOW).errors.sessions === true)
  check('текст стопа — дословно',
    sessionsRatioMessage(v2.errors.sessions_ratio) ===
      'Чеков с пополнением (2) намного меньше пополнений (88). Обычно эти числа почти равны. Проверьте по отчёту: считаются только строки „Очки-Деньги“ с операцией „Покупка очков“.')
}

console.log('\n=== NET-152 · модель: Ф-5 коридор ср. пополнения по парку ===')
{
  check('коридоры — замер контура B 21.09 (Охта 940–1360, Питер 830–1190, Июнь 580–990)',
    JSON.stringify(AVG_TOPUP_CORRIDOR) === JSON.stringify({ ohta: [940, 1360], piterland: [830, 1190], iyun: [580, 990] }))
  const avgWarn = (park, perTopup, topups = 100) => softWarnings(filled(park, {
    revenue: String(perTopup * topups), cashless: String(perTopup * topups), cash: '0', site: '0',
    receipts: String(Math.round(topups * 1.3)), topups: String(topups), sessions: String(topups),
  })).find((w) => w.key === 'avg_topup')
  check('Питер 1 200 ₽ → предупреждение (общий 500–1500 тут молчал)', !!avgWarn('piterland', 1200))
  check('Питер 830 и 1 190 (границы) → без; 829 и 1 191 → есть',
    !avgWarn('piterland', 830) && !avgWarn('piterland', 1190) &&
    !!avgWarn('piterland', 829) && !!avgWarn('piterland', 1191))
  check('Охта 940 и 1 360 → без; 939 и 1 361 → есть',
    !avgWarn('ohta', 940) && !avgWarn('ohta', 1360) && !!avgWarn('ohta', 939) && !!avgWarn('ohta', 1361))
  check('Июнь 580 и 990 → без; 579 и 991 → есть',
    !avgWarn('iyun', 580) && !avgWarn('iyun', 990) && !!avgWarn('iyun', 579) && !!avgWarn('iyun', 991))
  const w = avgWarn('piterland', 1200)
  check('в предупреждении — границы именно этого парка', w && w.value === 1200 && w.min === 830 && w.max === 1190,
    JSON.stringify(w))
  check('текст жёлтой строки — дословно, с границами парка',
    softWarnMessage(w) === `Проверьте пополнения: выручка ÷ пополнения = ${rub(1200)}, обычно у вас от 830 до ${formatInt(1190)}.`,
    softWarnMessage(w))
  check('парк не выбран → строки нет', softWarnings(filled('', { revenue: '1000', topups: '100' })).length === 0)
}

console.log('\n=== NET-152 · модель: Ф-3 выручка за дату в дневном слое ===')
{
  const daily = { sets: {
    'piterland:2026-09': { park: 'piterland', month: '2026-09', days: [
      { date: '2026-09-15', rev: 207249, status: 'full' },
      { date: '2026-09-16', rev: null, status: '' },
      { date: '2026-09-17', rev: 0, status: 'full' },
    ] },
    'ohta:2026-09': { park: 'ohta', month: '2026-09', days: [{ date: '2026-09-15', rev: 150000, status: 'full' }] },
  } }
  check('Питер 15.09 → 207 249', existingRevenue(daily, 'piterland', '2026-09-15') === 207249)
  check('Охта 15.09 → своя выручка, не питерская', existingRevenue(daily, 'ohta', '2026-09-15') === 150000)
  check('Июнь 15.09 (набора нет) → null', existingRevenue(daily, 'iyun', '2026-09-15') === null)
  check('дня в наборе нет → null', existingRevenue(daily, 'piterland', '2026-09-14') === null)
  check('rev null → null (Number(null) = 0 выручкой не считаем)', existingRevenue(daily, 'piterland', '2026-09-16') === null)
  check('rev 0 → null', existingRevenue(daily, 'piterland', '2026-09-17') === null)
  check('другой месяц → null', existingRevenue(daily, 'piterland', '2026-08-15') === null)
  check('слой пуст или не загружен → null',
    existingRevenue({ updated: null, sets: {} }, 'piterland', '2026-09-15') === null &&
    existingRevenue(null, 'piterland', '2026-09-15') === null)
  check('ключ набора не разбирается — ищем по полям park/month',
    existingRevenue({ sets: { any: { park: 'piterland', month: '2026-09', days: [{ date: '2026-09-15', rev: '1000' }] } } },
      'piterland', '2026-09-15') === 1000)
  check('кривая дата → null', existingRevenue(daily, 'piterland', '15.09.2026') === null)
  check('текст подтверждения и кнопки — дословно',
    RESUBMIT.text(207249) === `За эту дату отчёт уже есть: выручка ${rub(207249)}. Отправить новый вместо него?` &&
    RESUBMIT.yes === 'Да, пересдаю' && RESUBMIT.cancel === 'Отмена')
}

console.log('\n=== NET-152 · тексты: Ф-4 и Ф-6 ===')
{
  check('Ф-4: предложение про пакеты и ЛК — дословно',
    CHECKS_EXCLUDED === 'Пакеты и пополнения через личный кабинет сюда не входят — деньги за них учитываются отдельно.')
  check('Ф-4: в обеих вводных оно стоит последним предложением',
    CHECKS_INTRO.endsWith(` ${CHECKS_EXCLUDED}`) && CHECKS_INTRO_IYUN.endsWith(` ${CHECKS_EXCLUDED}`))
  check('Ф-4: в хинтах старой формулировки «по строкам „Покупка очков“» нет',
    Object.values(FIELD_HINTS).every((h) => !h.includes('по строкам „Покупка очков“')))
  check('Ф-6: заголовок «Как получить отчёт»', HOWTO_TITLE === 'Как получить отчёт')
  check('Ф-6: игротеки по парку — из СТАНДАРТ-отчёта-дня §1',
    HOWTO_PLAYGROUND.ohta === 'Бумбастик Охта Молл' && HOWTO_PLAYGROUND.piterland === 'БУМБАСТИК' &&
    HOWTO_PLAYGROUND.iyun === 'Бумбастик ТРК Июнь')
  check('Ф-6: пять строк у каждого парка, в порядке задания',
    ['ohta', 'piterland', 'iyun'].every((p) => howtoRowsFor(p).map((r) => r.label).join('|') ===
      'Отчёт|Дата С и Дата ПО|Игротека|Группировки 1–4|Воронки над столбцами'))
  const rows = Object.fromEntries(howtoRowsFor('ohta').map((r) => [r.label, r.value]))
  check('Ф-6: значения строк — по задаче',
    rows['Отчёт'] === '„[Финансовые] Выручка“' &&
    rows['Дата С и Дата ПО'] === 'тот день, за который отчёт' &&
    rows['Игротека'] === 'Бумбастик Охта Молл' &&
    rows['Группировки 1–4'] === 'Наименование · Операция · Тип оплаты · Источник транзакции' &&
    rows['Воронки над столбцами'] === 'все светлые; тёмная значит, что строки скрыты и суммы неверные')
  check('Ф-6: строка про «Статистику посещений» — дословно',
    HOWTO_NOTE === 'Игроков всего и Из них новых — из отчёта „Статистика посещений“ за тот же день.')
  check('Ф-6: примеров чисел в блоке нет (цифры только в подписи «Группировки 1–4»)',
    ['ohta', 'piterland', 'iyun'].every((p) => howtoRowsFor(p).every((r) => !/\d/.test(r.value))) && !/\d/.test(HOWTO_NOTE))
  check('Ф-6: без парка блока нет', howtoRowsFor('').length === 0)
}

console.log('\n=== NET-91 · модель: дни рождения (v2.5, все поля необязательные) ===')
{
  const keys = (park) => numericFieldsFor(park).map((f) => f.key)
  check('три поля ДР у всех трёх парков',
    ['ohta', 'piterland', 'iyun'].every((p) => BD_FIELDS.every((k) => keys(p).includes(k))))
  check('все три необязательные',
    ['ohta', 'piterland', 'iyun'].every((p) => numericFieldsFor(p).filter((f) => BD_FIELDS.includes(f.key)).every((f) => f.required === false)))
  check('цена карты — 1 000 ₽', BD_CARD_RUB === 1000)
  check('пустая форма: поля ДР — пустые строки', BD_FIELDS.every((k) => emptyForm('ohta', NOW)[k] === ''))
  check('без полей ДР отчёт валиден (отправку не держат)', validate(filled('piterland'), NOW).ok === true)
  check('праздников больше, чем карт, — всё равно валиден (не стоп)',
    validate(filled('piterland', { bd_sum: '6000', bd_cards: '6', bd_parties: '9' }), NOW).ok === true)
  check('сумма ≠ карты × 1 000 — всё равно валиден',
    validate(filled('ohta', { bd_sum: '7000', bd_cards: '6' }), NOW).ok === true)
  const p0 = buildPayload(filled('piterland'))
  check('пустые поля ДР в тело НЕ уходят (ключей нет)', BD_FIELDS.every((k) => !(k in p0)))
  const pE = buildPayload(filled('piterland', { bd_sum: '', bd_cards: '', bd_parties: '' }))
  check("'' — тоже не уходит (не превращается в 0)", BD_FIELDS.every((k) => !(k in pE)))
  const pZ = buildPayload(filled('iyun', { ...iyunOver, bd_sum: '0', bd_cards: '0' }))
  check('ноль уходит нулём, пустое праздников — нет', pZ.bd_sum === 0 && pZ.bd_cards === 0 && !('bd_parties' in pZ))
  const pV = buildPayload(filled('ohta', { bd_sum: '12000', bd_cards: '12', bd_parties: '2' }))
  check('значения — числами', pV.bd_sum === 12000 && pV.bd_cards === 12 && pV.bd_parties === 2)
  const wk = (over, park = 'piterland') => softWarnings(filled(park, over)).map((w) => w.key).filter((k) => k.startsWith('bd_'))
  check('согласованные числа — жёлтых строк ДР нет', wk({ bd_sum: '12000', bd_cards: '12', bd_parties: '2' }).length === 0)
  check('нули — жёлтых строк ДР нет', wk({ bd_sum: '0', bd_cards: '0' }).length === 0)
  check('только праздники без кассы — жёлтых строк нет (смена сказала, касса пуста)', wk({ bd_parties: '1' }).length === 0)
  check('одна сумма без карт → «bd_pair»', wk({ bd_sum: '6000' }).join() === 'bd_pair')
  check('одни карты без суммы → «bd_pair»', wk({ bd_cards: '6' }).join() === 'bd_pair')
  check('сумма ≠ карты × 1 000 → «bd_sum_cards»', wk({ bd_sum: '7000', bd_cards: '6' }).join() === 'bd_sum_cards')
  check('праздников больше карт → «bd_parties»', wk({ bd_sum: '6000', bd_cards: '6', bd_parties: '7' }).join() === 'bd_parties')
  check('сумма больше выручки → «bd_over_revenue»',
    wk({ bd_sum: '300000', bd_cards: '300' }).includes('bd_over_revenue'))
  const msgs = [{ key: 'bd_pair' }, { key: 'bd_sum_cards', sum: 7000, cards: 6 },
    { key: 'bd_parties', parties: 7, cards: 6 }, { key: 'bd_over_revenue', sum: 300000, revenue: 207249 }].map(softWarnMessage)
  check('тексты жёлтых строк ДР на месте, без NaN/undefined', msgs.every((m) => m && !/NaN|undefined/.test(m)), msgs.length)
  check('праздники > карт: текст объясняет законный случай и разрешает отправить',
    msgs[2].includes('оплатили в другой день') && msgs[2].includes('отправляйте'))
  check('подписи полей дословно (ТЗ §00)',
    FIELD_LABELS.bd_sum === 'Дни рождения: сумма, ₽' && FIELD_LABELS.bd_cards === 'Дни рождения: карт' &&
    FIELD_LABELS.bd_parties === 'Сколько было праздников')
  check('заголовок карты — «Дни рождения»', SECTION_TITLES.birthdays === 'Дни рождения')
  check('вводная строка говорит, что отчёт уйдёт и без этих чисел', BIRTHDAYS_INTRO.includes('Отчёт отправится и без этих чисел'))
  check('хинты ДР для всех трёх парков', ['ohta', 'piterland', 'iyun'].every((p) => BD_FIELDS.every((k) => hintFor(p, k))))
  check('D-106: в текстах ДР нет наших слов', ![BIRTHDAYS_INTRO, ...msgs, TIPS.bd_sum, TIPS.bd_cards, TIPS.bd_parties]
    .some((t) => /конверси|метрик|поток|рычаг|докупк|сесси/i.test(t)))
}

console.log('\n=== useReport: политика повторов (v2.4) ===')
check('две повторные попытки, всего три', RETRY_DELAYS_MS.length === 2, RETRY_DELAYS_MS.join('/'))
check('паузы растут и не нулевые',
  RETRY_DELAYS_MS.every((ms) => ms > 0) && RETRY_DELAYS_MS[1] > RETRY_DELAYS_MS[0])
check('суммарное ожидание повторов ≤ 8 с (человек ждёт у кассы)',
  RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) <= 8000)
check('5xx повторяем', [500, 502, 503, 504].every(isRetriableStatus))
check('429 (квота) и 408/425 повторяем', [408, 425, 429].every(isRetriableStatus))
check('4xx кроме них НЕ повторяем', ![400, 401, 403, 404].some(isRetriableStatus))
check('статуса нет вовсе (сетевой сбой) → повторяем', isRetriableStatus(undefined))
check('потолок ожидания одной попытки 10–60 с (doPost на бэке — 1–3 с)',
  ATTEMPT_TIMEOUT_MS >= 10000 && ATTEMPT_TIMEOUT_MS <= 60000, ATTEMPT_TIMEOUT_MS)

console.log('\n=== i18n: тексты v2.1 §1–2, §4 (дословно из ТЗ) ===')
check('заголовок «Отчёт Дня» (Д заглавная, §4)', L.title === 'Отчёт Дня', L.title)
check('подпись сессий: «Чеков с пополнением (сессии)» (§1)',
  FIELD_LABELS.sessions === 'Чеков с пополнением (сессии)')
check('тултип сессий Охта/Питер — дословно §1 + пример v2.2 §2',
  TIPS.sessions === 'Сколько чеков содержали хотя бы одно пополнение. В один чек могут пробить два пополнения (семья, докидка) — тогда это 1 чек и 2 пополнения. Где взять: в выгрузке „[Финансовые] Выручка“ — сумма колонки „Кол-во чеков“ по строкам „Покупка очков“. Всегда ≤ „Пополнений за день“. Пример: за день 5 чеков, из них 3 с пополнением, в одном — два пополнения. Тогда: Чеков за день 5 · Пополнений 4 · Сессий 3.')
check('тултип сессий Июня — v2.3 §1: префикс «Кол-во чеков»… + сохранённый хвост',
  TIPS_IYUN.sessions === 'Столбец „Кол-во чеков“ по тем же строкам „Покупка очков“ (сложить). Сколько чеков содержали хотя бы одно пополнение. Если в одном чеке два пополнения — это 1 чек и 2 пополнения. Всегда ≤ „Пополнений за день“.')
check('погода: по-прежнему 5 опций, новых не добавлено (§2)', WEATHER_OPTIONS.length === 5)
check('погода: слаги не тронуты (§2)',
  WEATHER_OPTIONS.map((w) => w.value).join(',') === 'sunny,mixed,overcast,rain_part,rain_all')
check('опция mixed: «Переменно / затрудняюсь» (§2)',
  WEATHER_OPTIONS.find((w) => w.value === 'mixed')?.label === 'Переменно / затрудняюсь')
check('тултип погоды дополнен — дословно §2',
  TIPS.weather.endsWith('Если день не подходит точно ни под один вариант — выбирайте „Переменно / затрудняюсь“ и напишите пару слов о погоде в комментарии.'))

console.log('\n=== i18n: тексты v2.2 §1–2 (дословно из ТЗ) ===')
check('строка недельной сверки — без «владельца», с именем выгрузки (v2.2 §1)',
  WEEKLY_NOTE === 'Раз в неделю присылайте выгрузку „[Финансовые] Выручка“ за неделю — контрольная сверка.')
check('в строке сверки нет слова «владельц…»', !/владельц/i.test(WEEKLY_NOTE))
check('вводная строка карты «Чеки» — v2.2 §2 + предложение v2.4 Ф-4, дословно',
  CHECKS_INTRO === 'Все три числа — из выгрузки „[Финансовые] Выручка“ за день, ничего не считаем вручную. Пакеты и пополнения через личный кабинет сюда не входят — деньги за них учитываются отдельно.')
check('хинт receipts — дословно (v2.4 его не трогает, ждёт PIT-48)', FIELD_HINTS.receipts === '= итоговое „Кол-во чеков“ дня в выгрузке')
check('хинт topups — дословно (v2.4 Ф-4)', FIELD_HINTS.topups === '= Σ „Кол-во“ по строкам „Очки-Деньги“ с операцией „Покупка очков“')
check('хинт sessions — дословно (v2.4 Ф-4)', FIELD_HINTS.sessions === '= Σ „Кол-во чеков“ по тем же строкам „Очки-Деньги“')
check('hintFor: Охта/Питер отдают хинты receipts/topups/sessions',
  hintFor('ohta', 'receipts') === FIELD_HINTS.receipts &&
  hintFor('piterland', 'sessions') === FIELD_HINTS.sessions)
check('hintFor: Июнь отдаёт хинты topups/sessions (v2.3 §2), receipts у него нет',
  hintFor('iyun', 'topups') === FIELD_HINTS.topups &&
  hintFor('iyun', 'sessions') === FIELD_HINTS.sessions)
check('hintFor: полям вне карты «Чеки» хинтов нет',
  hintFor('ohta', 'revenue') === '' && hintFor('piterland', 'weather') === '')

console.log('\n=== i18n: тексты v2.3 §1–2, §4 (дословно из ТЗ) ===')
check('тултип topups Июня — операционный, БЕЗ «1 пополнение = 1 чек» (§1)',
  !/1 пополнение = 1 чек/.test(TIPS_IYUN.topups) &&
  TIPS_IYUN.topups === 'Количество пополнений баланса за день: столбец „Кол-во“ ТОЛЬКО по строкам операции „Покупка очков“ в отчёте „Выручка“ (обычно две строки — безнал и наличные: сложить). НЕ итоговая строка отчёта и НЕ столбец „Кол-во чеков“.')
check('тултип сессий Июня начинается со «Столбец „Кол-во чеков“…» (§1)',
  TIPS_IYUN.sessions.startsWith('Столбец „Кол-во чеков“ по тем же строкам „Покупка очков“ (сложить). '))
check('хвост сессий Июня («1 чек — 2 пополнения») сохранён (§1)',
  TIPS_IYUN.sessions.includes('Если в одном чеке два пополнения — это 1 чек и 2 пополнения. Всегда ≤ „Пополнений за день“.'))
check('вводная карты «Чеки» Июня — v2.3 §2 + предложение v2.4 Ф-4, дословно',
  CHECKS_INTRO_IYUN === 'Оба числа — из отчёта „Выручка“, строки „Покупка очков“. Итоговую строку отчёта не используем. Пакеты и пополнения через личный кабинет сюда не входят — деньги за них учитываются отдельно.')
check('checksIntroFor: Июнь → своя вводная; Охта/Питер → общая; пусто → «»',
  checksIntroFor('iyun') === CHECKS_INTRO_IYUN &&
  checksIntroFor('ohta') === CHECKS_INTRO && checksIntroFor('') === '')
check('текст предупреждения ср.пополнения — дословно (v2.4 Ф-5: коридор парка)',
  softWarnMessage({ key: 'avg_topup', value: 482, min: 580, max: 990 }) ===
    `Проверьте пополнения: выручка ÷ пополнения = ${rub(482)}, обычно у вас от 580 до 990.`)
check('текст предупреждения сессий — дословно (§4)',
  softWarnMessage({ key: 'topups_per_session' }) ===
    'Проверьте сессии: пополнений обычно лишь немного больше, чем чеков с пополнением (~1,1).')

// ═══════════════ 2. Живой рендер в jsdom ═══════════════
console.log('\n=== jsdom: сборка тестового бандла ===')
const tmp = resolve(root, '.tmp-verify-report')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
writeFileSync(resolve(tmp, 'entry.js'), `
export { default as DailyReportScreen } from '${root}/src/screens/DailyReportScreen.vue'
export { default as ReporterShell } from '${root}/src/components/report/ReporterShell.vue'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
export { acceptedTime } from '${root}/src/i18n/report.js'
`)

// jsdom-глобали ДО любых импортов vite/vue: runtime-dom кэширует `document`
// в момент загрузки модуля (plugin-vue тянет vue уже на этапе сборки).
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://mihail-izumov.github.io/boom-cmd/',
  pretendToBeVisual: true,
})
global.window = dom.window
global.document = dom.window.document
try { Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true }) } catch { /* Node 22: оставляем встроенный navigator */ }
global.Element = dom.window.Element
global.SVGElement = dom.window.SVGElement
global.HTMLElement = dom.window.HTMLElement
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)

const { build } = await import('vite')
const vuePlugin = (await import('@vitejs/plugin-vue')).default
await build({
  configFile: false,
  root,
  logLevel: 'error',
  plugins: [vuePlugin()],
  define: {
    // фиктивные URL: реальных нет и не должно быть (красный флаг ТЗ §8)
    'import.meta.env.VITE_REPORT_API': JSON.stringify('https://mock.invalid/report'),
    'import.meta.env.VITE_PROJECTS_API': JSON.stringify('https://mock.invalid/gate'),
    // NET-152 Ф-3: форма читает дневной слой, чтобы спросить про пересдачу
    'import.meta.env.VITE_DAILY_API': JSON.stringify('https://mock.invalid/daily'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: { entry: resolve(tmp, 'entry.js'), formats: ['es'], fileName: 'bundle' },
    outDir: tmp,
    emptyOutDir: false,
    rollupOptions: { external: ['vue'] },
    minify: false,
  },
})
console.log('✓  lib-сборка готова')

// мок fetch: GET → гейт «ок» или дневной слой (?action=daily), POST → сценарий из postMode
let postMode = 'ok' // 'ok' | 'reject' | 'neterror' | 'flaky'
// NET-152 Ф-3: дневной слой для формы. По умолчанию пуст — старые сценарии идут без
// вопроса о пересдаче. 'fail' — осознанный 404 (не повторяемый), чтобы проверить, что
// сбой ЧТЕНИЯ не мешает отправке, и не ждать пауз политики повторов.
let dailyPayload = { updated: null, sets: {} }
let dailyMode = 'ok' // 'ok' | 'fail'
const getUrls = []
// v2.4: сколько первых POST-ов режим 'flaky' завалит сетевой ошибкой, прежде чем
// ответить успехом. Так воспроизводится утро 05.08: связь подвела, повтор прошёл.
let postFailsLeft = 0
const postedBodies = []
global.fetch = async (url, opts = {}) => {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj })
  if ((opts.method || 'GET') === 'POST') {
    postedBodies.push(String(opts.body || ''))
    if (postMode === 'neterror') return { ok: false, status: 500, json: async () => ({}) }
    if (postMode === 'reject') return json({ ok: false, error: 'bad key' })
    if (postMode === 'flaky' && postFailsLeft > 0) {
      postFailsLeft--
      throw new TypeError('Failed to fetch') // ровно то, чем падает fetch без сети
    }
    // v3.16 (NET-34): бэк отдаёт время, которое РЕАЛЬНО записалось. 'ok-old' —
    // деплой до v3.16: полей нет, экран обязан выглядеть как раньше.
    if (postMode === 'ok-old') return json({ ok: true })
    return json({
      ok: true,
      submitted_at: '2026-08-07T06:42:13+03:00',
      submitted_msk: '2026-08-07 06:42:13',
    })
  }
  const u = String(url)
  getUrls.push(u)
  if (u.includes('action=daily')) {
    if (dailyMode === 'fail') return { ok: false, status: 404, json: async () => ({}) }
    return json(dailyPayload)
  }
  // NET-152: фраза репортёра (D-12 §9-A) — гейт отвечает ролью, данных не даёт
  if (u.includes('key=reporter-phrase')) return json({ ok: true, role: 'reporter' })
  return json({}) // гейт: 200 без error → фраза ок, роль owner
}

// консоль: ловим [Vue warn] (ошибки рендера) — заведомо провал
const vueWarns = []
const origWarn = console.warn
console.warn = (...a) => {
  const s = a.join(' ')
  if (s.includes('[Vue warn]')) vueWarns.push(s)
  else if (!s.startsWith('report submit failed') && !s.startsWith('report submit retry')) origWarn(...a)
}

const bundle = await import(pathToFileURL(resolve(tmp, 'bundle.js')).href)
const { createApp, nextTick } = await import('vue')

// «входим» фразой, чтобы memKey был установлен (нужен для POST)
const ak = bundle.useAccessKey()
await ak.submitKey('test-phrase')

const BAD = /NaN|undefined|Infinity/
function mount(comp) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(comp)
  app.config.warnHandler = (msg) => vueWarns.push(`[Vue warn] ${msg}`)
  app.mount(el)
  return { el, app }
}
async function fire(el, type) {
  el.dispatchEvent(new dom.window.Event(type, { bubbles: true }))
  await nextTick()
}
async function setInput(root, id, value) {
  const el = root.querySelector(`#${id}`)
  el.value = value
  await fire(el, el.tagName === 'SELECT' ? 'change' : 'input')
}
const submitBtn = (root) => root.querySelector('button[type="submit"]')
// v2: «Отправить» тапабельна всегда (скролл к проблеме), блокировка — aria-disabled
const btnBlocked = (root) => submitBtn(root).getAttribute('aria-disabled') === 'true'
// 25.09: в поле число видно с разделителем тысяч («100 000»), в модели — только цифры.
const digitsOf = (s) => String(s ?? '').replace(/\D+/g, '')

console.log('\n=== jsdom: DailyReportScreen — happy path (Питерленд) ===')
{
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  check('рендер без NaN/undefined/Infinity', !BAD.test(el.textContent))
  check('парк и дата на месте', !!el.querySelector('#rep-park') && !!el.querySelector('#rep-date'))
  check('дата по умолчанию — вчера', el.querySelector('#rep-date').value === yesterdayISO(new Date()))
  check('до выбора парка полей и кнопки нет', !el.querySelector('#rep-revenue') && !submitBtn(el))

  await setInput(el, 'rep-park', 'piterland')
  check('после выбора парка поля появились', !!el.querySelector('#rep-revenue') && !!el.querySelector('#rep-weather'))
  check('смысловые карты: Деньги/Игроки/Чеки/День на месте',
    ['Деньги', 'Игроки', 'Чеки', 'День'].every((t) =>
      [...el.querySelectorAll('h2')].some((h) => h.textContent.trim() === t)))
  check('divide-y между полями убран (§1)', !el.querySelector('form .divide-y'))
  check('разделителя border-t в форме нет — дата отделена отступом (v2.1 §3)',
    !el.querySelector('form .border-t'))
  check('поле site (Личный кабинет) есть у Питера', !!el.querySelector('#rep-site'))
  check('подпись site дословно', el.textContent.includes('Личный кабинет (сайт), ₽'))
  check('receipts/topups/sessions есть у Питера (§3)',
    !!el.querySelector('#rep-receipts') && !!el.querySelector('#rep-topups') && !!el.querySelector('#rep-sessions'))
  check('полей Июня (promo/отзывы) у Питера НЕТ', !el.querySelector('#rep-promo') && !el.querySelector('#rep-rev_y'))
  check('«игроки», не «посетители» (§4)',
    el.textContent.includes('Игроков всего') && !el.textContent.includes('Посетителей'))
  check('блока-напоминания §5.8 v1 БОЛЬШЕ НЕТ', !el.textContent.includes('Не забудьте прислать выгрузку'))
  check('тихая строка недельной сверки — новый текст v2.2 §1',
    el.textContent.includes('Раз в неделю присылайте выгрузку „[Финансовые] Выручка“ за неделю — контрольная сверка.'))
  check('старого текста сверки («владельцу») больше нет', !el.textContent.includes('владельцу'))

  // v2.2 §2: вводная строка карты «Чеки» + постоянные хинты (видны БЕЗ тултипов)
  check('вводная строка карты «Чеки» на месте (v2.2 §2)',
    el.textContent.includes('Все три числа — из выгрузки „[Финансовые] Выручка“ за день, ничего не считаем вручную.'))
  check('хинт под «Чеков за день» виден без тултипа',
    el.textContent.includes('= итоговое „Кол-во чеков“ дня в выгрузке'))
  check('хинт под «Пополнений за день» виден без тултипа (текст v2.4 Ф-4)',
    el.textContent.includes('= Σ „Кол-во“ по строкам „Очки-Деньги“ с операцией „Покупка очков“'))
  check('хинт под «Чеков с пополнением (сессии)» виден без тултипа (текст v2.4 Ф-4)',
    el.textContent.includes('= Σ „Кол-во чеков“ по тем же строкам „Очки-Деньги“'))
  // v2.5: хинты «= …» есть и в карте «Дни рождения» — считаем внутри карты «Чеки»
  const checksCard = [...el.querySelectorAll('form section')].find((sec) => sec.querySelector('h2')?.textContent.trim() === 'Чеки')
  check('хинты именно под полями карты «Чеки» — ровно 3 штуки',
    !!checksCard && [...checksCard.querySelectorAll('p')].filter((p) => p.textContent.trim().startsWith('= ')).length === 3)
  check('числовые инпуты: inputmode=numeric, type=text (без спиннеров)',
    el.querySelector('#rep-site').getAttribute('inputmode') === 'numeric' &&
    el.querySelector('#rep-site').getAttribute('type') === 'text')
  check('кнопка есть и «заблокирована» (aria-disabled)', submitBtn(el) && btnBlocked(el))
  check('сводки «Проверь себя» на пустой форме нет', !el.textContent.includes('Проверь себя'))

  // тултипы дословно (v2 §2)
  const tip = async (label) => {
    const b = el.querySelector(`button[aria-label="Пояснение: ${label}"]`)
    if (b) await fire(b, 'click')
    return !!b
  }
  check('ⓘ у выручки есть', await tip('Общая выручка, ₽'))
  check('тултип выручки дополнен проверкой трёх слагаемых',
    el.textContent.includes('Проверка: безнал + нал + личный кабинет = выручка.'))
  check('ⓘ у безнала есть', await tip('Безналичные, ₽'))
  check('тултип безнала: «НА КАССАХ … своё поле» дословно',
    el.textContent.includes('Оплаты банковской картой НА КАССАХ, за день, из системы. Пополнения через личный кабинет сюда не входят — у них своё поле.'))
  check('ⓘ у ЛК есть', await tip('Личный кабинет (сайт), ₽'))
  check('тултип site: «Онлайн-касса C2P … ставьте 0» дословно',
    el.textContent.includes('Пополнения через личный кабинет на сайте (в выгрузке — строки „Онлайн-касса C2P“). Если канала в парке нет или сегодня ноль — ставьте 0.'))
  check('ⓘ у чеков есть', await tip('Чеков за день'))
  check('тултип receipts §3 дословно',
    el.textContent.includes('итоговое „Кол-во чеков“ дня.'))
  check('ⓘ у игроков есть', await tip('Игроков всего'))
  check('тултип игроков: «сколько игроков пришло»',
    el.textContent.includes('Счётчик визитов за день: сколько игроков пришло. Это НЕ количество чеков.'))

  // v2.1 §1–2: сессии и погода
  check('подпись сессий в форме: «Чеков с пополнением (сессии)» (v2.1 §1)',
    el.textContent.includes('Чеков с пополнением (сессии)'))
  check('ⓘ у сессий есть (по новой подписи)', await tip('Чеков с пополнением (сессии)'))
  check('тултип сессий Питера: «семья, докидка» + источник из выгрузки (v2.1 §1)',
    el.textContent.includes('В один чек могут пробить два пополнения (семья, докидка) — тогда это 1 чек и 2 пополнения.') &&
    el.textContent.includes('Где взять: в выгрузке „[Финансовые] Выручка“ — сумма колонки „Кол-во чеков“ по строкам „Покупка очков“. Всегда ≤ „Пополнений за день“.'))
  check('тултип сессий: числовой пример v2.2 §2 дословно',
    el.textContent.includes('Пример: за день 5 чеков, из них 3 с пополнением, в одном — два пополнения. Тогда: Чеков за день 5 · Пополнений 4 · Сессий 3.'))
  check('опция погоды в селекте: «Переменно / затрудняюсь» (v2.1 §2)',
    [...el.querySelectorAll('#rep-weather option')].some((o) => o.value === 'mixed' && o.textContent.trim() === 'Переменно / затрудняюсь'))
  check('в селекте погоды 5 опций + placeholder (новых нет, v2.1 §2)',
    el.querySelectorAll('#rep-weather option').length === 6)
  check('ⓘ у погоды есть', await tip('Погода'))
  check('тултип погоды дополнен про «Переменно / затрудняюсь» (v2.1 §2)',
    el.textContent.includes('Если день не подходит точно ни под один вариант — выбирайте „Переменно / затрудняюсь“ и напишите пару слов о погоде в комментарии.'))

  // тап «Отправить» на невалидной форме → POST НЕ уходит (скролл к проблеме)
  postedBodies.length = 0
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  check('тап по «Отправить» с ошибками POST не шлёт (§1)', postedBodies.length === 0)

  await setInput(el, 'rep-revenue', '207249')
  await setInput(el, 'rep-cashless', '147834')
  await setInput(el, 'rep-cash', '44415')
  await setInput(el, 'rep-site', '15000')
  await setInput(el, 'rep-visitors_total', '300')
  await setInput(el, 'rep-visitors_new', '40')
  await setInput(el, 'rep-receipts', '265')
  await setInput(el, 'rep-topups', '180')
  await setInput(el, 'rep-sessions', '160')
  check('без погоды — ещё заблокирована', btnBlocked(el))
  await setInput(el, 'rep-weather', 'rain_all')
  check('валидация зелёная → кнопка активна', !btnBlocked(el))

  // живая сводка «Проверь себя» (§5)
  check('сводка появилась', el.textContent.includes('Проверь себя'))
  check('средний чек ≈ 782 ₽', el.textContent.includes('≈ 782 ₽'))
  check('чек/пополнение ≈ 1 151 ₽ (пробел-разделитель тысяч из i18n)',
    el.textContent.includes(rub(1151)), JSON.stringify(rub(1151)))
  check('попол/сессию 1,13 (2 знака, запятая)', el.textContent.includes('1,13'))
  check('доли: нал 21 % · ЛК 7 % · новых 13 %',
    el.textContent.includes('21 %') && el.textContent.includes('7 %') && el.textContent.includes('13 %'))

  // расхождение суммы из ТРЁХ слагаемых
  await setInput(el, 'rep-site', '15001')
  check('сумма разошлась → кнопка заблокирована', btnBlocked(el))
  check('текст §2: «Безнал + нал + личный кабинет = … Разница …»',
    el.textContent.includes('Безнал + нал + личный кабинет =') &&
    el.textContent.includes('Разница') && el.textContent.includes('проверьте цифры'))
  postedBodies.length = 0
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  check('с расхождением суммы POST не уходит', postedBodies.length === 0)
  await setInput(el, 'rep-site', '15000')

  // sessions > topups у Питера
  await setInput(el, 'rep-sessions', '181')
  check('Питер: sessions > topups блокирует + текст', btnBlocked(el) &&
    el.textContent.includes('Чеков с пополнением не может быть больше'))
  await setInput(el, 'rep-sessions', '160')

  // topups > receipts — с v2.4 (Ф-1) блокирует: чеков меньше, чем пополнений, не бывает
  await setInput(el, 'rep-topups', '300')
  await setInput(el, 'rep-sessions', '290')
  check('topups > receipts блокирует (v2.4 Ф-1) + текст «меньше, чем пополнений»',
    btnBlocked(el) && el.textContent.includes('Чеков за день (265) меньше, чем пополнений (300).'))
  await setInput(el, 'rep-topups', '180')
  await setInput(el, 'rep-sessions', '160')

  // не-вчера: жёлтая плашка, не блокирует
  await setInput(el, 'rep-date', todayISO(new Date()))
  check('не-вчера: жёлтая плашка дословно', el.textContent.includes('Вы вносите отчёт не за вчера — проверьте дату'))
  check('не-вчера НЕ блокирует', !btnBlocked(el))
  await setInput(el, 'rep-date', yesterdayISO(new Date()))

  // отправка: успех
  postMode = 'ok'
  postedBodies.length = 0
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  check('POST ушёл ровно один', postedBodies.length === 1)
  const body = JSON.parse(postedBodies[0] || '{}')
  check('в теле — гейт-ключ key', body.key === 'test-phrase')
  check('тело по контракту §6 (числа числами)',
    body.park === 'piterland' && body.revenue === 207249 && body.cashless === 147834 &&
    body.cash === 44415 && body.site === 15000 && body.visitors_total === 300 &&
    body.visitors_new === 40 && body.receipts === 265 && body.topups === 180 &&
    body.sessions === 160 && body.weather === 'rain_all')
  check('производных §5 в теле НЕТ',
    !('avg_check' in body) && !('cash_share' in body) && !('new_share' in body))
  check('экран успеха: «Отчёт за … принят»', el.textContent.includes('принят'))
  check('кнопка «Внести ещё»', el.textContent.includes('Внести ещё'))
  // NET-34 §3.3: время приёма — от БЭКА. До этой правки управляющий узнавал его
  // только из сводки на следующий день, и расхождение на час прожило две недели.
  const at = el.querySelector('[data-test="report-accepted-at"]')
  check('экран успеха показывает записанное время', !!at && at.textContent.includes('06:42'), at?.textContent)
  check('время подписано как МСК и как ЗАПИСАННОЕ, а не «вы отправили»',
    !!at && at.textContent.includes('МСК') && at.textContent.includes('Записано'), at?.textContent)
  check('секунды на экран не выносим — минут достаточно',
    !!at && !at.textContent.includes('06:42:13'), at?.textContent)
  app.unmount()
}

console.log('\n=== jsdom: время приёма — деградация и источник (NET-34 §3.3) ===')
{
  // Старый деплой бэка (до v3.16) полей не отдаёт: экран успеха обязан выглядеть
  // ровно как раньше — без пустой строки, прочерка и «undefined».
  postMode = 'ok-old'
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await setInput(el, 'rep-park', 'iyun')
  await setInput(el, 'rep-revenue', '1000')
  await setInput(el, 'rep-cashless', '600')
  await setInput(el, 'rep-cash', '400')
  await setInput(el, 'rep-site', '0')
  await setInput(el, 'rep-visitors_total', '10')
  await setInput(el, 'rep-visitors_new', '2')
  await setInput(el, 'rep-topups', '5')
  await setInput(el, 'rep-sessions', '4')
  await setInput(el, 'rep-weather', 'sunny')
  await setInput(el, 'rep-date', yesterdayISO(new Date()))
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  check('старый бэк: отчёт принят',
    !!el.querySelector('[data-test="report-success-title"]'), el.textContent.slice(0, 160))
  check('старый бэк: строки времени НЕТ (а не пустая/«undefined»)',
    !el.querySelector('[data-test="report-accepted-at"]') &&
    !el.textContent.includes('undefined') && !el.textContent.includes('NaN'))
  app.unmount()
  postMode = 'ok'
}

console.log('\n=== acceptedTime: разбор штампа бэка ===')
{
  const { acceptedTime } = bundle
  check('«2026-08-07 06:42:13» → 06:42', acceptedTime('2026-08-07 06:42:13') === '06:42')
  check('ISO с T тоже разбираем', acceptedTime('2026-08-07T06:42:13+03:00') === '06:42')
  // Час — цена вердикта «в срок / просрочка» после переезда дедлайна на 06:00,
  // поэтому подставлять своё время или показывать половину строки нельзя.
  check('чужой формат → пусто, а не «половина строки»',
    acceptedTime('07.08.2026 6:42') === '' && acceptedTime('шесть сорок') === '')
  check('пусто/undefined/null → пусто',
    acceptedTime('') === '' && acceptedTime(undefined) === '' && acceptedTime(null) === '')
  check('полночь не теряется', acceptedTime('2026-08-07 00:05:00') === '00:05')
}

console.log('\n=== jsdom: ошибка бэка — данные не теряются ===')
{
  postMode = 'reject'
  postedBodies.length = 0
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await setInput(el, 'rep-park', 'ohta')
  check('у Охты receipts есть', !!el.querySelector('#rep-receipts'))
  await setInput(el, 'rep-revenue', '100000')
  await setInput(el, 'rep-cashless', '60000')
  await setInput(el, 'rep-cash', '30000')
  await setInput(el, 'rep-site', '10000')
  await setInput(el, 'rep-visitors_total', '150')
  await setInput(el, 'rep-visitors_new', '10')
  await setInput(el, 'rep-receipts', '140')
  await setInput(el, 'rep-topups', '120')
  await setInput(el, 'rep-sessions', '110')
  await setInput(el, 'rep-weather', 'sunny')
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  check('красная плашка дословно', el.textContent.includes('Не отправилось — попробуйте ещё раз или пришлите отчёт как обычно'))
  check('данные формы НЕ потеряны', digitsOf(el.querySelector('#rep-revenue').value) === '100000' &&
    digitsOf(el.querySelector('#rep-site').value) === '10000' && el.querySelector('#rep-park').value === 'ohta')
  check('успеха нет', !el.textContent.includes('принят'))
  // v2.4: осознанный отказ бэка повторять бессмысленно — тело запроса валиднее
  // не станет. Ровно тот же список причин, по которым очередь сигналов ставит dead.
  check('отказ бэка НЕ повторяется — POST ровно один', postedBodies.length === 1, postedBodies.length)
  // v2.5: причина в теле запроса или ключе — VPN тут ни при чём, совет был бы ложью.
  check('при отказе бэка подсказки про VPN НЕТ', !el.querySelector('[data-test="report-send-hint"]'))
  app.unmount()
}

// v2.4: заполнение формы Охты до валидного состояния — нужно трижды ниже.
async function fillOhta(el) {
  await setInput(el, 'rep-park', 'ohta')
  await setInput(el, 'rep-revenue', '100000')
  await setInput(el, 'rep-cashless', '60000')
  await setInput(el, 'rep-cash', '30000')
  await setInput(el, 'rep-site', '10000')
  await setInput(el, 'rep-visitors_total', '150')
  await setInput(el, 'rep-visitors_new', '10')
  await setInput(el, 'rep-receipts', '140')
  await setInput(el, 'rep-topups', '120')
  await setInput(el, 'rep-sessions', '110')
  await setInput(el, 'rep-weather', 'sunny')
}

console.log('\n=== jsdom: v2.4 — связь подвела, повтор прошёл ===')
{
  // Утро 05.08: два POST-а умерли по дороге к Google (журнал выполнений Apps
  // Script не показал ни одного запроса), третий прошёл. Раньше это давало
  // красную плашку на первой же осечке.
  postMode = 'flaky'
  postFailsLeft = 1
  postedBodies.length = 0
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await fillOhta(el)
  await fire(el.querySelector('form'), 'submit')

  // во время паузы перед 2-й попыткой кнопка обязана говорить, что происходит
  await new Promise((r) => setTimeout(r, 200))
  await nextTick()
  check('во время паузы кнопка: «Связь подвела — пробуем ещё…»',
    submitBtn(el).textContent.includes(L.sending_retry))
  check('во время паузы красной плашки НЕТ (человека не пугаем раньше времени)',
    !el.textContent.includes(L.send_error))

  await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[0] + 400))
  await nextTick()
  check('ушло ровно два POST-а (первый упал, второй прошёл)', postedBodies.length === 2, postedBodies.length)
  check('тела обеих попыток одинаковы', postedBodies[0] === postedBodies[1])
  check('экран успеха после повтора', el.textContent.includes('принят'))
  check('красной плашки нет', !el.textContent.includes(L.send_error))
  app.unmount()
}

console.log('\n=== jsdom: v2.4 — связь легла совсем: три попытки и честная плашка ===')
{
  postMode = 'neterror' // 500 на каждую попытку
  postedBodies.length = 0
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await fillOhta(el)
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) + 600))
  await nextTick()
  check('попыток ровно три, дальше не мучаем', postedBodies.length === 3, postedBodies.length)
  check('красная плашка дословно', el.textContent.includes(L.send_error))
  // v2.5: транспортная осечка → подсказка про VPN прямо в плашке.
  const hint = el.querySelector('[data-test="report-send-hint"]')
  check('подсказка про VPN в плашке, дословно', !!hint && hint.textContent.includes(NET_HINTS.vpn))
  check('данные формы НЕ потеряны', digitsOf(el.querySelector('#rep-revenue').value) === '100000' &&
    digitsOf(el.querySelector('#rep-site').value) === '10000')
  check('кнопка вернулась в «Отправить» (не залипла в «Отправляем…»)',
    submitBtn(el).textContent.includes(L.submit) && !submitBtn(el).textContent.includes(L.sending))
  check('успеха нет', !el.textContent.includes('принят'))
  app.unmount()
}

console.log('\n=== jsdom: Июнь — свои поля, receipts нет ===')
{
  postMode = 'ok'
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await setInput(el, 'rep-park', 'iyun')
  check('поля Июня появились', !!el.querySelector('#rep-topups') && !!el.querySelector('#rep-sessions') && !!el.querySelector('#rep-promo'))
  check('receipts у Июня НЕТ', !el.querySelector('#rep-receipts'))
  check('site у Июня есть (все парки)', !!el.querySelector('#rep-site'))
  check('тихой строки недельной сверки у Июня НЕТ',
    !el.textContent.includes('Раз в неделю присылайте'))
  // v2.2 §2: у Июня выгрузки нет — ни вводной строки, ни хинтов, ни примера
  check('у Июня — своя вводная «Оба числа…» (v2.3 §2), НЕ «Все три числа»',
    el.textContent.includes('Оба числа — из отчёта „Выручка“, строки „Покупка очков“. Итоговую строку отчёта не используем.') &&
    !el.textContent.includes('Все три числа — из выгрузки'))
  check('у Июня — хинты topups/sessions «= Σ …» (v2.3 §2), receipts-хинта нет',
    el.textContent.includes(FIELD_HINTS.topups) &&
    el.textContent.includes(FIELD_HINTS.sessions) &&
    !el.textContent.includes('= итоговое „Кол-во чеков“ дня в выгрузке'))
  // v2.5: хинты «= …» есть и в карте «Дни рождения» — считаем внутри карты «Чеки»
  const checksCardIyun = [...el.querySelectorAll('form section')].find((sec) => sec.querySelector('h2')?.textContent.trim() === 'Чеки')
  check('у Июня ровно 2 хинта под полями карты «Чеки» (v2.3 §2)',
    !!checksCardIyun && [...checksCardIyun.querySelectorAll('p')].filter((p) => p.textContent.trim().startsWith('= ')).length === 2)
  // тултипы topups/sessions у Июня — v1 («как раньше», §1)
  const tipBtn = el.querySelector('button[aria-label="Пояснение: Пополнений за день"]')
  await fire(tipBtn, 'click')
  check('тултип topups Июня — операционный (v2.3 §1), без «1 пополнение = 1 чек»',
    el.textContent.includes('столбец „Кол-во“ ТОЛЬКО по строкам операции „Покупка очков“') &&
    el.textContent.includes('НЕ итоговая строка отчёта и НЕ столбец „Кол-во чеков“.') &&
    !el.textContent.includes('1 пополнение = 1 чек'))
  // v2.1 §1: сессии Июня — свой тултип (без выгрузки), подпись общая
  const sesTipBtn = el.querySelector('button[aria-label="Пояснение: Чеков с пополнением (сессии)"]')
  await fire(sesTipBtn, 'click')
  check('тултип сессий Июня — v2.3 §1: префикс «Столбец „Кол-во чеков“…» + хвост, без «Где взять»',
    el.textContent.includes('Столбец „Кол-во чеков“ по тем же строкам „Покупка очков“ (сложить). Сколько чеков содержали хотя бы одно пополнение.') &&
    el.textContent.includes('Всегда ≤ „Пополнений за день“.') &&
    !el.textContent.includes('Где взять'))
  check('примера v2.2 в тултипе сессий Июня НЕТ (тултипы Июня не трогали)',
    !el.textContent.includes('Пример: за день 5 чеков'))
  await setInput(el, 'rep-revenue', '100000')
  await setInput(el, 'rep-cashless', '60000')
  await setInput(el, 'rep-cash', '30000')
  await setInput(el, 'rep-site', '10000')
  await setInput(el, 'rep-visitors_total', '150')
  await setInput(el, 'rep-visitors_new', '10')
  await setInput(el, 'rep-weather', 'mixed')
  check('без topups/sessions — заблокирована', btnBlocked(el))
  await setInput(el, 'rep-topups', '120')
  await setInput(el, 'rep-sessions', '121')
  check('sessions > topups — заблокирована + текст', btnBlocked(el) &&
    el.textContent.includes('Чеков с пополнением не может быть больше'))
  await setInput(el, 'rep-sessions', '110')
  check('sessions ≤ topups — активна', !btnBlocked(el))
  // Июнь (v2.3 §3): revenue÷topups показывается как «Ср. пополнение»; дубля нет
  check('Июнь: плитка «Ср. пополнение» (v2.3 §3), значение = revenue ÷ topups',
    el.textContent.includes('Ср. пополнение') &&
    el.textContent.includes(summaryValue('avg_check', 100000 / 120)))
  check('Июнь: «Средний чек» не показывается (receipts нет)', !el.textContent.includes('Средний чек'))
  check('Июнь: дубля «Чек / пополнение» нет', !el.textContent.includes('Чек / пополнение'))
  // §4 мягкое предупреждение: ввод из итоговой строки (ср.пополнение <500 ₽)
  await setInput(el, 'rep-topups', '260')
  await setInput(el, 'rep-sessions', '200')
  check('Июнь: ср.пополнение <580 ₽ → жёлтое предупреждение видно (§4, коридор Июня v2.4 Ф-5)',
    el.textContent.includes('Проверьте пополнения: выручка ÷ пополнения =') &&
    el.textContent.includes('обычно у вас от 580 до 990.'))
  check('§4: предупреждение НЕ блокирует кнопку (aria-disabled=false)', !btnBlocked(el))
  await setInput(el, 'rep-topups', '120')
  await setInput(el, 'rep-sessions', '110')
  check('Июнь: при нормальных числах предупреждения нет (§4)',
    !el.textContent.includes('Проверьте пополнения'))
  // payload Июня
  postedBodies.length = 0
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  const body = JSON.parse(postedBodies[0] || '{}')
  check('Июнь: тело §6 — site есть, receipts нет',
    body.park === 'iyun' && body.site === 10000 && !('receipts' in body) &&
    body.topups === 120 && body.sessions === 110)
  app.unmount()
}

// ═══════════════ v2.4 · NET-152 — приёмка §8 живым рендером ═══════════════
// Заполнение формы валидными числами парка. Охта/Питер: 85 пополнений, выручка 100 000
// (1 176 ₽ — внутри коридоров Охты и Питера), чеков 112 (1,32), сессий 80 (1,06).
// Июнь: 88 пополнений, выручка 66 000 (750 ₽ — внутри коридора Июня), сессий 87.
async function fillPark(el, park, over = {}) {
  const base = park === 'iyun'
    ? { revenue: '66000', cashless: '40000', cash: '20000', site: '6000',
        visitors_total: '150', visitors_new: '10', topups: '88', sessions: '87' }
    : { revenue: '100000', cashless: '60000', cash: '30000', site: '10000',
        visitors_total: '150', visitors_new: '10', receipts: '112', topups: '85', sessions: '80' }
  await setInput(el, 'rep-park', park)
  for (const [k, v] of Object.entries({ ...base, ...over })) await setInput(el, `rep-${k}`, v)
  await setInput(el, 'rep-weather', 'sunny')
}
const settle = async (ms = 30) => { await new Promise((r) => setTimeout(r, ms)); await nextTick() }
const submitForm = async (el) => { await fire(el.querySelector('form'), 'submit'); await settle() }
const warnText = (el) => el.querySelector('[role="status"]')?.textContent || ''
const redBorder = (el, id) => el.querySelector(`#${id}`).className.includes('--negative')
const dialog = () => document.querySelector('[data-test="report-resubmit"]')
// Дата «пересдачи»: три дня назад — не вчера (форма подставляет вчера сама), не будущее.
const RESUB_DATE = (() => { const d = new Date(); d.setDate(d.getDate() - 3); return toISODate(d) })()

console.log('\n=== NET-152 · §8 п.1–4: Охта, чеки ÷ пополнения (Ф-1) ===')
{
  dailyPayload = { updated: null, sets: {} }
  postMode = 'ok'
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  await fillPark(el, 'ohta', { receipts: '778' })
  check('п.1 Охта 778 при 85 — отправка заблокирована', btnBlocked(el))
  check('п.1 текст §2 («больше 3,0») — дословно',
    el.textContent.includes('Чеков за день (778) в 9,2 раз больше пополнений (85). Обычно их больше в полтора раза. Проверьте число по отчёту.'))
  check('п.1 подсвечены оба числа пары', redBorder(el, 'rep-receipts') && redBorder(el, 'rep-topups'))
  check('п.1 жёлтая строка про чеки не дублирует красную', !warnText(el).includes('Проверьте чеки'))
  postedBodies.length = 0
  await submitForm(el)
  check('п.1 тап «Отправить» — POST не ушёл', postedBodies.length === 0)

  await setInput(el, 'rep-receipts', '80')
  check('п.2 Охта 80 при 85 — заблокирована', btnBlocked(el))
  check('п.2 текст §2 («меньше 1,0») — дословно',
    el.textContent.includes('Чеков за день (80) меньше, чем пополнений (85). Так не бывает: каждое пополнение — это чек. Проверьте оба числа по отчёту.'))

  await setInput(el, 'rep-receipts', '112')
  check('п.3 Охта 112 при 85 — кнопка активна', !btnBlocked(el))
  check('п.3 без предупреждений (жёлтой строки нет)', !el.querySelector('[role="status"]'), warnText(el))
  check('п.3 красной плашки нет', !el.textContent.includes('Чеков за день ('))
  check('п.3 подсветки нет', !redBorder(el, 'rep-receipts') && !redBorder(el, 'rep-topups'))

  await setInput(el, 'rep-receipts', '150')
  check('п.4 Охта 150 при 85 — проходит', !btnBlocked(el))
  check('п.4 жёлтая строка §2 — дословно, K = 1,8',
    warnText(el).includes('Проверьте чеки: на 10 пополнений у вас обычно от 11 до 16 чеков, сейчас 1,8.'), warnText(el))
  postedBodies.length = 0
  await submitForm(el)
  check('п.4 отправка уходит (жёлтая не блокирует), вопроса о пересдаче нет — дня в слое нет',
    postedBodies.length === 1 && !dialog() && el.textContent.includes('принят'))
  check('п.4 в теле POST чеки и пополнения как введены', (() => {
    const b = JSON.parse(postedBodies[0] || '{}')
    return b.receipts === 150 && b.topups === 85 && b.sessions === 80
  })())
  app.unmount()
}

console.log('\n=== NET-152 · §8 п.5–6: ТЦ Июнь, пополнения ÷ сессии (Ф-2) ===')
{
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  await fillPark(el, 'iyun', { sessions: '2' })
  check('п.5 Июнь 2 сессии при 88 — заблокирована', btnBlocked(el))
  check('п.5 текст §3 — дословно',
    el.textContent.includes('Чеков с пополнением (2) намного меньше пополнений (88). Обычно эти числа почти равны. Проверьте по отчёту: считаются только строки „Очки-Деньги“ с операцией „Покупка очков“.'))
  check('п.5 подсвечены оба числа пары', redBorder(el, 'rep-topups') && redBorder(el, 'rep-sessions'))
  check('п.5 мягкая строка v2.3 про сессии не дублирует красную', !el.textContent.includes('Проверьте сессии'))
  postedBodies.length = 0
  await submitForm(el)
  check('п.5 тап «Отправить» — POST не ушёл', postedBodies.length === 0)
  await setInput(el, 'rep-sessions', '87')
  check('п.6 Июнь 87 при 88 — проходит', !btnBlocked(el))
  check('п.6 без предупреждений', !el.querySelector('[role="status"]'), warnText(el))
  check('п.6 красной плашки нет', !el.textContent.includes('намного меньше пополнений'))
  app.unmount()
}

console.log('\n=== NET-152 · §8 п.7: дата, за которую в дневном слое есть выручка (Ф-3) ===')
{
  dailyPayload = { updated: null, sets: {
    [`piterland:${RESUB_DATE.slice(0, 7)}`]: {
      park: 'piterland', month: RESUB_DATE.slice(0, 7),
      days: [{ date: RESUB_DATE, rev: 207249, status: 'full' }],
    },
  } }
  postMode = 'ok'
  const dailyBefore = getUrls.filter((u) => u.includes('action=daily')).length
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  check('форма запросила дневной слой (owner)',
    getUrls.filter((u) => u.includes('action=daily')).length === dailyBefore + 1)
  await fillPark(el, 'piterland')
  await setInput(el, 'rep-date', RESUB_DATE)
  postedBodies.length = 0
  await submitForm(el)
  let d = dialog()
  check('п.7 подтверждение показано', !!d)
  check('п.7 текст — дословно, с выручкой из слоя',
    !!d && d.textContent.includes(`За эту дату отчёт уже есть: выручка ${rub(207249)}. Отправить новый вместо него?`),
    d?.textContent)
  const yes = document.querySelector('[data-test="report-resubmit-yes"]')
  const cancel = document.querySelector('[data-test="report-resubmit-cancel"]')
  check('п.7 кнопки «Да, пересдаю» и «Отмена»',
    yes?.textContent.trim() === 'Да, пересдаю' && cancel?.textContent.trim() === 'Отмена')
  check('п.7 у диалога роль alertdialog и aria-modal', d?.getAttribute('role') === 'alertdialog' && d?.getAttribute('aria-modal') === 'true')
  check('п.7 кнопки ≥ 44pt (min-h-[48px])', yes?.className.includes('min-h-[48px]') && cancel?.className.includes('min-h-[48px]'))
  check('п.7 фокус на «Отмене»: случайный Enter день не перезапишет', document.activeElement === cancel)
  check('п.7 пока вопрос открыт, POST не ушёл', postedBodies.length === 0)

  await fire(cancel, 'click')
  await settle()
  check('п.7 «Отмена» закрывает вопрос', !dialog())
  check('п.7 «Отмена» возвращает в форму: POST нет, поля и дата на месте, успеха нет',
    postedBodies.length === 0 && digitsOf(el.querySelector('#rep-revenue').value) === '100000' &&
    el.querySelector('#rep-date').value === RESUB_DATE && el.querySelector('#rep-park').value === 'piterland' &&
    !el.textContent.includes('принят'))

  // Escape и тап по фону — тоже «Отмена»
  await submitForm(el)
  check('повторный тап «Отправить» — вопрос снова', !!dialog())
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await settle()
  check('Escape = «Отмена»: вопрос закрыт, POST нет', !dialog() && postedBodies.length === 0)
  await submitForm(el)
  const scrim = dialog()?.parentElement
  scrim?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await settle()
  check('тап по фону = «Отмена»: вопрос закрыт, POST нет', !dialog() && postedBodies.length === 0)

  // Другая дата того же парка — дня в слое нет → без вопроса (проверим ниже отдельно);
  // здесь — «Да, пересдаю»
  await submitForm(el)
  await fire(document.querySelector('[data-test="report-resubmit-yes"]'), 'click')
  await settle()
  check('«Да, пересдаю» → POST ушёл ровно один', postedBodies.length === 1, postedBodies.length)
  const body = JSON.parse(postedBodies[0] || '{}')
  check('в теле — выбранная дата пересдачи и числа формы',
    body.date === RESUB_DATE && body.park === 'piterland' && body.revenue === 100000 && body.receipts === 112)
  check('после «Да, пересдаю» — экран успеха, вопрос закрыт', el.textContent.includes('принят') && !dialog())
  app.unmount()
}

console.log('\n=== NET-152 · §8 п.8: дата без данных — подтверждения нет ===')
{
  // слой тот же (Питер, RESUB_DATE с выручкой)
  postMode = 'ok'
  {
    const { el, app } = mount(bundle.DailyReportScreen)
    await settle()
    await fillPark(el, 'piterland') // дата по умолчанию — вчера, в слое её нет
    postedBodies.length = 0
    await submitForm(el)
    check('п.8 вчера (в слое нет) → без вопроса, POST ушёл', !dialog() && postedBodies.length === 1)
    app.unmount()
  }
  {
    const { el, app } = mount(bundle.DailyReportScreen)
    await settle()
    await fillPark(el, 'ohta')
    await setInput(el, 'rep-date', RESUB_DATE)
    postedBodies.length = 0
    await submitForm(el)
    check('п.8 та же дата, но другой парк → без вопроса (чужой день не мешает)', !dialog() && postedBodies.length === 1)
    app.unmount()
  }
  {
    // слой не загрузился — отправка без вопроса: сбой ЧТЕНИЯ не должен мешать отчёту
    dailyMode = 'fail'
    const { el, app } = mount(bundle.DailyReportScreen)
    await settle()
    await fillPark(el, 'piterland')
    await setInput(el, 'rep-date', RESUB_DATE)
    postedBodies.length = 0
    await submitForm(el)
    check('слой не загрузился → без вопроса, POST ушёл', !dialog() && postedBodies.length === 1)
    check('ошибка чтения слоя в форме не показывается (не её забота)',
      !el.textContent.includes('Источник недоступен'))
    app.unmount()
    dailyMode = 'ok'
  }
}

console.log('\n=== NET-152 · режим репортёра: дневной слой не читается вовсе (D-12 §9-A) ===')
{
  await ak.submitKey('reporter-phrase')
  check('фраза репортёра → role = reporter', ak.role.value === 'reporter')
  const dailyBefore = getUrls.filter((u) => u.includes('action=daily')).length
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  check('у репортёра запроса дневного слоя НЕТ',
    getUrls.filter((u) => u.includes('action=daily')).length === dailyBefore)
  await fillPark(el, 'piterland')
  await setInput(el, 'rep-date', RESUB_DATE)
  postedBodies.length = 0
  await submitForm(el)
  check('у репортёра вопроса нет, отчёт уходит', !dialog() && postedBodies.length === 1)
  check('репортёра не выкинуло на вход (logout не случился)', ak.authed.value === true)
  app.unmount()
  await ak.submitKey('test-phrase')
  check('обратно фраза владельца → role = owner', ak.role.value === 'owner')
}

console.log('\n=== NET-152 · §8 п.9: хинты Ф-4 без тултипов во всех трёх парках ===')
for (const park of ['ohta', 'piterland', 'iyun']) {
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  await setInput(el, 'rep-park', park)
  check(`${park}: хинт «Пополнений за день» — дословно, виден сразу`,
    el.textContent.includes('= Σ „Кол-во“ по строкам „Очки-Деньги“ с операцией „Покупка очков“'))
  check(`${park}: хинт «Чеков с пополнением» — дословно, виден сразу`,
    el.textContent.includes('= Σ „Кол-во чеков“ по тем же строкам „Очки-Деньги“'))
  check(`${park}: во вводной карты «Чеки» — предложение про пакеты и ЛК`,
    el.textContent.includes('Пакеты и пополнения через личный кабинет сюда не входят — деньги за них учитываются отдельно.'))
  check(`${park}: старой формулировки «по строкам „Покупка очков“» на экране нет`,
    !el.textContent.includes('по строкам „Покупка очков“'))
  check(`${park}: тултипы при этом закрыты (проверяем видимое, а не спрятанное)`,
    [...el.querySelectorAll('button[aria-expanded]')].filter((b) => b.getAttribute('aria-label')?.startsWith('Пояснение'))
      .every((b) => b.getAttribute('aria-expanded') === 'false'))
  app.unmount()
}

console.log('\n=== NET-152 · Ф-5 живьём: коридор Питерленда ===')
{
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  await fillPark(el, 'piterland', { revenue: '102000', cashless: '62000' }) // 1 200 ₽
  check('Питер 1 200 ₽ → жёлтая строка с границами парка',
    warnText(el).includes(`Проверьте пополнения: выручка ÷ пополнения = ${rub(1200)}, обычно у вас от 830 до ${formatInt(1190)}.`),
    warnText(el))
  check('жёлтая строка не блокирует', !btnBlocked(el))
  app.unmount()
}

console.log('\n=== NET-152 · Ф-6: блок «Как получить отчёт» ===')
{
  try { window.localStorage.removeItem('bc:report:howto_open') } catch { /* нет хранилища */ }
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  check('до выбора парка блока нет', !el.querySelector('[data-test="report-howto"]'))
  await setInput(el, 'rep-park', 'piterland')
  const howto = el.querySelector('[data-test="report-howto"]')
  const toggle = el.querySelector('[data-test="report-howto-toggle"]')
  check('блок есть, заголовок «Как получить отчёт»', !!howto && toggle?.textContent.includes('Как получить отчёт'))
  check('стоит прямо над картой «Чеки»',
    howto?.nextElementSibling?.querySelector('h2')?.textContent.trim() === 'Чеки')
  check('по умолчанию свёрнут', toggle?.getAttribute('aria-expanded') === 'false' &&
    !el.querySelector('[data-test="report-howto-body"]'))
  check('строка — тач-таргет ≥ 44pt', toggle?.className.includes('min-h-[44px]'))
  await fire(toggle, 'click')
  const body = el.querySelector('[data-test="report-howto-body"]')
  check('по нажатию раскрывается', toggle.getAttribute('aria-expanded') === 'true' && !!body)
  check('внутри пять строк', body?.querySelectorAll('dt').length === 5 && body?.querySelectorAll('dd').length === 5)
  check('игротека Питерленда — «БУМБАСТИК»', body?.textContent.includes('БУМБАСТИК'))
  check('группировки и воронки — по задаче',
    body?.textContent.includes('Наименование · Операция · Тип оплаты · Источник транзакции') &&
    body?.textContent.includes('все светлые; тёмная значит, что строки скрыты и суммы неверные'))
  check('строка про «Статистику посещений» — под списком',
    body?.textContent.includes('Игроков всего и Из них новых — из отчёта „Статистика посещений“ за тот же день.'))
  check('примеров чисел и рублей в блоке нет', !/₽/.test(body?.textContent || '') &&
    !/\d{2,}/.test(body?.textContent || ''))
  check('раскрытие запомнено на устройстве', window.localStorage.getItem('bc:report:howto_open') === '1')
  await setInput(el, 'rep-park', 'iyun')
  check('смена парка → игротека «Бумбастик ТРК Июнь»',
    el.querySelector('[data-test="report-howto-body"]')?.textContent.includes('Бумбастик ТРК Июнь'))
  app.unmount()

  const m2 = mount(bundle.DailyReportScreen)
  await settle()
  await setInput(m2.el, 'rep-park', 'ohta')
  check('после перезахода блок открыт (состояние запомнено), игротека Охты',
    m2.el.querySelector('[data-test="report-howto-toggle"]')?.getAttribute('aria-expanded') === 'true' &&
    m2.el.querySelector('[data-test="report-howto-body"]')?.textContent.includes('Бумбастик Охта Молл'))
  await fire(m2.el.querySelector('[data-test="report-howto-toggle"]'), 'click')
  check('повторное нажатие сворачивает и запоминает', !m2.el.querySelector('[data-test="report-howto-body"]') &&
    window.localStorage.getItem('bc:report:howto_open') === '0')
  m2.app.unmount()
  try { window.localStorage.removeItem('bc:report:howto_open') } catch { /* нет хранилища */ }
}


console.log('\n=== Ввод чисел: разделение на тысячи (25.09) ===')
{
  const NB = ' '
  postMode = 'ok'
  dailyPayload = { updated: null, sets: {} }
  const { el, app } = mount(bundle.DailyReportScreen)
  await settle()
  await setInput(el, 'rep-park', 'piterland')
  const rev = el.querySelector('#rep-revenue')
  await setInput(el, 'rep-revenue', '207249')
  check('ввели 207249 → в поле «207 249»', rev.value === `207${NB}249`, JSON.stringify(rev.value))
  await setInput(el, 'rep-revenue', '1234567')
  check('миллионы → «1 234 567»', rev.value === `1${NB}234${NB}567`, JSON.stringify(rev.value))
  await setInput(el, 'rep-revenue', '1 234 567 ₽')
  check('вставка «1 234 567 ₽» → только цифры, сгруппированы заново', rev.value === `1${NB}234${NB}567`)
  await setInput(el, 'rep-topups', '85')
  check('до тысячи — без пробела («85»)', el.querySelector('#rep-topups').value === '85')
  check('разделитель — неразрывный пробел, как в остальных числах приложения', rev.value.includes(NB) && !rev.value.includes(' '))
  check('атрибута pattern="[0-9]*" нет — с пробелами поле не числится :invalid', !rev.hasAttribute('pattern'))
  check('клавиатура по-прежнему цифровая (inputmode=numeric)', rev.getAttribute('inputmode') === 'numeric')

  // правка в середине числа: каретка остаётся за вставленной цифрой, а не прыгает в конец
  rev.value = `1${NB}2394${NB}567`
  rev.setSelectionRange(5, 5)
  await fire(rev, 'input')
  check('вставили 9 в середину «1 234 567» → «12 394 567»', rev.value === `12${NB}394${NB}567`, JSON.stringify(rev.value))
  check('каретка сразу за вставленной цифрой', rev.selectionStart === 5, rev.selectionStart)

  // Backspace по самому пробелу стирает цифру перед ним
  await setInput(el, 'rep-revenue', '207249')
  rev.value = '207249'
  rev.setSelectionRange(3, 3)
  rev.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
  await nextTick()
  check('Backspace по пробелу в «207 249» → «20 249»', rev.value === `20${NB}249`, JSON.stringify(rev.value))
  check('каретка после Backspace — сразу за «20»', rev.selectionStart === 2, rev.selectionStart)
  // Delete по пробелу стирает цифру после него
  await setInput(el, 'rep-revenue', '207249')
  rev.value = '207249'
  rev.setSelectionRange(3, 3)
  rev.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'deleteContentForward' }))
  await nextTick()
  check('Delete по пробелу в «207 249» → «20 749»', rev.value === `20${NB}749`, JSON.stringify(rev.value))

  // в модель, в проверки и в отправку идут только цифры
  await fillPark(el, 'piterland', { revenue: '207249', cashless: '147834', cash: '44415', site: '15000',
    visitors_total: '300', visitors_new: '40', receipts: '265', topups: '180', sessions: '160' })
  check('в полях денег — разделители', el.querySelector('#rep-cashless').value === `147${NB}834` &&
    el.querySelector('#rep-cash').value === `44${NB}415` && el.querySelector('#rep-site').value === `15${NB}000`)
  check('проверка «безнал + нал + кабинет = выручка» считает по цифрам — кнопка активна', !btnBlocked(el))
  postedBodies.length = 0
  await submitForm(el)
  const body = JSON.parse(postedBodies[0] || '{}')
  check('в отправку ушли числа без пробелов', body.revenue === 207249 && body.cashless === 147834 &&
    body.cash === 44415 && body.site === 15000, postedBodies[0])
  app.unmount()
}

console.log('\n=== NET-91 · jsdom: карта «Дни рождения» (Охта) ===')
{
  postMode = 'ok'
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await setInput(el, 'rep-park', 'ohta')
  const h2 = [...el.querySelectorAll('h2')].map((h) => h.textContent.trim())
  check('карта «Дни рождения» есть и стоит между «Чеки» и «День»',
    h2.indexOf('Дни рождения') > h2.indexOf('Чеки') && h2.indexOf('Дни рождения') < h2.indexOf('День'), h2.join(' · '))
  check('вводная строка на месте', el.textContent.includes(BIRTHDAYS_INTRO))
  check('три поля на месте', BD_FIELDS.every((k) => !!el.querySelector(`#rep-${k}`)))
  const bdCard = [...el.querySelectorAll('form section')].find((sec) => sec.querySelector('h2')?.textContent.trim() === 'Дни рождения')
  check('все три помечены «необязательно»', !!bdCard && (bdCard.textContent.match(/необязательно/g) || []).length === 3)
  const fillBase = async () => {
    for (const [id, v] of [['rep-revenue', '207249'], ['rep-cashless', '147834'], ['rep-cash', '44415'], ['rep-site', '15000'],
      ['rep-visitors_total', '300'], ['rep-visitors_new', '40'], ['rep-receipts', '265'], ['rep-topups', '180'],
      ['rep-sessions', '160'], ['rep-weather', 'rain_all']]) await setInput(el, id, v)
  }
  await fillBase()
  check('без полей ДР кнопка активна', !btnBlocked(el))
  await setInput(el, 'rep-bd_cards', '6')
  check('одни карты → жёлтая строка про пару, кнопка активна',
    el.textContent.includes('сумма и карты берутся из одних и тех же строк') && !btnBlocked(el))
  await setInput(el, 'rep-bd_sum', '6000')
  check('сумма дописана → строка про пару ушла', !el.textContent.includes('сумма и карты берутся из одних и тех же строк'))
  await setInput(el, 'rep-bd_parties', '7')
  check('праздников больше карт → жёлтая строка, кнопка активна',
    el.textContent.includes('Праздников (7) больше, чем карт (6)') && !btnBlocked(el))
  postedBodies.length = 0
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  const body = JSON.parse(postedBodies[0] || '{}')
  check('POST ушёл, поля ДР в теле числами', postedBodies.length === 1 &&
    body.bd_sum === 6000 && body.bd_cards === 6 && body.bd_parties === 7,
    JSON.stringify({ s: body.bd_sum, c: body.bd_cards, p: body.bd_parties }))
  // «Внести ещё» → те же числа без ДР: ключей в теле нет вовсе
  const more = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Внести ещё'))
  if (more) await fire(more, 'click')
  await fillBase()
  check('после «Внести ещё» поля ДР пустые', BD_FIELDS.every((k) => digitsOf(el.querySelector(`#rep-${k}`)?.value) === ''))
  postedBodies.length = 0
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  const body2 = JSON.parse(postedBodies[0] || '{}')
  check('пустые поля ДР в тело не ушли (ключей нет)', postedBodies.length === 1 && BD_FIELDS.every((k) => !(k in body2)))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}

console.log('\n=== jsdom: ReporterShell (вход по фразе репортёра) ===')
{
  const { el, app } = mount(bundle.ReporterShell)
  await nextTick()
  check('заголовок «Отчёт Дня» (Д заглавная, v2.1 §4)',
    el.textContent.includes('Отчёт Дня') && !el.textContent.includes('Отчёт дня'))
  check('таб-бара нет (nav отсутствует)', !el.querySelector('nav'))
  check('форма внутри', !!el.querySelector('#rep-park'))
  check('без NaN/undefined/Infinity', !BAD.test(el.textContent))
  app.unmount()
}

console.log('\n=== Vue warnings ===')
check('нет [Vue warn]', vueWarns.length === 0, vueWarns[0] || 'чисто')

console.warn = origWarn
rmSync(tmp, { recursive: true, force: true })
console.log(ok ? '\n✅ verify-report: всё зелёное' : '\n❌ verify-report: есть провалы')
process.exit(ok ? 0 : 1)
