/**
 * verify-kassa.mjs — приёмка ТВ-экрана у кассы /media/kassa/ («Заряди карту онлайн»).
 *
 * Как verify-turbo.mjs: проверяет СОБРАННЫЙ бандл, а не исходник — именно он
 * поедет на панель. Сценарии гоняются в jsdom.
 *
 * Что держит (v1.2, правки владельца 01.10):
 *   · числа на экране совпадают с kassa.data.json И с таблицей подарков,
 *     подтверждённой ИТ 13.08 (она вписана ниже отдельно — если кто-то
 *     поправит данные, проверка покажет расхождение с подтверждённым);
 *   · карточки X1 / X2 / X4–6: слайдер из двух окон «пополнение 1 500 ₽» →
 *     «на карте 2 025 ⚡»; каждое крупное число подписано; подсветка
 *     переезжает по очереди, число досчитывается;
 *   · плашка бонуса во всю ширину — грани одного бонуса: «+525 бонус»,
 *     «≈ +7 игр бонус» (бонус / 70 ₽, вниз), «+500 тикетов за наличные»;
 *   · тикеты — только за наличные, только за точную сумму (200 — за 1 000 ₽,
 *     500 — за 5 000 ₽) и только в Охте и Питерленде;
 *   · при выключенном онлайне QR пропадает (настоящая сборка с online:false);
 *   · запретные слова и проценты на экран не попали;
 *   · у гостя ничего не нажимается, ни одного сетевого запроса;
 *   · канва на месте (механизм турбо).
 *
 * Запуск:  node scripts/verify-kassa.mjs
 * Сам собирает во временный каталог, свой мусор убирает.
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Временная папка в репо (в .gitignore, как у прочих verify-*).
// VERIFY_OUT нужен для сред, где удаление внутри рабочего дерева запрещено.
const OUT = process.env.VERIFY_OUT || resolve(ROOT, '.tmp-verify-kassa')
const OUT_OFF = OUT + '-offline'
// Свой мусор убираем и при сбое посреди прогона, а не только в конце.
process.on('exit', () => { for (const d of [OUT, OUT_OFF]) rmSync(d, { recursive: true, force: true }) })

let failed = 0
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failed++
}
const sp = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Подтверждённая таблица (ИТ 13.08, стоит на b00m.fun/charge) ─────────────
// Здесь — НЕ копия kassa.data.json, а то, с чем данные обязаны совпасть.
const SPEC_STEPS = [
  { sum: 500, gift: 125 },
  { sum: 1000, gift: 300 },
  { sum: 1500, gift: 525 },
  { sum: 2000, gift: 800 },
  { sum: 3000, gift: 1500 },
  { sum: 5000, gift: 3000 },
]
const SPEC_ON_CARD = { 500: 625, 1000: 1300, 1500: 2025, 2000: 2800, 3000: 4500, 5000: 8000 }
// Игры — подарок / 70 ₽ (средняя цена игры с b00m.fun/rewards), вниз до целого.
// Цвет «жидкости» у каждой карточки свой (решение владельца 01.10).
const SPEC_OFFERS = [
  { label: 'X1', sum: 1500, onCard: 2025, gift: 525, games: '≈ +7', main: true, tone: 'lime' },
  { label: 'X2', sum: 3000, onCard: 4500, gift: 1500, games: '≈ +21', main: false, tone: 'cyan' },
  { label: 'X4–6', sum: 5000, onCard: 8000, gift: 3000, games: '≈ +42', main: false, tone: 'pink' },
]
const PHASES = ['p1', 'p2', 'p3']
// Тикеты при оплате наличными (решение владельца 01.10): только за точную
// сумму — 200 за 1 000 ₽, 500 за 5 000 ₽; только Охта и Питерленд. Из трёх
// карточек (1 500 / 3 000 / 5 000) тикеты есть лишь у 5 000.
const SPEC_PARKS = {
  ohta: { name: 'Охта Молл', online: true, hall: false, tickets: [0, 0, 500],
    qr: 'https://b00m.fun/popolnit/ohtamall?from=kassa-tv' },
  piterland: { name: 'Питерленд', online: true, hall: true, tickets: [0, 0, 500],
    qr: 'https://b00m.fun/popolnit/piterland?from=kassa-tv' },
  iyun: { name: 'ТЦ Июнь', online: true, hall: true, tickets: null,
    qr: 'https://b00m.fun/popolnit/june?from=kassa-tv' },
}
const HALL = 'Не хватило — докинем без очереди: скажите сотруднику в зале'
const OFFER = 'Заряди карту онлайн'
const QR_LEAD = 'Докинуть на карту без очереди'
const QR_CAPTION = 'Баланс, тикеты и статус — в твоём телефоне'

// Слова, которых на экране быть не должно. «Статус» и «число игр» сняты с
// запрета владельцем 01.10: подпись QR про статус и «≈ +N игр» он попросил сам.
const FORBIDDEN = [
  [/пакет/i, '«пакет»'],
  [/выгоднее/i, '«выгоднее»'],
  [/на сколько пополня/i, '«на сколько пополняем»'],
  [/бонусы законч/i, '«когда бонусы закончатся»'],
  [/%/, 'проценты'],
  [/турбо/i, 'турбо'],
  [/скидк/i, 'скидки'],
  [/розыгрыш|разыгр/i, 'розыгрыши'],
]

const DATA = JSON.parse(readFileSync(resolve(ROOT, 'media/kassa/kassa.data.json'), 'utf8'))
const { KASSA_QR } = await import(pathToFileURL(resolve(ROOT, 'media/kassa/kassa-qr.js')).href)

// ── сборка ──────────────────────────────────────────────────────────────────
for (const d of [OUT, OUT_OFF]) if (existsSync(d)) rmSync(d, { recursive: true, force: true })
console.log('Сборка носителя…')
execSync(`npm run build -- --outDir ${OUT} --emptyOutDir`, { cwd: ROOT, stdio: 'pipe' })

/* Вторая сборка — с выключенным онлайном у всех парков. Файл данных НЕ
   трогаем: подмена идёт в памяти, плагином сборки. Так проверяется ровно
   то, что случится, когда владелец поставит online:false. */
const { build } = await import('vite')
await build({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.js'),
  logLevel: 'silent',
  build: { outDir: OUT_OFF, emptyOutDir: true },
  plugins: [{
    name: 'verify-kassa-offline',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('kassa.data.json')) return null
      const j = JSON.parse(readFileSync(id, 'utf8'))
      for (const k of Object.keys(j.parks)) j.parks[k].online = false
      return JSON.stringify(j)
    },
  }],
})

