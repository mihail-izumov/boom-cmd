// Приёмка экрана «Вклад в план» (второе состояние раздела «Драйверы роста»).
// Модель + живой рендер на daily.mock.json — данные ВЫДУМАННЫЕ, реальных чисел
// парков в репозитории нет (BOUNDARY §7 задания).
//
// Мок специально устроен так, чтобы ловить главные риски задания:
//   • доли базы/ёмкости в нём 60/40, а НЕ 70/30 — тест падает, если конвенцию D-50
//     захардкодили во фронте;
//   • Питерленд перевыполнен (110 %) — состояние «Сверх ёмкости»;
//   • Июня в driver_contrib нет — парк без строки показывается прочерком.
//
// Харнесс — тот же, что в verify-daily.mjs: vite lib-сборка + jsdom + mount
// (SSR не используем, @vue/server-renderer в зависимостях нет).
// Запуск: node scripts/verify-contrib.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const mock = JSON.parse(readFileSync(resolve(root, 'src/data/daily.mock.json'), 'utf8'))

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${extra}`}`)
  cond ? pass++ : fail++
}
const eq = (name, got, exp) =>
  ok(name, JSON.stringify(got) === JSON.stringify(exp), `got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`)

// ═══════════════ чистая модель (без DOM) ═══════════════
const m = await import(pathToFileURL(resolve(root, 'src/composables/contribModel.js')).href)
const i18n = await import(pathToFileURL(resolve(root, 'src/i18n/drivers.js')).href)

console.log('=== мок: граница приватности ===')
const mockStr = JSON.stringify({ c: mock.driver_contrib, i: mock.driver_contrib_items })
ok('в моке нет весов/замеров/модели контура B',
  ['w_flow', 'w_check', 'weight', 'measure_status', 'model_share', 'ready_pct', 'landing', 'flow']
    .every((k) => !mockStr.includes(k)))
ok('доли мока НЕ 70/30 — иначе тест на хардкод конвенции бессмыслен',
  mock.driver_contrib.every((r) => Math.round((r.base / r.plan) * 100) === 60))

console.log('\n=== доступность экрана (обратная совместимость §4) ===')
eq('мок даёт экран «Вклад в план»', m.hasContrib(mock), true)
eq('нет ключей → экрана нет, список работает как раньше', m.hasContrib({ drivers: mock.drivers }), false)
eq('пустые массивы → экрана нет', m.hasContrib({ driver_contrib: [], driver_contrib_items: [] }), false)
eq('строка без плана экран не включает', m.hasContrib({ driver_contrib: [{ park: 'ohta' }] }), false)
eq('строка без capacity экран не включает', m.hasContrib({ driver_contrib: [{ park: 'ohta', plan: 1 }] }), false)

console.log('\n=== фронт не считает бизнес-величины ===')
const oh = m.parkContrib(mock, 'ohta')
const ohPlan = m.planLayout(oh)
eq('plan/base/capacity взяты из данных', [oh.plan, oh.base, oh.capacity], [1000000, 600000, 400000])
eq('доли считаны ИЗ ДАННЫХ (60/40), а не по конвенции 70/30',
  [ohPlan.baseLabelPct, ohPlan.capacityLabelPct], [60, 40])
ok('ширины сегментов сходятся в 100 %', Math.abs(ohPlan.basePct + ohPlan.capacityPct - 100) < 1e-9)
eq('covered_pct не пересчитан', oh.covered_pct, 25.0)
eq('gap не пересчитан', oh.gap, 300000)

console.log('\n=== состояние «Сверх ёмкости» (>100 %) ===')
const pl = m.parkContrib(mock, 'piterland')
const plCap = m.capacityLayout(pl)
eq('cov > 100 → over', plCap.over, true)
ok('шкала растянута: порог ёмкости внутри полосы', plCap.thresholdPct > 0 && plCap.thresholdPct < 100)
eq('порог = 100/110, не зажат в 100 %', Math.round(plCap.thresholdPct * 100) / 100, 90.91)
ok('хвост «сверх» непустой', plCap.overPct > 0)
const ohCap = m.capacityLayout(oh)
eq('cov < 100 → обычные два сегмента', [ohCap.over, ohCap.gotPct, ohCap.shortPct], [false, 25, 75])

