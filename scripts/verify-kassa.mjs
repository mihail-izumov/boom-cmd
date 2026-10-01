/**
 * verify-kassa.mjs — приёмка ТВ-экрана у кассы /media/kassa/ («Пополни карту»).
 *
 * Как verify-turbo.mjs: проверяет СОБРАННЫЙ бандл, а не исходник — именно он
 * поедет на панель. Сценарии гоняются в jsdom.
 *
 * Что держит:
 *   · числа на экране совпадают с kassa.data.json И с таблицей подарков,
 *     подтверждённой ИТ 13.08 (она вписана ниже отдельно — если кто-то
 *     поправит данные, проверка покажет расхождение с подтверждённым);
 *   · переключатели парков: у Охты нет ступени 500, у Июня нет строки про
 *     тикеты, строка докидки — у Питерленда и Июня, при выключенном онлайне
 *     QR пропадает (проверяется настоящей сборкой с online:false);
 *   · запретные слова, проценты и «число игр» на экран не попали;
 *   · ни одного сетевого запроса и ни одного нажимаемого элемента;
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

let failed = 0
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failed++
}
const sp = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

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
const SPEC_OFFERS = [
  { who: 'Один', sum: 1500, onCard: 2025, gift: 525, main: true },
  { who: 'Вдвоём', sum: 3000, onCard: 4500, gift: 1500, main: false },
  { who: 'Компания 4–6', sum: 5000, onCard: 8000, gift: 3000, main: false },
]
const SPEC_PARKS = {
  ohta: {
    name: 'Охта Молл', stepsFrom: 1000, online: true, hall: false,
    tickets: '+200 тикетов при оплате наличными от 1 000 ₽',
    qr: 'https://b00m.fun/popolnit/ohtamall?from=kassa-tv',
  },
  piterland: {
    name: 'Питерленд', stepsFrom: 500, online: true, hall: true,
    tickets: '200 тикетов за 1 000 ₽ и 500 тикетов за 5 000 ₽ — при оплате наличными',
    qr: 'https://b00m.fun/popolnit/piterland?from=kassa-tv',
  },
  iyun: {
    name: 'ТЦ Июнь', stepsFrom: 500, online: true, hall: true,
    tickets: '',
    qr: 'https://b00m.fun/popolnit/june?from=kassa-tv',
  },
}
const HALL = 'Не хватило — докинем без очереди: скажите сотруднику в зале'
const QR_CAPTION = 'Пополняй с телефона — подарки те же, без очереди'
const OFFER = 'Пополни карту — играй больше'

// Слова, которых на экране быть не должно (решение владельца 01.10)
const FORBIDDEN = [
  [/пакет/i, '«пакет»'],
  [/выгоднее/i, '«выгоднее»'],
  [/на сколько пополня/i, '«на сколько пополняем»'],
  [/бонусы законч/i, '«когда бонусы закончатся»'],
  [/%/, 'проценты'],
  // \b в JS не видит границ кириллических слов — граница задана явно
  [/\d[\d\s]*\+?\s*игр(?![а-яё])|\+\s*\d+\s*игр/i, 'число игр'],
  [/турбо/i, 'турбо'],
  [/статус/i, 'статусы'],
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
  // Как в verify-turbo: импорт modulepreload-полифила срезаем — чанк у
  // носителя один, остальной код исполняется ровно тот, что поедет на панель.
  const bundle = readFileSync(resolve(dir, 'assets', name), 'utf8').replace(/import\s*["'][^"']+["'];?/g, '')
  return { html, bundle }
}
const MAIN = loadBuild(OUT)
const OFF = loadBuild(OUT_OFF)
const { html, bundle } = MAIN

/** Текст страницы без скрытых узлов — то, что видит гость. */
function visibleText(doc, root) {
  const c = root.cloneNode(true)
  c.querySelectorAll('[hidden]').forEach((n) => n.remove())
  return sp(c.textContent)
}

