// Локальная приёмка страницы «Отчёт дня» (D-12). Запуск: `node scripts/verify-report.mjs`.
//
// Двухслойная проверка:
//   1) ЧИСТАЯ МОДЕЛЬ (reportModel.js, без DOM): все блокировки §4 ТЗ —
//      cashless+cash===revenue ровно (без допусков), visitors_new ≤ visitors_total,
//      дата не в будущем, Июнь sessions ≤ topups, обязательность полей, payload.
//   2) ЖИВОЙ РЕНДЕР В JSDOM: временная lib-сборка Vite (экран + оболочка
//      репортёра), монтирование в jsdom, прогон формы событиями: кнопка
//      блокируется/разблокируется, тексты ошибок/плашек, POST мокается
//      (реального URL нет — VITE_REPORT_API подменён фиктивным), тело POST
//      сверяется с контрактом §7, экран успеха, красная плашка без потери данных.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  emptyForm, validate, buildPayload, toInt, yesterdayISO, todayISO,
} from '../src/composables/reportModel.js'

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

function filled(park = 'piterland', over = {}) {
  return {
    ...emptyForm(park, NOW),
    revenue: '207249', cashless: '147834', cash: '59415',
    visitors_total: '300', visitors_new: '40',
    weather: 'rain_all',
    ...over,
  }
}

console.log('\n=== reportModel: блокировки §4 ===')
check('пустая форма НЕ ок', validate(emptyForm('', NOW), NOW).ok === false)
check('заполненный Питер ок', validate(filled(), NOW).ok === true)
{
  const v = validate(filled('piterland', { cash: '59414' }), NOW)
  check('сумма ±1 ₽ блокирует (без допусков)', v.ok === false && v.errors.sum === true)
  check('данные для текста: sum=207248, revenue=207249',
    v.sum && v.sum.sum === 207248 && v.sum.revenue === 207249)
}
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
const iyunOver = { revenue: '100000', cashless: '60000', cash: '40000', topups: '120', sessions: '110' }
check('Июнь без topups/sessions НЕ ок',
  validate(filled('iyun'), NOW).missing.includes('topups'))
check('Июнь с topups/sessions ок', validate(filled('iyun', iyunOver), NOW).ok === true)
check('Июнь sessions > topups блокирует',
  validate(filled('iyun', { ...iyunOver, sessions: '121' }), NOW).errors.sessions === true)
check('Июнь promo/rev_y/rev_vk необязательны',
  validate(filled('iyun', iyunOver), NOW).ok === true)
check('Охта/Питер: sessions-поля не требуются и не валидируются',
  validate(filled('ohta'), NOW).ok === true)

