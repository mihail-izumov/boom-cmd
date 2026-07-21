// Локальная приёмка страницы «Отчёт Дня» v2/v2.1 (D-12). Запуск: `node scripts/verify-report.mjs`.
// v2.1: подпись/тултипы поля сессий (§1), «Переменно / затрудняюсь» (§2),
// дата без border-t (§3), заголовок «Отчёт Дня» (§4).
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
  yesterdayISO, todayISO,
} from '../src/composables/reportModel.js'
import { rub, L, FIELD_LABELS, WEATHER_OPTIONS, TIPS, TIPS_IYUN } from '../src/i18n/report.js'

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
  check('Июнь: receipts НЕТ (1 пополнение = 1 чек, D-10)',
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
check('topups > receipts НЕ блокирует (пакеты дают Кол-во без чеков)',
  validate(filled('piterland', { topups: '300', sessions: '160' }), NOW).ok === true)
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
  check('Июнь: средний чек = revenue ÷ topups (D-10)',
    Math.abs(d.avg_check - 100000 / 120) < 1e-9)
}

console.log('\n=== i18n: тексты v2.1 §1–2, §4 (дословно из ТЗ) ===')
check('заголовок «Отчёт Дня» (Д заглавная, §4)', L.title === 'Отчёт Дня', L.title)
check('подпись сессий: «Чеков с пополнением (сессии)» (§1)',
  FIELD_LABELS.sessions === 'Чеков с пополнением (сессии)')
check('тултип сессий Охта/Питер — дословно §1',
  TIPS.sessions === 'Сколько чеков содержали хотя бы одно пополнение. В один чек могут пробить два пополнения (семья, докидка) — тогда это 1 чек и 2 пополнения. Где взять: в выгрузке „[Финансовые] Выручка“ — сумма колонки „Кол-во чеков“ по строкам „Покупка очков“. Всегда ≤ „Пополнений за день“.')
check('тултип сессий Июня — дословно §1',
  TIPS_IYUN.sessions === 'Сколько чеков содержали хотя бы одно пополнение. Если в одном чеке два пополнения — это 1 чек и 2 пополнения. Всегда ≤ „Пополнений за день“.')
check('погода: по-прежнему 5 опций, новых не добавлено (§2)', WEATHER_OPTIONS.length === 5)
check('погода: слаги не тронуты (§2)',
  WEATHER_OPTIONS.map((w) => w.value).join(',') === 'sunny,mixed,overcast,rain_part,rain_all')
check('опция mixed: «Переменно / затрудняюсь» (§2)',
  WEATHER_OPTIONS.find((w) => w.value === 'mixed')?.label === 'Переменно / затрудняюсь')
check('тултип погоды дополнен — дословно §2',
  TIPS.weather.endsWith('Если день не подходит точно ни под один вариант — выбирайте „Переменно / затрудняюсь“ и напишите пару слов о погоде в комментарии.'))

// ═══════════════ 2. Живой рендер в jsdom ═══════════════
console.log('\n=== jsdom: сборка тестового бандла ===')
const tmp = resolve(root, '.tmp-verify-report')
rmSync(tmp, { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
writeFileSync(resolve(tmp, 'entry.js'), `
export { default as DailyReportScreen } from '${root}/src/screens/DailyReportScreen.vue'
export { default as ReporterShell } from '${root}/src/components/report/ReporterShell.vue'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
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

// мок fetch: GET → гейт «ок», POST → сценарий из postMode
let postMode = 'ok' // 'ok' | 'reject' | 'neterror'
const postedBodies = []
global.fetch = async (url, opts = {}) => {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj })
  if ((opts.method || 'GET') === 'POST') {
    postedBodies.push(String(opts.body || ''))
    if (postMode === 'neterror') return { ok: false, status: 500, json: async () => ({}) }
    if (postMode === 'reject') return json({ ok: false, error: 'bad key' })
    return json({ ok: true })
  }
  return json({}) // гейт: 200 без error → фраза ок, роль owner
}

// консоль: ловим [Vue warn] (ошибки рендера) — заведомо провал
const vueWarns = []
const origWarn = console.warn
console.warn = (...a) => {
  const s = a.join(' ')
  if (s.includes('[Vue warn]')) vueWarns.push(s)
  else if (!s.startsWith('report submit failed')) origWarn(...a)
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
  check('тихая строка недельной сверки (§3) на месте',
    el.textContent.includes('Раз в неделю присылайте владельцу саму выгрузку за неделю'))
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

  // topups > receipts НЕ блокирует
  await setInput(el, 'rep-topups', '300')
  await setInput(el, 'rep-sessions', '290')
  check('topups > receipts НЕ блокирует', !btnBlocked(el))
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
  app.unmount()
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
  check('данные формы НЕ потеряны', el.querySelector('#rep-revenue').value === '100000' &&
    el.querySelector('#rep-site').value === '10000' && el.querySelector('#rep-park').value === 'ohta')
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
    !el.textContent.includes('Раз в неделю присылайте владельцу'))
  // тултипы topups/sessions у Июня — v1 («как раньше», §1)
  const tipBtn = el.querySelector('button[aria-label="Пояснение: Пополнений за день"]')
  await fire(tipBtn, 'click')
  check('тултип topups Июня — v1 (1 пополнение = 1 чек)',
    el.textContent.includes('Общее количество пополнений баланса. У нас 1 пополнение = 1 чек.'))
  // v2.1 §1: сессии Июня — свой тултип (без выгрузки), подпись общая
  const sesTipBtn = el.querySelector('button[aria-label="Пояснение: Чеков с пополнением (сессии)"]')
  await fire(sesTipBtn, 'click')
  check('тултип сессий Июня — v2.1 (без «Где взять», с «Всегда ≤»)',
    el.textContent.includes('Сколько чеков содержали хотя бы одно пополнение. Если в одном чеке два пополнения — это 1 чек и 2 пополнения. Всегда ≤ „Пополнений за день“.') &&
    !el.textContent.includes('Где взять'))
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
  // Июнь: средний чек = revenue ÷ topups (D-10); плитки «чек/пополнение» нет (дубль)
  check('Июнь: средний чек ≈ 833 ₽ (revenue ÷ topups)', el.textContent.includes('≈ 833 ₽'))
  check('Июнь: плитки «Чек / пополнение» нет (дубль D-10)', !el.textContent.includes('Чек / пополнение'))
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
