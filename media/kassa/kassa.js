/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /media/kassa/ — ТВ-экран у кассы «Заряди карту онлайн»
 * ═══════════════════════════════════════════════════════════════════════════
 *  Отдельный Vite-вход, как /media/turbo/ и /media/loyalty/. Ни одного
 *  импорта из src/. Страница СТАТИЧНАЯ: данные — kassa.data.json рядом,
 *  Vite вкомпилирует его в бандл. Ни fetch, ни таблиц, ни Apps Script:
 *  загрузилась — дальше работает без сети.
 *
 *  Механика канвы, подгона кеглей, шапки, подвала и режима ТВ — из
 *  media/turbo/turbo.js и media/loyalty/loyalty.js (fitStage, fitCount,
 *  стамп, режим ТВ, суточный перезапуск). Экраны будут чередоваться на одной
 *  панели — поведение обязано совпадать. Своего механизма не изобретаем.
 *
 *  ⚠ У ГОСТЯ НА ЭКРАНЕ НИЧЕГО НЕ НАЖИМАЕТСЯ. Клики слушает только служебный
 *    бейдж в подвале (подсказка и ⟳ «обновить») — как у турбо и «Твоей
 *    карты». Движение мыши — чтобы прятать курсор в режиме ТВ.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import DATA from './kassa.data.json'
import { KASSA_QR } from './kassa-qr.js'

/* ── 0. Конфиг ───────────────────────────────────────────────────────────── */

/* Версия НОСИТЕЛЯ — в служебном бейдже внизу слева, как у турбо. Поднимать
   при любой правке вида, текстов, цифр или переключателей парков (в том
   числе правке kassa.data.json): по ней с трёх метров видно, что именно
   открыто на панели. */
const PAGE_VERSION = 'v1.1'

/* Метка сборки — та же, что у приложения (define __APP_BUILD__ в
   vite.config.js, «ГГГГ-ММ-ДД ЧЧ:ММ» по UTC). Вне сборки её нет. */
// eslint-disable-next-line no-undef
const BUILT = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''

const PARKS = DATA.parks
const T = DATA.text

/* ── 1. Параметры запуска — те же, что у турбо ───────────────────────────── */
const Q = new URLSearchParams(location.search)
const FIXED = (Q.get('park') || '').trim().toLowerCase() // панель прибита к парку
const TV = Q.get('tv') === '1'
const DEMO = Q.get('demo') === '1'

/* Тот же ключ, что у турбо и «Твоей карты»: выбранный на одном экране парк
   держится и на другом — для будущего переключения экранов внутри парка.
   Своего переключателя у этого экрана нет: без ?park= берём сохранённый
   соседями парк или первый по списку. */
const PARK_KEY = 'boom-turbo-park'
function storedPark() {
  try { return localStorage.getItem(PARK_KEY) || '' } catch { return '' }
}
const park = FIXED || (PARKS[storedPark()] ? storedPark() : DATA.park_order[0])

if (TV) document.body.classList.add('tv')
/* Метка песочницы на <body> — sandbox, НЕ demo: класс .demo у плашки
   песочницы (display:none), и совпадение прятало всю страницу. */
if (DEMO) document.body.classList.add('sandbox')

/* Указатель в режиме ТВ прячется по бездействию (как у турбо). */
if (TV) {
  let idleTimer = 0
  const goIdle = () => document.body.classList.add('idle')
  const wake = () => {
    document.body.classList.remove('idle')
    clearTimeout(idleTimer)
    idleTimer = setTimeout(goIdle, 5000)
  }
  window.addEventListener('mousemove', wake, { passive: true })
  window.addEventListener('mousedown', wake, { passive: true })
  idleTimer = setTimeout(goIdle, 5000)
}

/* ── 2. Числа ────────────────────────────────────────────────────────────── */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
/* 1500 → «1 500», неразрывным пробелом: число не рвётся по строкам. */
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
/* В готовых строках («1 000 ₽») пробел внутри числа и перед ₽ — тоже неразрывный. */
const nb = (s) => String(s).replace(/(\d) (?=\d{3}\b)/g, '$1\u00a0').replace(/ ₽/g, '\u00a0₽')

/** Подарок за сумму: ступень, в интервал которой сумма попала. */
function giftFor(sum) {
  let gift = 0
  for (const s of DATA.steps) if (sum >= s.sum) gift = s.gift
  return gift
}

/* ── 3. Отрисовка ────────────────────────────────────────────────────────── */