function loadBuild(dir) {
  const html = readFileSync(resolve(dir, 'media/kassa/index.html'), 'utf8')
  const name = readdirSync(resolve(dir, 'assets')).find((f) => f.startsWith('kassa-') && f.endsWith('.js'))
  if (!name) {
    console.error('✗ бандл носителя не собрался')
    process.exit(1)
  }
  // Как в verify-turbo: импорт modulepreload-полифила срезаем. Общие чанки
  // (01.10 появился screens-*.js — плеер экранов, общий с «Твоей картой»)
  // вклеиваем: код чанка — в замыкание, его export — в объект, импорт
  // бандла — в разбор этого объекта. Имена у чанка и бандла минифицированы
  // независимо, поэтому замыкание: иначе одноимённые переменные столкнутся.
  // Исполняется ровно тот код, что поедет на панель.
  const strip = (code) => code.replace(/import\s*["'][^"']+["'];?/g, '')
  const chunk = (file) => {
    const code = strip(readFileSync(resolve(dir, 'assets', file), 'utf8'))
    const m = code.match(/export\s*\{([^}]*)\}\s*;?\s*$/)
    if (!m) throw new Error(`чанк ${file}: не нашёл export`)
    const pairs = m[1].split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      const [local, as] = x.split(/\s+as\s+/)
      return `${JSON.stringify(as || local)}: ${local}`
    })
    return `(() => { ${code.slice(0, m.index)}; return { ${pairs.join(', ')} } })()`
  }
  const bundle = strip(readFileSync(resolve(dir, 'assets', name), 'utf8')).replace(
    /import\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+)["'];?/g,
    (_, names, file) => `const {${names.replace(/\s+as\s+/g, ': ')}} = ${chunk(file)};`,
  )
  return { html, bundle }
}
const MAIN = loadBuild(OUT)
const OFF = loadBuild(OUT_OFF)
const { html, bundle } = MAIN

/** Текст узла без скрытых потомков — то, что видит гость. */
function visibleText(root) {
  const c = root.cloneNode(true)
  c.querySelectorAll('[hidden], .liq, .fliq').forEach((n) => n.remove())
  return sp(c.textContent)
}