async function run(query, { build = MAIN, view = [1920, 1080], storage = {} } = {}) {
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
  const cards = [...d.querySelectorAll('#cards .card')].map((c) => ({
    main: c.classList.contains('main'),
    star: !!c.querySelector('.star'),
    who: sp(c.querySelector('.fs-who')?.textContent),
    sum: sp(c.querySelector('.fs-sum')?.textContent),
    lblSum: sp(c.querySelector('.l-sum')?.textContent),
    card: sp(c.querySelector('.fs-card')?.textContent),
    lblCard: sp(c.querySelector('.l-card')?.textContent),
    gift: sp(c.querySelector('.fs-gift')?.textContent),
  }))
  const steps = [...d.querySelectorAll('#ladder .step')].map((s) => ({
    sum: sp(s.querySelector('.fs-ssum')?.textContent),
    gift: sp(s.querySelector('.fs-sgift')?.textContent),
  }))
  const page = d.querySelector('.page')
  return {
    window, d, net, cards, steps,
    brand: sp($('brand-park').textContent),
    offer: sp($('offer').textContent),
    round: sp($('round').textContent),
    legend: [...d.querySelectorAll('#ladder .legend .lbl')].map((e) => sp(e.textContent)).join(' / '),
    ticketsShown: !$('row-tickets').hidden && !$('info').hidden,
    tickets: sp($('tickets').textContent),
    hallShown: !$('row-hall').hidden && !$('info').hidden,
    hall: sp($('hall').textContent),
    qrShown: !$('qr-tile').hidden,
    qrD: $('qr-path').getAttribute('d') || '',
    qrUrl: $('qr-svg').dataset.url || '',
    qrText: sp($('qr-tile').textContent),
    qrCap: sp($('qr-cap').textContent),
    text: visibleText(d, page),
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
ok('случаи подписаны: Один · Вдвоём · Компания 4–6',
   DATA.offers.map((o) => o.who).join(' · ') === 'Один · Вдвоём · Компания 4–6')
ok('парков ровно три, коды как у турбо', DATA.park_order.join() === 'ohta,piterland,iyun')
for (const [code, s] of Object.entries(SPEC_PARKS)) {
  const p = DATA.parks[code] || {}
  ok(`${code}: название как у турбо («${s.name}»)`, p.name === s.name, p.name)
  ok(`${code}: ступени с ${fmt(s.stepsFrom)}`, p.steps_from === s.stepsFrom, String(p.steps_from))
  ok(`${code}: строка про тикеты`, (p.tickets || '') === s.tickets, JSON.stringify(p.tickets))
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
  console.log(`  · ${code}`)
  ok(`${code}: бейдж «БУМБАСТИК // ${s.name}»`, r.brand === s.name, r.brand)
  ok(`${code}: оффер`, r.offer === OFFER, r.offer)
  ok(`${code}: три карточки`, r.cards.length === 3, String(r.cards.length))
  SPEC_OFFERS.forEach((o, i) => {
    const c = r.cards[i] || {}
    ok(`${code}: «${o.who}» — ${fmt(o.sum)} ₽ → на карте ${fmt(o.onCard)}, +${fmt(o.gift)} в подарок`,
       c.who === o.who && c.sum === `${fmt(o.sum)} ₽` && c.card === fmt(o.onCard) &&
       c.gift === `+${fmt(o.gift)} в подарок`, JSON.stringify(c))
    ok(`${code}: «${o.who}» — каждое число подписано`, c.lblSum === 'пополнение' && c.lblCard === 'на карте')
    ok(`${code}: «${o.who}» — ${o.main ? 'выделена со звездой' : 'не выделена'}`, c.main === o.main && c.star === o.main)
  })
  const want = SPEC_STEPS.filter((x) => x.sum >= s.stepsFrom)
  ok(`${code}: полоса ступеней с ${fmt(s.stepsFrom)} ₽`,
     JSON.stringify(r.steps) === JSON.stringify(want.map((x) => ({ sum: `${fmt(x.sum)} ₽`, gift: `+${fmt(x.gift)}` }))),
     r.steps.map((x) => `${x.sum}→${x.gift}`).join(' · '))
  ok(`${code}: ряды ступеней подписаны`, r.legend === 'пополнение / в подарок', r.legend)
  ok(`${code}: «Круглая сумма — больше подарок» с примером`,
     r.round === 'Круглая сумма — больше подарок1 400 ₽ дают +300, 1 500 ₽ — уже +525', r.round)
  if (code === 'ohta') {
    ok('ohta: ступени 500 на экране нет', !r.steps.some((x) => x.sum === '500 ₽'))
    ok('ohta: подарка +125 на экране нет', !/\+125\b/.test(r.text))
  }
  ok(`${code}: строка про тикеты ${s.tickets ? 'есть' : 'нет'}`,
     s.tickets ? r.ticketsShown && r.tickets === s.tickets : !r.ticketsShown && r.tickets === '', r.tickets)
  if (!s.tickets) ok(`${code}: слова «тикет» на экране нет вовсе`, !/тикет/i.test(r.text))
  if (s.tickets) ok(`${code}: про тикеты сказано «наличными»`, /наличными/.test(r.tickets))
  ok(`${code}: строка докидки ${s.hall ? 'есть' : 'нет'}`,
     s.hall ? r.hallShown && r.hall === HALL : !r.hallShown && !r.text.includes('докинем'))
  ok(`${code}: QR на экране`, r.qrShown && r.qrD === KASSA_QR[code].d && r.qrUrl === s.qr, r.qrUrl)
  ok(`${code}: подпись QR`, r.qrCap === QR_CAPTION, r.qrCap)
  ok(`${code}: рядом с QR о тикетах ни слова`, !/тикет|налич/i.test(r.qrText), r.qrText)
  for (const [re, what] of FORBIDDEN) ok(`${code}: нет: ${what}`, !re.test(r.text), (r.text.match(re) || [''])[0])
  ok(`${code}: ни одного запроса в сеть`, r.net.fetch + r.net.xhr + r.net.beacon === 0, JSON.stringify(r.net))
  ok(`${code}: режим ТВ включён`, r.body.split(' ').includes('tv'))
  ok(`${code}: «Парк не найден» не показан`, !r.parkErr)
}

console.log('\n── Онлайн выключен — QR пропадает (сборка с online:false) ──')
for (const [code, s] of Object.entries(SPEC_PARKS)) {
  const r = await run(`?park=${code}`, { build: OFF })
  ok(`${code}: плитки QR нет`, !r.qrShown && r.qrD === '' && r.qrUrl === '')
  ok(`${code}: раскладка без QR (no-online)`, r.body.includes('no-online'))
  ok(`${code}: слов про телефон и камеру на экране нет`, !/телефон|камеру/i.test(r.text), r.text.match(/телефон|камеру/i)?.[0])
  ok(`${code}: суммы и ступени остались`, r.cards.length === 3 && r.steps.length > 0)
  if (s.tickets) ok(`${code}: строка про тикеты осталась`, r.ticketsShown && r.tickets === s.tickets)
}

console.log('\n── Песочница и защита от правки адресом ──')
{
  const r = await run('?park=piterland&demo=1&online=0')
  ok('?demo=1&online=0 — QR скрыт для предпросмотра', !r.qrShown && r.body.includes('no-online'))
  ok('песочница видна только в demo', r.d.getElementById('demo').className.includes('on'))
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
  const r2 = await run('?park=piterland&online=0')
  ok('без demo адрес online=0 не действует', r2.qrShown && r2.qrUrl === SPEC_PARKS.piterland.qr)
  ok('без demo песочницы нет', !r2.d.getElementById('demo').className.includes('on'))
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
  ok('слот под переключатель экранов на месте и пуст', !!r.slot && r.slot.children.length === 0 && sp(r.slot.textContent) === '')
  ok('переключателя парков нет', !r.d.getElementById('parks'))
  // Бейдж — как у турбо и «Твоей карты»: время МСК, версия, дата сборки, ⟳
  ok('бейдж: время загрузки с поясом МСК', /^\d{2}\.\d{2} \d{2}:\d{2} МСК$/.test(r.stampWhen), r.stampWhen)
  ok('бейдж: «v1.0 · собрано ДД.ММ»', /^v\d+\.\d+ · собрано \d{2}\.\d{2}$/.test(sp(r.stampVer)), r.stampVer)
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
  ok('в содержании для гостя нет ссылок', !page.querySelector('a'))
  ok('в содержании для гостя нет кнопок и полей', !page.querySelector('button, input, select, textarea, form, [role=button]'))
  const fineLinks = [...r.d.querySelectorAll('.fineband a')].map((a) => a.getAttribute('href'))
  // Адрес — как у «Твоей карты» v6.3 (ultra.runscale.ru)
  ok('в подвале одна ссылка — «Работает на Ранскеил»', fineLinks.join() === 'https://ultra.runscale.ru', fineLinks.join())
  ok('в подвале одна кнопка — ⟳', [...r.d.querySelectorAll('.fineband button')].map((b) => b.id).join() === 'reload')
  ok('нет обработчиков в разметке', !/\son[a-z]+=/i.test(body))
  ok('в коде нет обработчиков касаний и клавиш', !/addEventListener\(\s*["'](pointerdown|touchstart|keydown)/.test(bundle))
  ok('в коде нет fetch / XHR / sendBeacon', !/\bfetch\(|XMLHttpRequest|sendBeacon/.test(bundle))
  ok('нет адресов Apps Script и Google-таблиц', !/script\.google|googleusercontent|docs\.google/.test(bundle + html))
  ok('нет переменных окружения (VITE_*)', !/VITE_[A-Z_]+/.test(bundle))
  ok('данные вкомпилированы в бандл', bundle.includes('Компания 4–6') && bundle.includes('kassa-tv'))
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