/** Тикеты за наличные на кассе для суммы — по ступеням парка (0 — акции нет). */
function cashTicketsFor(p, sum) {
  let t = 0
  for (const s of p.cash_tickets || []) if (sum >= s.from) t = s.tickets
  return t
}

/** «≈ +7 игр» — подарок / средняя цена игры (game_price), вниз до целого. */
function gamesFor(gift) {
  const price = Number(DATA.game_price) || 0
  return price > 0 ? Math.floor(gift / price) : 0
}
/* 1 игра · 2 игры · 7 игр · 21 игра · 42 игры */
function plural(n, one, few, many) {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return one
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few
  return many
}

const STAR = '<span class="star" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg></span>'
/* Ручка переключателя — молния: «заряди карту» */
const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>'

function renderOffer() {
  document.getElementById('offer').innerHTML =
    `<span class="oa">${esc(T.offer_a)}</span> <b class="ob">${esc(T.offer_b)}</b>`
}

/**
 * Три карточки: «X1 / X2 / X4–6» — сколько пришло играть.
 *
 * Каждое крупное число подписано: «пополнение» и «на карте». Между ними —
 * переключатель: по очереди (1 500 → 3 000 → 5 000) он щёлкает, и число «на
 * карте» вырастает из суммы пополнения до итога — видно, как пополнение
 * превращается в сумму на карте (см. cycleCards ниже).
 *
 * Под числом — ОДНА плашка с тремя гранями одного бонуса, они сменяют друг
 * друга: «+525 в подарок» → «≈ +7 игр в подарок» → «+200 тикетов за
 * наличные». Тикетов нет у парка (Июнь) — граней две.
 *
 * На карте = сумма + подарок, считается здесь, а не пишется в данные: так
 * числа на карточке не могут разойтись.
 */
function renderCards(p) {
  document.getElementById('cards').innerHTML = DATA.offers.map((o) => {
    const gift = giftFor(o.sum)
    const games = gamesFor(gift)
    const tickets = cashTicketsFor(p, o.sum)
    const faces = [
      { kind: 'gift', big: `+${fmt(gift)}`, small: T.face_gift },
    ]
    if (games > 0) faces.push({ kind: 'games', big: `≈\u00a0+${fmt(games)}\u00a0${plural(games, 'игра', 'игры', 'игр')}`, small: T.face_games })
    if (tickets > 0) faces.push({ kind: 'tickets', big: `+${fmt(tickets)}\u00a0${plural(tickets, 'тикет', 'тикета', 'тикетов')}`, small: T.face_tickets })
    const [x, n] = [String(o.label).slice(0, 1), String(o.label).slice(1)]
    return `
      <div class="card${o.main ? ' main' : ''}" data-id="${esc(o.id)}" data-sum="${o.sum}" data-total="${o.sum + gift}">
        ${o.main ? STAR : ''}
        <div class="xlabel"><div class="fit-box"><span class="fit fs-x"><i>${esc(x)}</i>${esc(n)}</span></div></div>
        <div class="sum"><div class="lbl l-sum">${esc(T.label_sum)}</div><div class="fit-box"><span class="fit fs-sum">${fmt(o.sum)}\u00a0₽</span></div></div>
        <div class="toggle" aria-hidden="true"><span class="fill"></span><span class="chev">›››</span><span class="knob">${BOLT}</span></div>
        <div class="oncard"><div class="lbl l-card">${esc(T.label_card)}</div><div class="fit-box"><span class="fit fs-card">${fmt(o.sum + gift)}</span></div></div>
        <div class="faces">${faces.map((f, i) => `
          <div class="face${i === 0 ? ' on' : ''}" data-kind="${f.kind}"><span class="fit fs-face"><b>${esc(f.big)}</b><small>${esc(f.small)}</small></span></div>`).join('')}
        </div>
      </div>`
  }).join('')
}

/** Полоса ступеней — убрана владельцем 01.10 (show_steps:false), код оставлен:
    true в данных — и она вернётся, с суммы steps_from парка. */
function renderSteps(p) {
  const tile = document.getElementById('steps')
  tile.hidden = !DATA.show_steps
  if (!DATA.show_steps) return
  document.getElementById('round').innerHTML = `${esc(T.round)}<i>${esc(nb(T.round_example))}</i>`
  const steps = DATA.steps.filter((s) => s.sum >= p.steps_from)
  const box = document.getElementById('ladder')
  box.style.setProperty('--n', String(steps.length))
  box.innerHTML = steps.map((s, i) => `
      <div class="step" data-sum="${s.sum}" style="--i:${i};--lv:${((i + 1) / steps.length).toFixed(2)}">
        <div class="fit-box"><span class="fit fs-ssum">${fmt(s.sum)}\u00a0₽</span></div>
        <div class="fit-box"><span class="fit fs-sgift">+${fmt(s.gift)}</span></div>
      </div>`).join('')
}