async function run(query, { build = MAIN, view = [1920, 1080], storage = {}, reduced = false } = {}) {
  const dom = new JSDOM(build.html, {
    url: `https://b00m-cmd.ru/media/kassa/${query}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom
  for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, v)
  // Сеть: любой запрос — провал. Считаем, а не только запрещаем.
  const net = { fetch: 0, xhr: 0, beacon: 0 }
  window.fetch = async () => { net.fetch++; throw new Error('сети нет') }
  window.XMLHttpRequest = function () { net.xhr++; throw new Error('сети нет') }
  window.navigator.sendBeacon = () => { net.beacon++; return false }
  window.matchMedia = (q) => ({ matches: reduced && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} })
  // В jsdom нет Web Animations API — плеер экранов (media/shared/screens.js)
  // ставит CSS-анимации на паузу через document.getAnimations(). В браузере
  // панели он есть; здесь — пустой список.
  if (!window.document.getAnimations) window.document.getAnimations = () => []
  if (!window.Element.prototype.getAnimations) window.Element.prototype.getAnimations = () => []
  // jsdom не считает раскладку: размер окна отдаём только узлу #viewport —
  // этого достаточно, чтобы fitStage посчитал масштаб канвы.
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true, get() { return this.id === 'viewport' ? view[0] : 0 },
  })
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true, get() { return this.id === 'viewport' ? view[1] : 0 },
  })
  window.eval(build.bundle)
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  const d = window.document
  const $ = (id) => d.getElementById(id)
  const cards = () => [...d.querySelectorAll('#cards .card')].map((c) => ({
    el: c,
    main: c.classList.contains('main'),
    on: c.classList.contains('on'),
    // Значок основной — три стрелки сразу за «X1», внутри метки; плашки в
    // углу (.star) больше нет (владелец 01.10)
    star: !!c.querySelector('.fs-x > .chevs'),
    chev: c.querySelectorAll('.fs-x > .chevs > .chev').length,
    corner: !!c.querySelector('.star'),
    crew: c.querySelectorAll('.xlabel .crew .ava').length,
    crewExtra: c.querySelectorAll('.xlabel .crew .ava.extra').length,
    faces9: [...c.querySelectorAll('.xlabel .crew .ava svg')].map((x) => x.querySelector('.f-eyes')?.innerHTML + x.querySelector('.f-mouth')?.innerHTML),
    avaLive: [...c.querySelectorAll('.xlabel .crew .ava')].every((a) => !!a.querySelector('.ava-in svg .f-blink') && !!a.querySelector('svg .f-shout') && /--t:\s*[\d.]+s/.test(a.getAttribute('style'))),
    avaSizes: [...c.querySelectorAll('.xlabel .crew .ava')].map((a) => a.style.getPropertyValue('--s')),
    avaRhythm: [...c.querySelectorAll('.xlabel .crew .ava')].map((a) => `${a.style.getPropertyValue('--t')}/${a.style.getPropertyValue('--d')}`),
    roll: [...c.querySelectorAll('.fs-x .roll b')].map((b) => b.textContent).join(''),
    x: c.querySelector('.fs-x')?.dataset.label || '',
    xLime: sp(c.querySelector('.fs-x i')?.textContent),
    sum: sp(c.querySelector('.fs-sum')?.textContent),
    lblSum: sp(c.querySelector('.l-sum')?.textContent),
    card: sp(c.querySelector('.fs-card .num')?.textContent),
    lblCard: sp(c.querySelector('.l-card')?.textContent),
    phase: PHASES.find((k) => c.classList.contains(k)) || '',
    tone: [...c.classList].find((k) => k.startsWith('tone-')) || '',
    split: c.style.getPropertyValue('--split'),
    liqNum: sp(c.querySelector('.seg-b .liq .fs-card .num')?.textContent),
    liqSum: sp(c.querySelector('.seg-a .liq .fs-sum')?.textContent),
    liqHidden: [...c.querySelectorAll('.liq')].length === 2 && [...c.querySelectorAll('.liq')].every((l) => l.getAttribute('aria-hidden') === 'true'),
    // Молния владельца (01.10): его путь, обёртка .zap и восемь искр
    bolt: !!c.querySelector('.seg-b > .fit-box .fs-card .zap > svg.bolt')
      && (c.querySelector('.seg-b > .fit-box .fs-card svg.bolt path')?.getAttribute('d') || '').startsWith('M491.3,387.2 L735.7,0')
      && c.querySelectorAll('.seg-b > .fit-box .fs-card .zap > .spark').length === 8,
    slider: !c.querySelector('.thumb') && !!c.querySelector('.slider > .seg-a > .fit-box .fs-sum') && !!c.querySelector('.slider > .seg-b > .fit-box .fs-card')
      && !c.querySelector('.funnel, .stream, .neck, .wave'),
    toggle: !!c.querySelector('.toggle'),
    faceFull: [...c.querySelectorAll('.face')].every((f) => {
      const own = sp(`${f.querySelector(':scope > .fbadge')?.textContent} ${f.querySelector(':scope > .fit-box')?.textContent}`)
      const lq = f.querySelector('.fliq')
      return f.parentElement.classList.contains('faces') && !!f.querySelector(':scope > .fbadge > small') && !!f.querySelector(':scope > .fit-box > .fs-face > b')
        && !!lq && sp(`${lq.querySelector('.fbadge')?.textContent} ${lq.querySelector('.fit-box')?.textContent}`) === own && lq.getAttribute('aria-hidden') === 'true'
    }),
    faces: [...c.querySelectorAll('.face')].map((f) => ({
      kind: f.dataset.kind,
      on: f.classList.contains('on'),
      big: sp(f.querySelector('b')?.textContent),
      small: sp(f.querySelector('small')?.textContent),
    })),
  }))
  return {
    window, d, net, cards,
    brand: sp($('brand-park').textContent),
    offer: sp($('offer').textContent),
    offerLime: sp($('offer').querySelector('b')?.textContent),
    stepsHidden: $('steps').hidden,
    stepCount: d.querySelectorAll('#ladder .step').length,
    infoShown: !$('info').hidden,
    hall: sp($('hall').textContent),
    cashRow: !!$('row-tickets'),
    qrShown: !$('qr-tile').hidden,
    qrD: $('qr-path').getAttribute('d') || '',
    qrUrl: $('qr-svg').dataset.url || '',
    qrText: sp($('qr-tile').textContent),
    qrLead: sp($('qr-lead').textContent),
    qrMark: sp($('qr-lead').querySelector('mark')?.textContent),
    qrCap: sp($('qr-cap').textContent),
    qrCapBold: !!$('qr-cap').querySelector('b'),
    qrInner: !!$('qr-lead').querySelector(':scope > span') && !!$('qr-cap').querySelector(':scope > span'),
    viewfinder: !!d.querySelector('#qr-frame .aimbox .cn') && !!d.querySelector('#qr-frame .flash'),
    text: visibleText(d.querySelector('.page')),
    leftText: visibleText(d.querySelector('.leftcol') || d.getElementById('cards')),
    leftcol: !!d.querySelector('.leftcol #cards'),
    body: d.body.className,
    parkErr: $('parkerr').className.includes('on'),
    parkErrAsked: $('parkerr-asked').textContent,
    stampVer: $('stamp-ver').textContent,
    stampWhen: sp($('stamp-when').textContent),
    slot: $('screens'),
    stageW: $('stage').style.width,
    stageH: $('stage').style.height,
    stageT: $('stage').style.transform,
  }
}

console.log('\n── Данные против подтверждённой таблицы подарков ──')
ok('ступени подарка — ровно как в таблице ИТ',
   JSON.stringify(DATA.steps) === JSON.stringify(SPEC_STEPS), JSON.stringify(DATA.steps))
for (const s of SPEC_STEPS) {
  ok(`${fmt(s.sum)} ₽ → на карте ${fmt(SPEC_ON_CARD[s.sum])}`, s.sum + s.gift === SPEC_ON_CARD[s.sum])
}
ok('три суммы кассира: 1 500 / 3 000 / 5 000',
   DATA.offers.map((o) => o.sum).join() === '1500,3000,5000', DATA.offers.map((o) => o.sum).join())
ok('основная — только 1 500', DATA.offers.filter((o) => o.main).map((o) => o.sum).join() === '1500')
ok('метки X1 · X2 · X4–6', DATA.offers.map((o) => o.label).join(' · ') === 'X1 · X2 · X4–6')
ok('цвета карточек: лайм · голубой · розовый, все разные',
   DATA.offers.map((o) => o.tone).join() === SPEC_OFFERS.map((o) => o.tone).join() && new Set(DATA.offers.map((o) => o.tone)).size === DATA.offers.length,
   DATA.offers.map((o) => o.tone).join())
{
  // «Чисто» (решение владельца 01.10): у сосудов нет рамок и бликов, у
  // плашек — обводок, в жидкости — волн, пузырьков и линий раздела слоёв.
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || ''
  const rule = (sel) => (css.match(new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`)) || [])[2] || ''
  ok('у сосуда нет рамки, под сосудами нет подложки с обводкой', rule('.seg') && !/border:/.test(rule('.seg')) && !/box-shadow|background/.test(rule('.slider')), rule('.slider'))
  ok('бликов, волн и пузырьков нет', !/\.seg::after|\.wave|@keyframes (fizz|wave-x|flow)/.test(css))
  ok('у плашек бонуса нет обводки', rule('.face') && !/box-shadow/.test(rule('.face')))
  // 01.10: углы сосуда «пропадали» на секунду через раз — Chrome на время
  // перехода выносит жидкость на свой слой и не обрезает её по скруглению
  // сосуда. Жидкость и заливка плашки скруглены сами.
  ok('жидкость скруглена сама, плашка — clip-path (углы не пропадают)', /border-radius:inherit/.test(rule('.liq')) && /clip-path:inset\(0 round 18px\)/.test(rule('.faces')))
  ok('углы сосудов при переливе не меняются', !/\.p2 \.seg-[ab]\{[^}]*radius/.test(css))
  ok('верхний сосуд при переливе чуть наклоняется (владелец 01.10)', /\.card\.p2 \.seg-a\{transform:rotate\(3deg\)\}/.test(css))
  ok('сосуды — пропорции пластиковой карты', /aspect-ratio:1\.586/.test(rule('.seg')))
  ok('подписи сосудов крупные и цветом карточки', /font-size:26px/.test(rule('.seg .lbl')) && /color:var\(--c2\)/.test(rule('.seg .lbl')))
  ok('плашка: чёрный бейдж сверху, цифра под ним (владелец 01.10)',
     /flex-direction:column/.test(rule('.face')) && /background:var\(--dark\)/.test(rule('.fbadge small')))
  ok('плашка берёт остаток высоты карточки, кегль цифры — под плашку', /flex:1 1 0/.test(rule('.faces')) && /min-height:150px/.test(rule('.faces')))
  ok('плашка обрезана по скруглению clip-path — «барабан» не вылезает за край', /clip-path:inset\(0 round 18px\)/.test(rule('.faces')) && !/translateY\(12px\)/.test(rule('.face')))
  ok('между окнами ничего нет — воронки и струи в стилях нет (владелец 01.10)', !/\.funnel|\.stream\{/.test(css))
  ok('слой бонуса без линии раздела — плавный переход', /\.seg-b \.liq\{background:linear-gradient\(0deg, var\(--c\) 0 calc\(var\(--split,70%\) - 8%\), var\(--c2\) calc\(var\(--split,70%\) \+ 8%\)\)[^;}]*\}/.test(css))
}
{
  // Цвета описаны в стилях страницы — у каждого тона свой --c
  const toneC = Object.fromEntries(SPEC_OFFERS.map((o) => [o.tone, (html.match(new RegExp(`\\.tone-${o.tone}[^{]*\\{--c:(#[0-9a-f]{6})`, 'i')) || [])[1] || '']))
  ok('в стилях у каждого цвета свой оттенок', Object.values(toneC).every(Boolean) && new Set(Object.values(toneC)).size === 3, JSON.stringify(toneC))
}
ok('средняя цена игры — 70 ₽, как на /rewards', DATA.game_price === 70, String(DATA.game_price))
ok('полоса ступеней выключена (решение владельца 01.10)', DATA.show_steps === false)
ok('парков ровно три, коды как у турбо', DATA.park_order.join() === 'ohta,piterland,iyun')
for (const [code, s] of Object.entries(SPEC_PARKS)) {
  const p = DATA.parks[code] || {}
  ok(`${code}: название как у турбо («${s.name}»)`, p.name === s.name, p.name)
  ok(`${code}: тикеты за наличные ${s.tickets ? '200 за 1 000 ₽ и 500 за 5 000 ₽ (точно)' : '— акции нет'}`,
     s.tickets ? JSON.stringify(p.cash_tickets) === '[{"sum":1000,"tickets":200},{"sum":5000,"tickets":500}]'
               : Array.isArray(p.cash_tickets) && p.cash_tickets.length === 0, JSON.stringify(p.cash_tickets))
  ok(`${code}: строка докидки ${s.hall ? 'есть' : 'нет'}`, p.topup_in_hall === s.hall)
  ok(`${code}: флаг онлайна заведён`, typeof p.online === 'boolean')
}