console.log('\n=== reportModel: payload §7 ===')
{
  const p = buildPayload(filled('piterland', { comment: '  гроза  ' }))
  check('park/date/числа — типы верные',
    p.park === 'piterland' && p.date === '2026-07-20' && p.revenue === 207249 &&
    p.cashless === 147834 && p.cash === 59415 && p.visitors_total === 300 && p.visitors_new === 40)
  check('comment триммится', p.comment === 'гроза')
  check('у Питера НЕТ topups/sessions/promo/rev_*',
    !('topups' in p) && !('sessions' in p) && !('promo' in p) && !('rev_y' in p) && !('rev_vk' in p))
  check('weather — слаг', p.weather === 'rain_all')
  check('ключа `key` в payload НЕТ (добавляет useReport)', !('key' in p))
}
{
  const p = buildPayload(filled('iyun', { ...iyunOver, promo: '7', rev_y: '', rev_vk: '2' }))
  check('Июнь: topups/sessions в payload', p.topups === 120 && p.sessions === 110)
  check('Июнь: promo=7, rev_vk=2, rev_y отсутствует',
    p.promo === 7 && p.rev_vk === 2 && !('rev_y' in p))
  const p2 = buildPayload(filled('iyun', iyunOver))
  check('Июнь: пустой comment не отправляется', !('comment' in p2))
}

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
  check('у Питера НЕТ полей Июня', !el.querySelector('#rep-topups') && !el.querySelector('#rep-sessions'))
  check('напоминание про выгрузку (§5.8) на месте', el.textContent.includes('Не забудьте прислать выгрузку'))
  check('числовые инпуты: inputmode=numeric, type=text (без спиннеров)',
    el.querySelector('#rep-revenue').getAttribute('inputmode') === 'numeric' &&
    el.querySelector('#rep-revenue').getAttribute('type') === 'text')
  check('кнопка есть и заблокирована', submitBtn(el) && submitBtn(el).disabled === true)

  // тултип дословно
  const tipBtn = el.querySelector('button[aria-label="Пояснение: Общая выручка, ₽"]')
  check('ⓘ у выручки есть', !!tipBtn)
  await fire(tipBtn, 'click')
  check('текст тултипа §5.1 дословно', el.textContent.includes('строка „Итого выручка“. Включает онлайн-кассу (C2P)'))

  await setInput(el, 'rep-revenue', '207249')
  await setInput(el, 'rep-cashless', '147834')
  await setInput(el, 'rep-cash', '59415')
  await setInput(el, 'rep-visitors_total', '300')
  await setInput(el, 'rep-visitors_new', '40')
  check('без погоды — ещё заблокирована', submitBtn(el).disabled === true)
  await setInput(el, 'rep-weather', 'rain_all')
  check('валидация зелёная → кнопка активна', submitBtn(el).disabled === false)

  // расхождение суммы
  await setInput(el, 'rep-cash', '59414')
  check('сумма разошлась → кнопка заблокирована', submitBtn(el).disabled === true)
  check('текст §4: «Безнал + нал = … Разница …»',
    el.textContent.includes('Безнал + нал =') && el.textContent.includes('Разница') && el.textContent.includes('проверьте цифры'))
  await setInput(el, 'rep-cash', '59415')

  // не-вчера: жёлтая плашка, не блокирует
  await setInput(el, 'rep-date', todayISO(new Date()))
  check('не-вчера: жёлтая плашка дословно', el.textContent.includes('Вы вносите отчёт не за вчера — проверьте дату'))
  check('не-вчера НЕ блокирует', submitBtn(el).disabled === false)
  await setInput(el, 'rep-date', yesterdayISO(new Date()))

  // отправка: успех
  postMode = 'ok'
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  check('POST ушёл ровно один', postedBodies.length === 1)
  const body = JSON.parse(postedBodies[0] || '{}')
  check('в теле — гейт-ключ key', body.key === 'test-phrase')
  check('тело по контракту §7 (числа числами)',
    body.park === 'piterland' && body.revenue === 207249 && body.cashless === 147834 &&
    body.cash === 59415 && body.visitors_total === 300 && body.visitors_new === 40 &&
    body.weather === 'rain_all' && !('topups' in body))
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
  await setInput(el, 'rep-revenue', '100000')
  await setInput(el, 'rep-cashless', '60000')
  await setInput(el, 'rep-cash', '40000')
  await setInput(el, 'rep-visitors_total', '150')
  await setInput(el, 'rep-visitors_new', '10')
  await setInput(el, 'rep-weather', 'sunny')
  await fire(el.querySelector('form'), 'submit')
  await new Promise((r) => setTimeout(r, 20))
  await nextTick()
  check('красная плашка дословно', el.textContent.includes('Не отправилось — попробуйте ещё раз или пришлите отчёт как обычно'))
  check('данные формы НЕ потеряны', el.querySelector('#rep-revenue').value === '100000' && el.querySelector('#rep-park').value === 'ohta')
  check('успеха нет', !el.textContent.includes('принят'))
  app.unmount()
}

console.log('\n=== jsdom: Июнь — доп-поля и sessions ≤ topups ===')
{
  postMode = 'ok'
  const { el, app } = mount(bundle.DailyReportScreen)
  await nextTick()
  await setInput(el, 'rep-park', 'iyun')
  check('поля Июня появились', !!el.querySelector('#rep-topups') && !!el.querySelector('#rep-sessions') && !!el.querySelector('#rep-promo'))
  check('напоминания §5.8 у Июня НЕТ', !el.textContent.includes('Не забудьте прислать выгрузку'))
  await setInput(el, 'rep-revenue', '100000')
  await setInput(el, 'rep-cashless', '60000')
  await setInput(el, 'rep-cash', '40000')
  await setInput(el, 'rep-visitors_total', '150')
  await setInput(el, 'rep-visitors_new', '10')
  await setInput(el, 'rep-weather', 'mixed')
  check('без topups/sessions — заблокирована', submitBtn(el).disabled === true)
  await setInput(el, 'rep-topups', '120')
  await setInput(el, 'rep-sessions', '121')
  check('sessions > topups — заблокирована + текст', submitBtn(el).disabled === true &&
    el.textContent.includes('Чеков с пополнением не может быть больше'))
  await setInput(el, 'rep-sessions', '110')
  check('sessions ≤ topups — активна', submitBtn(el).disabled === false)
  app.unmount()
}

console.log('\n=== jsdom: ReporterShell (вход по фразе репортёра) ===')
{
  const { el, app } = mount(bundle.ReporterShell)
  await nextTick()
  check('заголовок «Отчёт дня»', el.textContent.includes('Отчёт дня'))
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