/** Строка «на кассе»: «Не хватило — докинем…» — по парку. Тикеты за
    наличные переехали в карточки (решение владельца 01.10). */
function renderInfo(p) {
  document.getElementById('hall').textContent = p.topup_in_hall ? T.topup_in_hall : ''
  document.getElementById('info').hidden = !p.topup_in_hall
}

/** QR — только при включённом онлайне. Выключен — плитки нет совсем. */
function renderQr(p) {
  const tile = document.getElementById('qr-tile')
  const path = document.getElementById('qr-path')
  const svg = document.getElementById('qr-svg')
  const q = p.online ? KASSA_QR[park] : null
  tile.hidden = !q
  document.body.classList.toggle('no-online', !q)
  if (!q) {
    path.setAttribute('d', '')
    delete svg.dataset.url
    return
  }
  svg.setAttribute('viewBox', q.viewBox)
  path.setAttribute('d', q.d)
  svg.dataset.url = q.url   // для проверки глазами в инспекторе
  /* «Докинуть на карту без очереди» — «без очереди» выделено лаймовой плашкой */
  document.getElementById('qr-lead').innerHTML = `${esc(T.qr_lead_a)} <mark>${esc(T.qr_lead_b)}</mark>`
  /* «Баланс, тикеты и статус — в твоём телефоне»: первая половина тёмным,
     вторая синим. Тире держится за словом справа — неразрывным пробелом,
     чтобы не повиснуть отдельной строкой. */
  /* Короткие слова («с», «без», «те») держатся за следующим — не висят в конце строки */
  const glue = (x) => x.replace(/(^|\s)([А-Яа-яЁё]{1,3}) /g, '$1$2\u00a0')
  const [a, b] = String(T.qr_caption).split(' — ').map(glue)
  document.getElementById('qr-cap').innerHTML = b ? `<b>${esc(a)}</b> —\u00a0${esc(b)}` : esc(a)
}

function render() {
  let p = PARKS[park]
  const err = document.getElementById('parkerr')
  err.classList.toggle('on', !p)
  if (!p) {
    document.getElementById('parkerr-asked').textContent = `?park=${FIXED}`
    return false
  }
  /* Песочница: посмотреть экран с другим состоянием онлайна, не правя данные */
  if (DEMO && (Q.get('online') === '0' || Q.get('online') === '1')) p = { ...p, online: Q.get('online') === '1' }

  document.getElementById('brand-park').textContent = p.name
  renderOffer()
  renderCards(p)
  renderSteps(p)
  renderInfo(p)
  renderQr(p)
  if (DEMO) {
    document.getElementById('demo').classList.add('on')
    document.getElementById('demo-info').textContent =
      `${park} · онлайн ${p.online ? 'вкл' : 'выкл'} · тикеты за наличные ${(p.cash_tickets || []).length ? 'да' : 'нет'} · докидка ${p.topup_in_hall ? 'да' : 'нет'} · ступени ${DATA.show_steps ? 'вкл' : 'выкл'}`
  }
  return true
}

/* ── 4. Служебный бейдж — как у турбо и «Твоей карты» ───────────────────────
   «● 01.10 08:15 МСК   v1.0 · собрано 01.10   ⟳»
   У турбо время в бейдже — свежесть расписания. Здесь данных из сети нет,
   поэтому время — момент загрузки страницы по Москве (видно, что панель жива
   и суточный перезапуск отработал), а «собрано» — дата СБОРКИ: доехала ли
   до панели последняя выкладка. ⟳ — перезагрузить страницу для персонала. */
function mskStamp(d) {
  try {
    const s = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `${s.replace(',', '')} МСК`
  } catch { return '' }
}
function builtDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ''))
  if (!m) return ''
  try {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
    return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' })
  } catch { return `${m[3]}.${m[2]}` }
}
const day = builtDay(BUILT)
document.getElementById('stamp-when').textContent = mskStamp(new Date())
document.getElementById('stamp-ver').textContent = day ? `${PAGE_VERSION} · собрано ${day}` : PAGE_VERSION