console.log('\n── QR: адреса и метка счётчика ──')
for (const [code, s] of Object.entries(SPEC_PARKS)) {
  const q = KASSA_QR[code]
  ok(`${code}: QR ведёт на ${s.qr}`, q && q.url === s.qr, q && q.url)
  ok(`${code}: QR собран из слага данных`,
     q && q.url === `https://b00m.fun/popolnit/${DATA.parks[code].slug}?from=kassa-tv`)
  ok(`${code}: путь кода вшит`, q && q.d.length > 1000, q ? `${q.d.length} симв.` : '')
}

console.log('\n── Экран по паркам ──')
for (const [code, s] of Object.entries(SPEC_PARKS)) {
  const r = await run(`?park=${code}&tv=1`)
  const cards = r.cards()
  console.log(`  · ${code}`)
  ok(`${code}: бейдж «БУМБАСТИК // ${s.name}»`, r.brand === s.name, r.brand)
  ok(`${code}: оффер «${OFFER}», «онлайн» лаймом`, r.offer === OFFER && r.offerLime === 'онлайн', `${r.offer} / ${r.offerLime}`)
  ok(`${code}: три карточки`, cards.length === 3, String(cards.length))
  ok(`${code}: карточки — в левой колонке .leftcol`, r.leftcol)
  SPEC_OFFERS.forEach((o, i) => {
    const c = cards[i] || { faces: [] }
    const t = s.tickets ? s.tickets[i] : 0
    ok(`${code}: ${o.label} — ${fmt(o.sum)} ₽ → на карте ${fmt(o.onCard)}`,
       c.x === o.label && c.xLime === 'X' && c.sum === `${fmt(o.sum)} ₽` && c.card === fmt(o.onCard),
       `${c.x} · ${c.sum} → ${c.card}`)
    ok(`${code}: ${o.label} — каждое число подписано`, c.lblSum === 'пополнение' && c.lblCard === 'на карте')
    ok(`${code}: ${o.label} — два сосуда, между ними ничего (ни воронки, ни струи, ни волн)`, c.slider && !c.toggle)
    ok(`${code}: ${o.label} — цвет «${o.tone}»`, c.tone === `tone-${o.tone}`, c.tone)
    ok(`${code}: ${o.label} — «жидкость» с тем же текстом, скрыта от чтения`,
       c.liqHidden && c.liqSum === c.sum && c.liqNum === c.card, `${c.liqSum} / ${c.liqNum}`)
    ok(`${code}: ${o.label} — слой денег ${Math.round((o.sum / o.onCard) * 1000) / 10}% сосуда «на карте»`,
       c.split === `${Math.round((o.sum / o.onCard) * 1000) / 10}%`, c.split)
    ok(`${code}: ${o.label} — после числа «на карте» молния владельца, с искрами для разряда`, c.bolt)
    ok(`${code}: ${o.label} — плашка во всю ширину: бейдж сверху, цифра под ним, копия в заливке`, c.faceFull)
    ok(`${code}: ${o.label} — ${o.main ? 'три стрелки сразу за «X1», плашки в углу нет' : 'не выделена'}`,
       c.main === o.main && c.star === o.main && !c.corner && (!o.main || c.chev === 3))
    if (o.label === 'X4–6') ok(`${code}: X4–6 — без тире: цифра крутится 4 → 5 → 6`, c.roll === '456' && !/[–-]/.test(c.el.querySelector('.fs-x').textContent), c.roll)
    {
      const want = { X1: [1, 0], X2: [2, 0], 'X4–6': [6, 2] }[o.label]
      ok(`${code}: ${o.label} — пиксельные лица: ${want[0] - want[1]}${want[1] ? ` → ${want[0]} (двое подходят по кругу)` : ''}`,
         c.crew === want[0] && c.crewExtra === want[1], `${c.crew}/${c.crewExtra}`)
    }
    const want = [
      { kind: 'gift', big: `+${fmt(o.gift)}`, small: 'бонус' },
      { kind: 'games', big: o.games, small: 'бонус в играх' },
      ...(t ? [{ kind: 'tickets', big: `+${t}`, small: 'тикеты за наличные' }] : []),
    ]
    const got = c.faces.map(({ kind, big, small }) => ({ kind, big, small }))
    ok(`${code}: ${o.label} — плашка: ${want.map((w) => `${w.big} ${w.small}`).join(' / ')}`,
       JSON.stringify(got) === JSON.stringify(want), got.map((w) => `${w.big} ${w.small}`).join(' / '))
    ok(`${code}: ${o.label} — видна одна грань, первая — подарок`, c.faces.filter((f) => f.on).length === 1 && c.faces[0]?.on)
  })
  {
    const all = cards.flatMap((x) => x.faces9)
    ok(`${code}: у всех девяти лиц разные эмоции`, all.length === 9 && new Set(all).size === 9, `${new Set(all).size} из ${all.length}`)
    const sizes = new Set(cards.flatMap((x) => x.avaSizes))
    ok(`${code}: лица одного размера у всех трёх карточек (не уменьшаются у X4–6)`, sizes.size === 1, [...sizes].join())
    ok(`${code}: лица живые — моргают и кричат, у каждого свой ритм`,
       cards.every((x) => x.avaLive) && new Set(cards.flatMap((x) => x.avaRhythm)).size === 9)
  }
  ok(`${code}: в шапке слоган «Играй больше — плати меньше», «плати меньше» лаймом`,
     sp(r.d.querySelector('.head .slogan')?.textContent) === 'Играй больше — плати меньше' && sp(r.d.querySelector('.head .slogan b')?.textContent) === 'плати меньше')
  ok(`${code}: полосы ступеней нет`, r.stepsHidden && r.stepCount === 0 && !r.text.includes('Круглая сумма'))
  ok(`${code}: нижней строки про тикеты нет — тикеты в карточках`, !r.cashRow)
  if (code === 'ohta') ok('ohta: подарка +125 на экране нет', !/\+125\b/.test(r.text))
  if (!s.tickets) {
    ok(`${code}: про тикеты и наличные в карточках ни слова`, !/тикет|налич/i.test(r.leftText), r.leftText.match(/тикет|налич/i)?.[0])
  } else {
    ok(`${code}: тикеты — только «за наличные»`, (r.leftText.match(/тикет/g) || []).length === (r.leftText.match(/за наличные/g) || []).length)
  }
  ok(`${code}: строка докидки ${s.hall ? 'есть' : 'нет'}`,
     s.hall ? r.infoShown && r.hall === HALL : !r.infoShown && !r.text.includes('докинем'))
  ok(`${code}: QR на экране`, r.qrShown && r.qrD === KASSA_QR[code].d && r.qrUrl === s.qr, r.qrUrl)
  ok(`${code}: над QR «${QR_LEAD}», «без очереди» выделено`, r.qrLead === QR_LEAD && r.qrMark === 'без очереди', r.qrLead)
  ok(`${code}: подпись QR — целиком синяя, без тёмной половины`, r.qrCap === QR_CAPTION && !r.qrCapBold, r.qrCap)
  ok(`${code}: тексты у QR стоят по центру своего поля (внутренний span)`, r.qrInner)
  ok(`${code}: «в подарок» заменено на «бонус»`, !/в подарок/i.test(r.text))
  ok(`${code}: видоискатель как у «Твоей карты»`, r.viewfinder)
  ok(`${code}: рядом с QR о наличных ни слова`, !/налич/i.test(r.qrText), r.qrText)
  for (const [re, what] of FORBIDDEN) ok(`${code}: нет: ${what}`, !re.test(r.text), (r.text.match(re) || [''])[0])
  ok(`${code}: ни одного запроса в сеть`, r.net.fetch + r.net.xhr + r.net.beacon === 0, JSON.stringify(r.net))
  ok(`${code}: режим ТВ включён`, r.body.split(' ').includes('tv'))
  ok(`${code}: «Парк не найден» не показан`, !r.parkErr)
}