console.log('\n=== «Вся сеть» — суммы ===')
const net = m.networkContrib(mock)
eq('план сети = Σ планов', net.plan, 3000000)
eq('база сети = Σ base, а НЕ Σплан × 70 %', net.base, 1800000)
eq('ёмкость сети = Σ capacity', net.capacity, 1200000)
eq('приносят = Σ got', net.got, 980000)
ok('закрытие сети из сумм', Math.abs(net.covered_pct - (980000 / 1200000) * 100) < 1e-9)
eq('gap сети', net.gap, 220000)
eq('доли сети тоже 60/40', [m.planLayout(net).baseLabelPct, m.planLayout(net).capacityLabelPct], [60, 40])
eq('нет ни одной строки → сети нет', m.networkContrib({ driver_contrib: [] }), null)

console.log('\n=== «данные от …» — только из asof ===')
eq('asof парка — из его строки', m.asofOf(mock, 'ohta'), '2026-07-24')
eq('asof сети — МИНИМАЛЬНАЯ из парков', m.asofOf(mock, null), '2026-07-22')
eq('формат ДД.ММ.ГГГГ', i18n.fmtDateFull(m.asofOf(mock, null)), '22.07.2026')
ok('«сегодня» нигде не подставляется', m.asofOf(mock, null) !== new Date().toISOString().slice(0, 10))

console.log('\n=== «Из чего складывается» ===')
const items = m.itemsFor(mock, 'ohta')
eq('только драйверы этого парка', items.length, 2)
eq('сортировка по вкладу вниз', items.map((x) => x.code), ['DRV-03', 'DRV-01'])
eq('короткий код для бейджа', items[0].short, '03')
eq('метка «фоновый» по bg', items.map((x) => x.bg), [false, true])
// Полоса обязана означать ТО ЖЕ, что напечатано справа. Раньше она считалась от
// максимального вклада, и верхняя строка была залита на 100 % при подписи «45 %».
eq('ширина мини-полосы = pct_in, а не доля от максимума',
  items.map((x) => Math.round(x.barPct)), items.map((x) => Math.round(x.pct_in)))
ok('верхняя строка НЕ залита на 100 % при доле меньше 100', items[0].barPct < 100)
eq('нет pct_in → фолбэк на долю от максимума, полоса не пустая',
  Math.round(m.itemsFor({ driver_contrib_items: [
    { park: 'x', code: 'A', rub: 100 }, { park: 'x', code: 'B', rub: 50 },
  ] }, 'x')[1].barPct), 50)
eq('детализации по сети нет', m.itemsFor(mock, null).length, 0)

console.log('\n=== «Сила драйверов» — разбивка по паркам ===')
const rows = m.parkRows(mock)
eq('три действующих парка всегда в списке', rows.map((r) => r.park), ['ohta', 'piterland', 'iyun'])
eq('парк без строки — прочерк, а не исчезновение', rows[2], { park: 'iyun', has: false, covered_pct: null, barPct: 0 })
eq('полоса зажата в 100 % (110 % не рвёт вёрстку)', rows[1].barPct, 100)
eq('процент при этом честный', rows[1].covered_pct, 110)

console.log('\n=== формат ===')
eq('млн с запятой (решение владельца 31.07)', i18n.fmtMln(1000000), '1,00 млн')
eq('дробные миллионы', i18n.fmtMln(880000), '0,88 млн')
eq('нет числа → прочерк, а не 0', i18n.fmtMln(null), '—')
eq('проценты целыми', i18n.fmtPct(25.4), '25 %')
eq('битая дата не ломает шапку', i18n.fmtDateFull(''), '')