const hintEl = document.getElementById('hint')
function toggleHint() {
  hintEl.innerHTML = `<b>Зелёная точка</b> — страница загружена в это время (по Москве). Экран статичный, данных из таблиц не берёт. <b>${PAGE_VERSION}</b> — версия экрана${day ? `, собран ${day}` : ''}.`
  hintEl.classList.toggle('on')
}
document.getElementById('stamp').addEventListener('click', (e) => {
  if (e.target.closest('#reload')) return   // кнопка перезагрузки — не подсказка
  toggleHint()
})
document.getElementById('reload').addEventListener('click', () => {
  document.getElementById('reload').classList.add('spin')
  location.reload()
})

/* ── 5. Канва и подгон кеглей ────────────────────────────────────────────── */

/* Подгон замером — тот же приём, что fitCount в turbo.js/loyalty.js: узел
   inline-block (ширина по тексту), сравниваем его offsetWidth с шириной
   РОДИТЕЛЯ и сбавляем кегль шагом 2px. Статус шрифта — часть ключа кэша:
   Unbounded долетает позже и шире системного фолбэка. */
const fitCache = new WeakMap()
function fitCount(node, max, min, maxH) {
  const box = node.parentElement
  if (!box) return max
  const fontsState = document.fonts ? document.fonts.status : 'none'
  const key = `${box.clientWidth}|${maxH || 0}|${fontsState}|${node.textContent.length}|${max}`
  if (fitCache.get(node) === key) return parseFloat(node.style.fontSize) || max
  fitCache.set(node, key)
  let size = max
  node.style.fontSize = `${size}px`
  while ((node.offsetWidth > box.clientWidth || (maxH && node.offsetHeight > maxH)) && size > min) {
    size -= 2
    node.style.fontSize = `${size}px`
  }
  return size
}

/* Однородные ряды (три суммы, три «на карте», ступени) — единым кеглем по
   самому тесному: разный кегль у соседних карточек читался бы как разный вес. */
function fitUniform(sel, max, min, maxH) {
  const els = [...document.querySelectorAll(sel)]
  if (!els.length) return
  let size = 999
  els.forEach((e) => { size = Math.min(size, fitCount(e, max, min, maxH)) })
  els.forEach((e) => { e.style.fontSize = `${size}px` })
}

/* Сколько места по высоте у карточки: числа «на карте» не должны вытолкнуть
   подпись подарка за край, если панель ниже эталона по пропорциям. */
function cardRoom() {
  const c = document.querySelector('.card')
  if (!c) return 0
  const cs = getComputedStyle(c)
  const oc = c.querySelector('.oncard')
  const ocs = getComputedStyle(oc)
  const gap = parseFloat(cs.rowGap) || 0
  const label = oc.querySelector('.lbl').offsetHeight
  let used
  if (document.body.classList.contains('portrait')) {
    /* Вертикаль: «на карте» занимает правую колонку над плашкой подарка */
    used = c.querySelector('.faces').offsetHeight + gap + label
  } else {
    const kids = [...c.children].filter((e) => !e.classList.contains('star'))   // звезда — поверх, места не занимает
    used = gap * (kids.length - 1) + parseFloat(ocs.paddingTop) + parseFloat(ocs.borderTopWidth) + label
    kids.forEach((e) => { if (e !== oc) used += e.offsetHeight })
  }
  const inner = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  return Math.max(0, Math.floor(inner - used))
}

/* QR — самый крупный квадрат, что помещается в плитку рядом с подписями,
   с модулем в ЦЕЛОЕ число физических пикселей (как у «Твоей карты»): при
   дробном модуле crispEdges рисует соседние модули разной толщины. */
let stageScale = 0
function fitQr() {
  const tile = document.getElementById('qr-tile')
  if (tile.hidden) return
  const frame = document.getElementById('qr-frame')
  const cs = getComputedStyle(tile)
  const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  const portrait = document.body.classList.contains('portrait')
  let side
  if (portrait) {
    side = Math.min(tile.clientHeight - padV, tile.clientWidth * 0.46, 620)
  } else {
    const lead = document.getElementById('qr-lead').offsetHeight
    const cap = document.getElementById('qr-cap').offsetHeight
    side = Math.min(tile.clientHeight - padV - lead - cap - 2 * 14, tile.clientWidth - padH, 620)
  }
  side = Math.max(Math.floor(side), 160)
  const q = KASSA_QR[park]
  if (q && stageScale) {
    const n = Number(q.viewBox.split(' ')[2]) || 41
    const pad = 32   // 2 × padding .qr-frame
    const mod = Math.max(1, Math.floor(((side - pad) * stageScale) / n))
    side = Math.floor((mod * n) / stageScale + pad)
  }
  frame.style.setProperty('--qr', `${side}px`)
}