console.log('\n── Движение: «перелей воду» по очереди, плашка — все грани ──')
{
  // Тайминг kassa.js — от старта первой карточки (после заставки плеера):
  // p1 1 с → p2 0,9 с → p3 + досчёт 1,1 с → «красуется» 1,6 с. «На карте»
  // доходит до половины через ~1,45 с после старта карточки — плашка
  // наливается и идёт по всем граням, по 1,7 с каждая; только потом
  // следующая карточка (cardMs):
  //   X1 +0–5,0 (половина 1,44; игры 3,14) · X2 +5,0–10,0 (игры 8,18) ·
  //   X4–6 +10,0–16,6 (игры 13,22; тикеты 14,92) · X1 снова с +16,6, и
  //   плеер, отыграв полный круг (cycleMs), уводит на «Твою карту».
  // Гаснет карточка — заливка стекает, значение плашки остаётся.
  const r = await run('?park=ohta&tv=1')
  const w = r.window
  const cs = (el) => w.getComputedStyle(el)
  const kinds = (cc) => cc.map((x) => x.faces.find((f) => f.on)?.kind).join()
  const faceBg = (cc, i) => (cs(cc[i].el.querySelector('.face.on .fliq')).opacity === '1' ? 'залита' : 'не залита')
  const lblT = (cc, i, k) => cs(cc[i].el.querySelector(`${k} > .lbl`)).transform || ''
  const cards0 = r.cards()
  ok('до старта все числа — итог, сосуды спокойные',
     cards0.map((c) => c.card).join(' / ') === '2 025 / 4 500 / 8 000' && cards0.every((c) => !c.phase && !c.on))
  ok('у каждой карточки свой цвет', new Set(cards0.map((c) => c.tone)).size === 3, cards0.map((c) => c.tone).join())
  // Плеер экранов (media/shared/screens.js) на старте ждёт вторую страницу —
  // «Твою карту» в скрытом iframe — и держит заставку. В jsdom iframe не
  // грузится: отвечаем за неё сами, как это делает встроенная страница
  // (window.parent.boomScreens.register). Время дальше — от старта карточек.
  ok('плеер экранов поднят (window.boomScreens)', !!w.boomScreens)
  w.boomScreens?.register({ id: 'loyalty', cycleMs: () => 42400, restart() {}, pause() {}, resume() {}, update() {} })
  const t0 = Date.now()
  while (!r.cards()[0].on && Date.now() - t0 < 10000) await wait(20)
  ok('после заставки плеера пошли карточки', r.cards()[0].on, `${Date.now() - t0} мс`)

  await wait(500)    // X1 +0,5 — p1
  let c = r.cards()
  ok('первой — 1 500: наливается «пополнение», внизу пока та же сумма',
     c[0].on && c[0].phase === 'p1' && c[0].card === '1 500' && c[0].liqNum === '1 500' && !c[1].on && !c[2].on, `${c[0].card} ${c[0].phase}`)
  ok('пока наливается — «на карте» в тени', Number(cs(c[0].el.querySelector('.seg-b')).opacity) < 0.5, cs(c[0].el.querySelector('.seg-b')).opacity)
  ok('подпись «пополнение» выросла, «на карте» — уменьшилась', lblT(c, 0, '.seg-a') === 'scale(1.2)' && lblT(c, 0, '.seg-b') === 'scale(.85)',
     `${lblT(c, 0, '.seg-a')} / ${lblT(c, 0, '.seg-b')}`)
  ok('пока «на карте» пусто — плашка не залита, у всех бонус', faceBg(c, 0) === 'не залита' && kinds(c) === 'gift,gift,gift', `${faceBg(c, 0)} ${kinds(c)}`)

  await wait(700)    // X1 +1,2 — p2
  c = r.cards()
  ok('перелив: верхний чуть наклонён, оба сосуда не в тени',
     c[0].phase === 'p2' && /rotate\(3deg\)/.test(cs(c[0].el.querySelector('.seg-a')).transform || '')
       && Number(cs(c[0].el.querySelector('.seg-a')).opacity || 1) === 1 && Number(cs(c[0].el.querySelector('.seg-b')).opacity || 1) === 1,
     `${c[0].phase} ${cs(c[0].el.querySelector('.seg-a')).transform}`)
  ok('в начале перелива «на карте» меньше половины — плашка стоит', !c[0].el.classList.contains('half') && faceBg(c, 0) === 'не залита' && kinds(c) === 'gift,gift,gift')

  await wait(600)    // X1 +1,8 — налита наполовину
  c = r.cards()
  ok('«на карте» за половиной — плашка ожила: залита, первая грань — бонус',
     c[0].el.classList.contains('half') && faceBg(c, 0) === 'залита' && kinds(c) === 'gift,gift,gift', `${faceBg(c, 0)} ${kinds(c)}`)
  {
    const fq = c[0].el.querySelector('.face.on .fliq .fs-face')
    const col = (n) => (cs(n).getPropertyValue('color') || '').trim()
    ok('в залитой плашке цифра тёмная, бейдж — чёрный', ['var(--dark)', 'rgb(13, 10, 46)'].includes(col(fq.querySelector('b'))),
       col(fq.querySelector('b')))
  }
  ok('у спокойных карточек плашка не залита', [1, 2].every((i) => !c[i].el.classList.contains('half') && faceBg(c, i) === 'не залита'))

  await wait(1600)   // X1 +3,4 — досчитана, красуется, плашка на играх
  c = r.cards()
  ok('досчиталось до 2 025 (и в «жидкости» тоже)',
     c[0].on && c[0].phase === 'p3' && c[0].card === '2 025' && c[0].liqNum === '2 025' && c[0].el.classList.contains('done'), `${c[0].card} ${c[0].phase}`)
  ok('налито до краёв — молния бьёт разрядом (вспышка, рывок, искры)',
     /zap/.test(`${cs(c[0].el.querySelector('.seg-b .liq .bolt')).animationName} ${cs(c[0].el.querySelector('.seg-b .liq .bolt')).getPropertyValue('animation')}`)
       && /zap-spark/.test(`${cs(c[0].el.querySelector('.seg-b .liq .spark')).animationName} ${cs(c[0].el.querySelector('.seg-b .liq .spark')).getPropertyValue('animation')}`),
     cs(c[0].el.querySelector('.seg-b .liq .bolt')).getPropertyValue('animation'))
  ok('у спокойных карточек молния не бьёт', ![1, 2].some((i) => /zap/.test(`${cs(c[i].el.querySelector('.seg-b .bolt')).animationName} ${cs(c[i].el.querySelector('.seg-b .bolt')).getPropertyValue('animation')}`)))
  ok('«на карте» красуется — поворот гранями и свет', /brag/.test(`${cs(c[0].el.querySelector('.seg-b')).animationName} ${cs(c[0].el.querySelector('.seg-b')).getPropertyValue('animation')}`),
     cs(c[0].el.querySelector('.seg-b')).getPropertyValue('animation'))
  ok('подпись «на карте» выросла, «пополнение» — уменьшилась', lblT(c, 0, '.seg-b') === 'scale(1.2)' && lblT(c, 0, '.seg-a') === 'scale(.85)')
  ok('плашка 1 500 перешла к играм, у спокойных стоит бонус', kinds(c) === 'games,gift,gift', kinds(c))
  ok('пустое «пополнение» — в тени, «на карте» — нет',
     Number(cs(c[0].el.querySelector('.seg-a')).opacity) < 0.5 && Number(cs(c[0].el.querySelector('.seg-b')).opacity || 1) === 1)

  await wait(1300)   // X1 +4,7 — ещё держит ход: обе грани показаны, «красуется» досматривается
  c = r.cards()
  ok('пока плашка не показала все грани — ход не переходит', c[0].on && !c[1].on, c.map((x) => x.on).join())
  ok('«барабан» закончился чисто: видна одна грань, меток смены нет',
     c.every((x) => x.faces.filter((f) => f.on).length === 1) && !r.d.querySelector('.face.roll-in, .face.roll-out'))

  await wait(600)    // X1 +5,3 — X2 p1
  c = r.cards()
  ok('следом — 3 000; у первой итог на месте, заливка плашки стекла, значение осталось (игры)',
     !c[0].on && !c[0].phase && c[1].on && c[1].phase === 'p1' && c[0].card === '2 025' && kinds(c) === 'games,gift,gift' && faceBg(c, 0) === 'не залита',
     `${c.map((x) => x.phase || '-').join()} ${kinds(c)}`)
  ok('у спокойных карточек оба сосуда читаются', [0, 2].every((i) =>
    Number(cs(c[i].el.querySelector('.seg-a')).opacity || 1) === 1 && Number(cs(c[i].el.querySelector('.seg-b')).opacity || 1) === 1))

  await wait(3200)   // X1 +8,5 — X2 на играх
  c = r.cards()
  ok('3 000: плашка ожила и перешла к играм, остальные стоят', c[1].on && kinds(c) === 'games,games,gift', kinds(c))

  await wait(6700)   // X1 +15,2 — X4–6 на тикетах
  c = r.cards()
  ok('5 000: плашка дошла до тикетов («тикеты за наличные»), остальные стоят',
     c[2].on && kinds(c) === 'games,games,tickets' && c[2].faces.find((f) => f.on)?.small === 'тикеты за наличные', kinds(c))

  await wait(1800)   // X1 +17,0 — снова X1
  c = r.cards()
  ok('показав все три грани, ход вернулся к 1 500; плашки спокойных стоят на своём', c[0].on && !c[2].on && kinds(c) === 'games,games,tickets', `${c.map((x) => x.on).join()} ${kinds(c)}`)
  await wait(1200)   // X1 +18,2 — круг отыгран, плеер увёл на «Твою карту»
  ok('после полного круга карточек плеер переключил на «Твою карту»', !!r.d.querySelector('.sc-frame.on'))
  r.window.close()

  const z = await run('?park=ohta', { reduced: true })
  await wait(900)
  const zc = z.cards()
  ok('без движения: сосуды спокойные, итоги стоят, плашки на бонусе',
     zc.every((x) => !x.phase && !x.on) && zc.map((x) => x.card).join(' / ') === '2 025 / 4 500 / 8 000' && kinds(zc) === 'gift,gift,gift')
  z.window.close()
}