// ═══════════════ контраст (WCAG, считаем, а не помним) ═══════════════
// DESIGN-STANDARD §7.5: контраст несущих смысл элементов ПОСЧИТАН, не утверждён.
console.log('\n=== контраст ===')
const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4)
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.replace('#', '').slice(i - 1, i + 1), 16))
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
const cr = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (fg, bg, p) => '#' + [0, 1, 2].map((i) =>
  Math.round(rgb(fg)[i] * p + rgb(bg)[i] * (1 - p)).toString(16).padStart(2, '0')).join('').toUpperCase()

const T = {
  surface: '#FFFFFF', surface2: '#F1F0EC', line: '#E3E1DB', accent: '#FFC833',
  text: '#1C1B18', textSecondary: '#45433E', muted: '#6F6D66', positive: '#2F9E54',
  graphite: '#3A3833', inkOnColor: '#FFFFFF',
}
// Нейтральный сегмент = color-mix(in srgb, var(--line) 75%, var(--surface-2)).
const NEUTRAL = mix(T.line, T.surface2, 0.75)
const at = (name, a, b, need) => {
  const v = cr(a, b)
  ok(`${name} — ${v.toFixed(2)}:1 (порог ${need})`, v >= need, `фактически ${v.toFixed(2)}:1`)
  return v
}
at('текст карточки --text на --surface', T.text, T.surface, 4.5)
at('подписи --text-muted на --surface', T.muted, T.surface, 4.5)
at('легенда --text-secondary на --surface', T.textSecondary, T.surface, 4.5)
at('метка «фоновый» --text-muted на --surface-2', T.muted, T.surface2, 4.5)
at('бейдж кода: --ink-on-color на --graphite', T.inkOnColor, T.graphite, 4.5)
at('неактивная вкладка --text-secondary на --surface-2', T.textSecondary, T.surface2, 4.5)
// Заливки сегментов между собой порог НЕ берут — это известно и вылечено §7.5:
// границу несёт риска, а роль нейтрали — ещё и штриховка. Фиксируем оба факта.
ok(`заливки --accent и нейтраль неразличимы по яркости (${cr(T.accent, NEUTRAL).toFixed(2)}:1) — лечится риской, а не оттенком`,
  cr(T.accent, NEUTRAL) < 3)
ok(`заливки --positive и --accent тоже (${cr(T.positive, T.accent).toFixed(2)}:1) — та же риска на стыке`,
  cr(T.positive, T.accent) < 3)
at('РИСКА --text на --accent', T.text, T.accent, 3)
at('РИСКА --text на нейтрали', T.text, NEUTRAL, 3)
at('штриховка --text-muted на нейтрали', T.muted, NEUTRAL, 3)
at('торец --text на треке --surface-2', T.text, T.surface2, 3)

// ═══════════════ jsdom: живой рендер ═══════════════
console.log('\n=== jsdom: сборка тестового бандла ===')
const tmp = resolve(root, '.tmp-verify-contrib')
// Уборка «мягкая»: на macOS в папке сборки заводится .DS_Store, и в песочнице его
// удаление даёт EPERM. Прогон не должен падать на уборке мусора — папка в .gitignore.
function rmTmp() {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* остаётся до следующего прогона */ }
}
rmTmp()
mkdirSync(tmp, { recursive: true })
writeFileSync(resolve(tmp, 'entry.js'), `
export { default as ContribScreen } from '${root}/src/components/drivers/ContribScreen.vue'
export { default as DriversSection } from '${root}/src/components/drivers/DriversSection.vue'
export { useParkContext, setPark } from '${root}/src/composables/useParkContext.js'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
`)

const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://mihail-izumov.github.io/boom-cmd/',
  pretendToBeVisual: true,
})
global.window = dom.window
global.document = dom.window.document
global.localStorage = dom.window.localStorage
try { Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true }) } catch { /* Node 22 */ }
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
    'import.meta.env.VITE_DAILY_API': JSON.stringify('https://mock.invalid/daily'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: { entry: resolve(tmp, 'entry.js'), formats: ['es'], fileName: 'bundle' },
    outDir: tmp, emptyOutDir: false,
    rollupOptions: { external: ['vue'] },
    minify: false,
  },
})
console.log('✓  lib-сборка готова')