/* k = min(vw/1920, vh/1080) — как в турбо; в портрете эталон повёрнут. */
const stageEl = document.getElementById('stage')
const viewportEl = document.getElementById('viewport')

function fitStage() {
  if (!stageEl || !viewportEl) return
  const vw = viewportEl.clientWidth
  const vh = viewportEl.clientHeight
  if (!vw || !vh) return
  const portrait = vh > vw
  document.body.classList.toggle('portrait', portrait)
  const k = portrait ? Math.min(vw / 1080, vh / 1920) : Math.min(vw / 1920, vh / 1080)
  stageEl.style.width = `${Math.round(vw / k)}px`
  stageEl.style.height = `${Math.round(vh / k)}px`
  stageEl.style.transform = `scale(${k})`
  stageScale = k

  const offer = document.getElementById('offer')
  fitCount(offer, portrait ? 112 : 104, 40)
  fitUniform('.fs-x', 84, 30)
  fitUniform('.fs-sum', 50, 26)
  fitUniform('.fs-face', 48, 16)
  fitUniform('.fs-card', portrait ? 170 : 150, 48, cardRoom() || 0)
  if (DATA.show_steps) {
    fitCount(document.getElementById('round'), 34, 18)
    fitUniform('.fs-ssum', 30, 14)
    fitUniform('.fs-sgift', 40, 16)
  }
  fitUniform('.fs-info', 28, 16)
  fitQr()
}

/* ── 6. Движение: «пополнение превращается в сумму на карте» ──────────────
   Карточки по очереди (1 500 → 3 000 → 5 000, по CARD_MS каждая): у активной
   переключатель щёлкает слева направо, и число «на карте» вырастает из суммы
   пополнения до итога. У остальных итог стоит на месте — все три числа
   читаются в любой момент.
   Плашка под числом раз в FACE_MS меняет грань: подарок → игры → тикеты,
   у всех карточек одновременно — так грани легко сравнивать.
   Без движения (prefers-reduced-motion) — все переключатели включены,
   итог и первая грань стоят. */
const CARD_MS = 4000
const FACE_MS = 3000
const COUNT_MS = 1100
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

function countUp(card) {
  const node = card.querySelector('.fs-card')
  const from = Number(card.dataset.sum)
  const to = Number(card.dataset.total)
  const t0 = performance.now() + 450   // сначала щёлкает переключатель
  node.textContent = fmt(from)
  card.classList.remove('done')
  const step = (now) => {
    if (!card.classList.contains('on')) { node.textContent = fmt(to); return }
    const k = Math.min(1, Math.max(0, (now - t0) / COUNT_MS))
    const e = 1 - Math.pow(1 - k, 3)
    node.textContent = fmt(Math.round((from + (to - from) * e) / 5) * 5)
    if (k < 1) requestAnimationFrame(step)
    else { node.textContent = fmt(to); card.classList.add('done') }
  }
  requestAnimationFrame(step)
}

let active = -1
function cycleCards() {
  const cards = [...document.querySelectorAll('#cards .card')]
  if (!cards.length) return
  cards.forEach((c) => {
    c.classList.remove('on', 'done')
    c.querySelector('.fs-card').textContent = fmt(Number(c.dataset.total))
  })
  active = (active + 1) % cards.length
  cards[active].classList.add('on')
  countUp(cards[active])
}

let face = 0
function rotateFaces() {
  face += 1
  document.querySelectorAll('#cards .card').forEach((c) => {
    const fs = [...c.querySelectorAll('.face')]
    fs.forEach((f, i) => f.classList.toggle('on', i === face % fs.length))
  })
}

/* ── 7. Жизненный цикл ───────────────────────────────────────────────────── */
render()
fitStage()
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage)
setTimeout(fitStage, 1200)
window.addEventListener('resize', fitStage)

if (REDUCED) {
  document.querySelectorAll('#cards .card').forEach((c) => c.classList.add('on', 'done'))
} else if (PARKS[park]) {
  setTimeout(() => { cycleCards(); setInterval(cycleCards, CARD_MS) }, 700)
  setInterval(rotateFaces, FACE_MS)
}

/* Суточный самоперезапуск в 05:00 по Москве — как у турбо и «Твоей карты»:
   забрать новую сборку и не копить утечки. */
function mskHm(d) {
  try {
    return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
if (TV) {
  setInterval(() => {
    if (mskHm(new Date()) === '05:00') location.reload()
  }, 60000)
}