console.log('\n── Онлайн выключен — QR пропадает (сборка с online:false) ──')
for (const [code, s] of Object.entries(SPEC_PARKS)) {
  const r = await run(`?park=${code}`, { build: OFF })
  const cards = r.cards()
  ok(`${code}: плитки QR нет`, !r.qrShown && r.qrD === '' && r.qrUrl === '')
  ok(`${code}: раскладка без QR (no-online)`, r.body.includes('no-online'))
  ok(`${code}: слов про телефон и камеру на экране нет`, !/телефон|камер/i.test(r.text), r.text.match(/телефон|камер/i)?.[0])
  ok(`${code}: карточки остались`, cards.length === 3 && cards[0].card === '2 025')
  if (s.tickets) ok(`${code}: тикеты за наличные в карточке 5 000 остались`, cards[2].faces.some((f) => f.big === '+500' && f.small === 'тикеты за наличные'))
}

console.log('\n── Песочница и защита от правки адресом ──')
{
  const r = await run('?park=piterland&demo=1&online=0')
  ok('?demo=1&online=0 — QR скрыт для предпросмотра', !r.qrShown && r.body.includes('no-online'))
  ok('песочница видна только в demo', r.d.getElementById('demo').className.includes('on'))
  const r2 = await run('?park=piterland&online=0')
  ok('без demo адрес online=0 не действует', r2.qrShown && r2.qrUrl === SPEC_PARKS.piterland.qr)
  ok('без demo песочницы нет', !r2.d.getElementById('demo').className.includes('on'))
  // 01.10: метка песочницы на <body> совпала с классом плашки .demo
  // (display:none) — в предпросмотре пропадала вся страница. jsdom раскладку
  // не считает, но каскад стилей применяет — этого хватает, чтобы поймать.
  for (const [q, name] of [['?park=piterland&demo=1&online=0', 'песочница'], ['?park=ohta&tv=1', 'режим ТВ'], ['?park=ohta', 'обычный']]) {
    const x = await run(q)
    const w = x.window
    ok(`${name}: страница не скрыта стилями`,
       w.getComputedStyle(x.d.body).display !== 'none' && w.getComputedStyle(x.d.getElementById('viewport')).display !== 'none' &&
       w.getComputedStyle(x.d.querySelector('.page')).display !== 'none')
  }
  // 01.10: обёртку левой колонки назвали .main — тем же именем, что основная
  // карточка, и она уехала в чужую область сетки. Классы-«области» сетки не
  // должны совпадать с классами карточек.
  const html2 = html.replace(/\/\*[\s\S]*?\*\//g, '')
  const areaClasses = [...html2.matchAll(/(?:^|[\s}])\.([a-z][\w-]*)\{[^}]*grid-area:\s*([a-z]+)/g)].map((m) => m[1])
  ok('классы областей сетки не совпадают с классами карточек (.main, .on, .done)',
     areaClasses.length > 0 && !areaClasses.some((c) => ['main', 'on', 'done', 'card'].includes(c)), areaClasses.join(','))
}