let getPayload = mock
global.fetch = async () => ({ ok: true, status: 200, json: async () => getPayload })

const vueWarns = []
const bundle = await import(pathToFileURL(resolve(tmp, 'bundle.js')).href)
const { createApp, nextTick } = await import('vue')
await bundle.useAccessKey().submitKey('test-phrase')

function mount(comp, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(comp, props || {})
  app.config.warnHandler = (msg) => vueWarns.push(`[Vue warn] ${msg}`)
  app.mount(el)
  return { el, app }
}
async function screen(park) {
  bundle.setPark(park || 'network')
  const { el, app } = mount(bundle.ContribScreen, { data: mock })
  await nextTick()
  const html = el.innerHTML
  app.unmount()
  return html
}
const stripSvg = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '')

console.log('\n=== рендер экрана ===')
const hNet = await screen(null)
const hOhta = await screen('ohta')
const hPl = await screen('piterland')
const hMari = await screen('mari')

ok('сеть: карточка парков есть', hNet.includes('data-test="parks"'))
ok('заголовок карточки парков — «Сила драйверов»', hNet.includes('Сила драйверов'))
ok('старого заголовка «закрытие ёмкости» не осталось', !hNet.includes('закрытие ёмкости'))
ok('сеть: детализации по драйверам НЕТ (решение 31.07)', !hNet.includes('data-test="inside"'))
ok('парк: детализация есть', hOhta.includes('data-test="inside"'))
ok('парк: карточки парков нет', !hOhta.includes('data-test="parks"'))
ok('«данные от» из asof выведено', hNet.includes('данные от 22.07.2026'))
ok('в разметке нет «70 %» — конвенция не захардкожена', !hOhta.includes('70 %'), 'нашлось «70 %»')
ok('подпись базы из данных: «База парка (60 %)»', hOhta.includes('База парка (60 %)'))
ok('расшифровка в СКОБКАХ', /0,10 млн \(25 %\)/.test(hOhta), 'нет «0,10 млн (25 %)»')
ok('разделителя «·» на экране нет', !stripSvg(hOhta).includes('·'), 'нашёлся «·»')
ok('«Сверх ёмкости» при 110 %', hPl.includes('Сверх ёмкости') && hPl.includes('+0,08 млн'))
ok('зелёный сегмент только в состоянии «сверх»',
  hPl.includes('data-kind="positive"') && !hOhta.includes('data-kind="positive"'))
ok('«Надо добавить» при 25 %', hOhta.includes('Надо добавить') && hOhta.includes('0,30 млн (75 %)'))
ok('метка «фоновый» отрисована', hOhta.includes('data-test="bg"'))
ok('парк без данных → честный пустой стейт', hMari.includes('data-test="no-split"'))
ok('парк без данных → полос нет', !hMari.includes('data-test="seg"'))
ok('Июнь без «ТЦ»', hNet.includes('>Июнь') && !hNet.includes('ТЦ Июнь'))
ok('тач-таргеты ≥44px у строк парков', (hNet.match(/min-height: ?44px/g) || []).length >= 3)
ok('веса/замеры/модель на экран не выведены',
  ['w_flow', 'weight', 'measure_status', 'model_share', 'landing'].every((k) => !hOhta.includes(k)))
ok('got_src на экран не печатается', !hOhta.includes('выдуманный метод'))
ok('строки парков кликабельны только при наличии данных',
  (hNet.match(/<button[^>]*data-test="park-row"/g) || []).length === 2)
// jsdom нормализует box-shadow по-своему, поэтому ищем по знаку смещения:
// «inset 2px …» — риска слева на стыке (крупная полоса), «inset -2px …» — торец
// справа у меры (тонкая полоса). Оба несут границу вместо неразличимых заливок.
ok('на крупной полосе есть риска на стыке сегментов (§7.5)', /inset 2px[^;"]*var\(--text\)/.test(hOhta))
ok('на тонкой полосе есть тёмный торец меры', /inset -2px[^;"]*var\(--text\)/.test(hOhta))
ok('нейтральный сегмент несёт штриховку (роль кодируется формой, §7.1)',
  hOhta.includes('repeating-linear-gradient'))
ok('хардкода hex в инлайн-стилях экрана нет', !/style="[^"]*#[0-9a-fA-F]{3,6}/.test(hOhta),
  'нашёлся hex в style')

console.log('\n=== переключатель состояний ===')
async function section(payload) {
  getPayload = payload
  const { el, app } = mount(bundle.DriversSection)
  for (let i = 0; i < 8; i++) await nextTick()
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 8; i++) await nextTick()
  return { el, app }
}
bundle.setPark('network')
const s1 = await section(mock)
ok('переключатель есть', !!s1.el.querySelector('[data-test="view-switch"]'))
const tabs = [...s1.el.querySelectorAll('[data-test="view-switch"] button')]
eq('две вкладки в нужном порядке', tabs.map((b) => b.textContent.trim()), ['Вклад в план', 'Список драйверов'])
ok('«Вклад в план» — дефолтное состояние', tabs[0].getAttribute('aria-selected') === 'true')
ok('на дефолте виден экран вклада', !!s1.el.querySelector('[data-test="parks"]'))
tabs[1].dispatchEvent(new dom.window.Event('click', { bubbles: true }))
await nextTick()
ok('переключение на список работает', !!s1.el.textContent.includes('Что подключено'))
ok('на списке экрана вклада нет', !s1.el.querySelector('[data-test="parks"]'))
const listWithSwitch = withoutSwitch(s1.el)
s1.app.unmount()

// Обратная совместимость: старый деплой бэка без новых вкладок.
const legacy = { ...mock }
delete legacy.driver_contrib
delete legacy.driver_contrib_items
const s2 = await section(legacy)
ok('нет вкладок → переключателя нет вовсе', !s2.el.querySelector('[data-test="view-switch"]'))
ok('нет вкладок → раздел открыт списком', s2.el.textContent.includes('Что подключено'))
ok('нет вкладок → карточки драйверов на месте', s2.el.textContent.includes('Идёт'))
const listLegacy = withoutSwitch(s2.el)
s2.app.unmount()

// ГЛАВНЫЙ ПУНКТ ГЕЙТА §8: «Список драйверов не изменился». Сравниваем разметку
// списка в двух сценариях — когда новые вкладки приехали (и пользователь переключился
// на список) и когда их нет вовсе (это в точности прежнее поведение раздела).
// Единственная допустимая разница — сам переключатель, поэтому его узел снимаем.
// Любая новая секция, группировка или изменённый класс внутри списка уронит проверку.
ok('разметка списка драйверов побайтно одинакова', listWithSwitch === listLegacy,
  `длины ${listWithSwitch.length} и ${listLegacy.length}`)
ok('в списке нет ни одной новой секции экрана вклада',
  !/data-test="(parks|inside|asof|no-split)"/.test(listWithSwitch))

function withoutSwitch(el) {
  const c = el.cloneNode(true)
  const sw = c.querySelector('[data-test="view-switch"]')
  if (sw) sw.remove()
  // Vue оставляет на месте невыполненного v-if комментарий-заглушку `<!--v-if-->`.
  // При отсутствии вкладок его оставляет переключатель, при наличии — сам экран
  // вклада. Это разметка каркаса, а не содержимое списка; снимаем симметрично
  // с обеих сторон, иначе сравнение спорит с самим собой.
  return c.innerHTML.split('<!--v-if-->').join('')
}

ok('нет предупреждений Vue', vueWarns.length === 0, vueWarns.join('\n'))
rmTmp()

console.log(`\n${fail ? '✗' : '✓'} ИТОГО: ${pass} ✓, ${fail} ✗`)
process.exit(fail ? 1 : 0)