console.log('\n── Парк в адресе ──')
{
  const r = await run('?park=moskva')
  ok('неизвестный парк → «Парк не найден»', r.parkErr && r.parkErrAsked === '?park=moskva', r.parkErrAsked)
  ok('неизвестный парк → QR не рисуется', r.qrD === '')
  const r2 = await run('?park=OHTA')
  ok('код парка без учёта регистра', !r2.parkErr && r2.brand === 'Охта Молл')
  const r3 = await run('')
  ok('без ?park= — первый парк', r3.brand === 'Охта Молл', r3.brand)
  const r4 = await run('', { storage: { 'boom-turbo-park': 'iyun' } })
  ok('без ?park= — парк, выбранный на соседнем экране', r4.brand === 'ТЦ Июнь', r4.brand)
}

console.log('\n── Шапка, подвал, штамп ──')
{
  const r = await run('?park=ohta')
  // 01.10 соседняя сессия поставила в слот плеер экранов (media/shared/
  // screens.js): «Твоя карта ⇄ Заряди карту», ▶/❚❚, режим смены; выбор
  // парка — список на плашке бренда. Переключателя парков турбо нет.
  // Подписи экранов плеер берёт из SCREENS в screens.js (их меняет хозяин
  // плеера: 01.10 стали «Статус» / «Зарядка») — сверяем с ним, не с текстом.
  {
    const src = readFileSync(resolve(ROOT, 'media/shared/screens.js'), 'utf8')
    const names = [...src.matchAll(/\{\s*id:\s*'(?:loyalty|kassa)',\s*name:\s*'([^']+)'/g)].map((m) => m[1])
    ok(`в слоте шапки — плеер экранов («${names.join('» ⇄ «')}»)`,
       !!r.slot && names.length === 2 && names.every((n) => r.slot.textContent.includes(n)), sp(r.slot?.textContent))
  }
  ok('переключателя парков турбо нет', !r.d.getElementById('parks'))
  // Бейдж — как у турбо и «Твоей карты»: время МСК, версия, дата сборки, ⟳
  ok('бейдж: время загрузки с поясом МСК', /^\d{2}\.\d{2} \d{2}:\d{2} МСК$/.test(r.stampWhen), r.stampWhen)
  ok('бейдж: «v2.4 · собрано ДД.ММ»', /^v2\.4 · собрано \d{2}\.\d{2}$/.test(sp(r.stampVer)), r.stampVer)
  ok('бейдж: кнопка обновления ⟳', !!r.d.querySelector('.fineband .stamp button#reload'))
  ok('бейдж: подсказка по нажатию', !!r.d.getElementById('hint'))
  r.d.getElementById('stamp').dispatchEvent(new r.window.Event('click', { bubbles: true }))
  ok('бейдж: нажатие показывает подсказку', r.d.getElementById('hint').className.includes('on') &&
     /Зелёная точка/.test(r.d.getElementById('hint').textContent))
  ok('иконка бренда инлайном в шапке', !!r.d.querySelector('.head .brand-icon path'))
  const turboHtml = readFileSync(resolve(OUT, 'media/turbo/index.html'), 'utf8')
  const fonts = (h) => (h.match(/fonts\.googleapis\.com\/css2\?[^"]+/) || [''])[0]
  ok('шрифты и веса — ровно как у турбо', fonts(html) && fonts(html) === fonts(turboHtml), fonts(html))
}

console.log('\n── У гостя ничего не нажимается, ничего не грузится ──')
{
  // Нажимается только служебный подвал (как у турбо и «Твоей карты»):
  // ссылка «Работает на Ранскеил», бейдж с подсказкой и ⟳. Всё остальное —
  // содержание для гостя, там ни ссылок, ни кнопок быть не должно.
  const body = html.slice(html.indexOf('<body')).replace(/<!--[\s\S]*?-->/g, '')
  const r = await run('?park=ohta')
  const page = r.d.querySelector('.page').cloneNode(true)
  page.querySelector('.fineband').remove()
  // Служебное — шапка (плеер экранов и выбор парка) и подвал; в карточках,
  // строке «докинем» и QR для гостя ничего не нажимается.
  page.querySelector('.head').remove()
  ok('в содержании для гостя нет ссылок', !page.querySelector('a'))
  ok('в содержании для гостя нет кнопок и полей (служебное — только шапка и подвал)', !page.querySelector('button, input, select, textarea, form, [role=button]'))
  const fineLinks = [...r.d.querySelectorAll('.fineband a')].map((a) => a.getAttribute('href'))
  // Адрес — как у «Твоей карты» v6.3 (ultra.runscale.ru)
  ok('в подвале одна ссылка — «Работает на Ранскеил»', fineLinks.join() === 'https://ultra.runscale.ru', fineLinks.join())
  ok('в подвале одна кнопка — ⟳', [...r.d.querySelectorAll('.fineband button')].map((b) => b.id).join() === 'reload')
  ok('нет обработчиков в разметке', !/\son[a-z]+=/i.test(body))
  ok('в коде нет обработчиков касаний и клавиш', !/addEventListener\(\s*["'](pointerdown|touchstart|keydown)/.test(bundle))
  ok('в коде нет fetch / XHR / sendBeacon', !/\bfetch\(|XMLHttpRequest|sendBeacon/.test(bundle))
  ok('нет адресов Apps Script и Google-таблиц', !/script\.google|googleusercontent|docs\.google/.test(bundle + html))
  ok('нет переменных окружения (VITE_*)', !/VITE_[A-Z_]+/.test(bundle))
  ok('данные вкомпилированы в бандл', bundle.includes('X4–6') && bundle.includes('kassa-tv'))
}

console.log('\n── Канва: механизм турбо ──')
{
  const html2 = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  ok('канва — отдельный узел со своим масштабом',
     html.includes('id="stage"') && html.includes('id="viewport"') && /\.stage\{[^}]*transform-origin/.test(html2))
  ok('нет резиновой канвы (max-width/100dvh у .page)',
     !/\.page\{[^}]*max-width/.test(html2) && !/\.page\{[^}]*100dvh/.test(html2))
  ok('подгон кегля замером по ширине текста', bundle.includes('offsetWidth') && /\.fit\{[^}]*display:inline-block/.test(html2))
  ok('подгон пересчитывается после загрузки шрифта', bundle.includes('fonts.ready') && bundle.includes('.status'))
  const a = await run('?park=ohta', { view: [1920, 1080] })
  ok('1920×1080 → канва 1920×1080, масштаб 1', a.stageW === '1920px' && a.stageH === '1080px' && a.stageT === 'scale(1)',
     `${a.stageW}×${a.stageH} ${a.stageT}`)
  const b = await run('?park=ohta', { view: [1280, 720] })
  ok('1280×720 → та же канва 1920×1080, масштаб 2/3', b.stageW === '1920px' && b.stageH === '1080px' && /^scale\(0\.666/.test(b.stageT),
     `${b.stageW}×${b.stageH} ${b.stageT}`)
  const c = await run('?park=ohta', { view: [1080, 1920] })
  ok('1080×1920 → вертикаль 1080×1920', c.body.includes('portrait') && c.stageW === '1080px' && c.stageH === '1920px',
     `${c.stageW}×${c.stageH}`)
  const e = await run('?park=ohta', { view: [2560, 1080] })
  ok('широкая панель → канва шире эталона, без полей', e.stageW === '2560px' && e.stageH === '1080px', `${e.stageW}×${e.stageH}`)
  ok('заглушка для малых экранов', html.includes('class="toosmall"') && html.includes('Экран для ТВ-панели'))
  ok('суточный перезапуск в режиме ТВ', bundle.includes('05:00') && bundle.includes('location.reload'))
  const sw = readFileSync(resolve(OUT, 'sw.js'), 'utf8')
  ok('/media/ исключён из service worker', sw.includes("BASE + 'media/'"))
  ok('все входы собраны (app, turbo, loyalty, kassa)',
     ['index.html', 'media/turbo/index.html', 'media/loyalty/index.html', 'media/kassa/index.html']
       .every((f) => existsSync(resolve(OUT, f))))
}

for (const d of [OUT, OUT_OFF]) rmSync(d, { recursive: true, force: true })
console.log(failed ? `\n✗ ПРОВАЛЕНО ПРОВЕРОК: ${failed}` : '\n✓ Приёмка экрана у кассы пройдена')
process.exit(failed ? 1 : 0)
