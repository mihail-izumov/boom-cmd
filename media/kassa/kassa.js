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
import { initScreens, isEmbedded, pauseAnimations, resumeAnimations, restartAnimations } from '../shared/screens.js'

/* ── 0. Конфиг ───────────────────────────────────────────────────────────── */

/* Версия НОСИТЕЛЯ — в служебном бейдже внизу слева, как у турбо. Поднимать
   при любой правке вида, текстов, цифр или переключателей парков (в том
   числе правке kassa.data.json): по ней с трёх метров видно, что именно
   открыто на панели. */
const PAGE_VERSION = 'v2.2'

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
   Без ?park= берём сохранённый соседями парк или первый по списку.
   Выбор парка — список на плашке «БУМБАСТИК // парк» (media/shared/screens.js). */
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

/** Тикеты за наличные на кассе — за ТОЧНУЮ сумму пополнения (0 — нет).
    200 тикетов — только за 1 000 ₽, поэтому у карточек 1 500 и 3 000 их нет
    (решение владельца 01.10). */
function cashTicketsFor(p, sum) {
  const hit = (p.cash_tickets || []).find((t) => t.sum === sum)
  return hit ? hit.tickets : 0
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
/* Молния после числа «на карте»: пополнение — в рублях, на карте — заряды.
   Форма — молния владельца (01.10), из его SVG с вложенными сдвигами
   пересчитана в один путь в своих координатах. Обёртка .zap — для
   «разряда», когда «на карте» налито до краёв (index.html): вспышка (::before)
   и восемь искр (.spark) вокруг молнии. */
const BOLT = '<span class="zap" aria-hidden="true">'
  + '<svg class="bolt" viewBox="0 0 784.1 926.5"><path d="M491.3,387.2 L735.7,0 L0,578.8 L376.5,558.1 L202,926.5 L784.1,366.6Z"/></svg>'
  + '<i class="spark"></i>'.repeat(8)
  + '</span>'

function renderOffer() {
  document.getElementById('offer').innerHTML =
    `<span class="oa">${esc(T.offer_a)}</span> <b class="ob">${esc(T.offer_b)}</b>`
}

/**
 * Три карточки: «X1 / X2 / X4–6» — сколько пришло играть. У каждой свой
 * цвет «жидкости» (offers[].tone: lime / cyan / pink, цвета — .tone-… в
 * index.html).
 *
 * Внутри — два СОСУДА, как в играх «перелей воду»: сверху «пополнение
 * 1 500 ₽», снизу «на карте 2 025 ⚡». Верхний наливается, чуть
 * наклоняется и переливается в нижний — между окнами ничего нет, перелив
 * видно по уровням (воронку и струю убрали — решение владельца 01.10).
 * Деньги гостя встают в нижнем, сверху доливается бонус (жидкость плавно
 * светлеет кверху), и число «на карте» досчитывается от суммы до итога
 * (cycleCards ниже). Пополнение — в рублях, на карте —
 * заряды, поэтому после числа молния.
 *
 * Текст в сосуде записан дважды: светлый — сам сосуд, тёмный — в «жидкости»
 * (.liq, aria-hidden). Жидкость обрезана по уровню (clip-path), поэтому буквы
 * темнеют ровно там, где их накрыло. Уровень денег — --split, доля суммы в
 * итоге (1 500 из 2 025 → 74 %). Волн, бликов и линий раздела нет — ни одна
 * линия не ложится на текст (решение владельца 01.10).
 *
 * Под сосудами — плашка во всю ширину карточки, грани одного бонуса:
 * «+525 бонус» → «≈ +7 игр бонус» → «+500 тикетов за наличные» (тикеты —
 * только там, где сумма карточки есть в cash_tickets). Слово — чёрным
 * бейджем сверху, цифра под ним — крупно, на всю плашку. Плашка тоже «наливается»: копия текста в
 * заливке (.fliq) встаёт снизу, когда «на карте» налито наполовину (класс
 * half ниже), и показывает все грани по очереди — значение «прокручивается»
 * вверх, как барабан (showFace). Гаснет — заливка стекает, значение остаётся.
 *
 * На карте = сумма + подарок, считается здесь, а не пишется в данные: так
 * числа на карточке не могут разойтись.
 */
const TONES = ['lime', 'cyan', 'pink']

function renderCards(p) {
  document.getElementById('cards').innerHTML = DATA.offers.map((o, i) => {
    const gift = giftFor(o.sum)
    const games = gamesFor(gift)
    const tickets = cashTicketsFor(p, o.sum)
    const faces = [
      { kind: 'gift', big: `+${fmt(gift)}`, small: T.face_gift },
    ]
    if (games > 0) faces.push({ kind: 'games', big: `≈\u00a0+${fmt(games)}`, small: T.face_games })
    if (tickets > 0) faces.push({ kind: 'tickets', big: `+${fmt(tickets)}`, small: T.face_tickets })
    const [x, n] = [String(o.label).slice(0, 1), String(o.label).slice(1)]
    const tone = TONES.includes(o.tone) ? o.tone : TONES[i % TONES.length]
    const split = Math.round((o.sum / (o.sum + gift)) * 1000) / 10
    const inA = `<div class="lbl l-sum">${esc(T.label_sum)}</div><div class="fit-box"><span class="fit fs-sum">${fmt(o.sum)}\u00a0₽</span></div>`
    const inB = `<div class="lbl l-card">${esc(T.label_card)}</div><div class="fit-box"><span class="fit fs-card"><span class="num">${fmt(o.sum + gift)}</span>${BOLT}</span></div>`
    return `
      <div class="card tone-${tone}${o.main ? ' main' : ''}" data-id="${esc(o.id)}" data-sum="${o.sum}" data-total="${o.sum + gift}" style="--split:${split}%">
        ${o.main ? STAR : ''}
        <div class="xlabel"><div class="fit-box"><span class="fit fs-x"><i>${esc(x)}</i>${esc(n)}</span></div></div>
        <div class="slider">
          <div class="seg seg-a">${inA}<div class="liq" aria-hidden="true">${inA}</div></div>
          <div class="seg seg-b">${inB}<div class="liq" aria-hidden="true">${inB}</div></div>
        </div>
        <div class="faces">${faces.map((f, i) => {
          /* Бейдж («бонус», «бонус в играх», «тикеты за наличные») — сверху,
             цифра под ним — крупно, на всю плашку (решение владельца 01.10) */
          const inF = `<div class="fbadge"><small>${esc(f.small)}</small></div><div class="fit-box"><span class="fit fs-face"><b>${esc(f.big)}</b></span></div>`
          return `
          <div class="face${i === 0 ? ' on' : ''}" data-kind="${f.kind}">${inF}<div class="fliq" aria-hidden="true">${inF}</div></div>`
        }).join('')}
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
  /* «Докинуть на карту без очереди» — «без очереди» выделено лаймовой
     плашкой. Текст — во внутреннем <span>: сама строка растягивается на
     свободное поле над кодом, а текст стоит по центру этого поля. */
  document.getElementById('qr-lead').innerHTML = `<span>${esc(T.qr_lead_a)} <mark>${esc(T.qr_lead_b)}</mark></span>`
  /* «Баланс, тикеты и статус — в твоём телефоне» — целиком синим, по центру
     поля под кодом. Короткие слова («и», «в») и тире держатся за соседним
     словом — не висят в конце строки. */
  const glue = (x) => x.replace(/(^|\s)([А-Яа-яЁё]{1,3}) /g, '$1$2\u00a0').replace(/ — /g, ' —\u00a0')
  document.getElementById('qr-cap').innerHTML = `<span>${esc(glue(String(T.qr_caption)))}</span>`
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

/* Сколько места по высоте у цифры плашки: высота плашки (её задаёт сетка
   карточки, не текст — flex-basis 0) минус поля и бейдж. */
function faceRoom() {
  const f = document.querySelector('#cards .face')
  if (!f) return 0
  const cs = getComputedStyle(f)
  const badge = f.querySelector('.fbadge')
  const gap = parseFloat(cs.rowGap) || 0
  return Math.max(0, Math.floor(f.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (badge ? badge.offsetHeight : 0) - gap))
}

/* Сколько места по высоте у числа «на карте»: нижнее окно слайдера растёт
   на всё свободное место карточки (flex:1 1 0), из него вычитаем поля окна
   и подпись. Так число не вытолкнет плашку бонуса за край. */
function cardRoom() {
  const seg = document.querySelector('.card .seg-b')
  if (!seg) return 0
  const cs = getComputedStyle(seg)
  const label = seg.querySelector('.lbl').offsetHeight
  const gap = parseFloat(cs.rowGap) || 0
  return Math.max(0, Math.floor(seg.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - label - gap))
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
    /* Строки над и под кодом растягиваются на свободное поле — меряем
       сам текст (внутренний <span>) и оставляем ему воздух */
    const inner = (id) => (document.getElementById(id).firstElementChild || {}).offsetHeight || 0
    side = Math.min(tile.clientHeight - padV - inner('qr-lead') - inner('qr-cap') - 2 * 52, tile.clientWidth - padH, 620)
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
  fitUniform('.fs-sum', 60, 26)
  /* Цифра плашки — крупно, на всё место под бейджем; грани одного вида —
     единым кеглем по трём карточкам. В вертикали плашка по содержимому —
     кегль ограничен сверху, а не высотой. */
  const room = portrait ? 0 : faceRoom()
  ;['gift', 'games', 'tickets'].forEach((k) => fitUniform(`.face[data-kind="${k}"] .fs-face`, portrait ? 84 : 150, 24, room))
  fitUniform('.fs-card', portrait ? 150 : 150, 44, cardRoom() || 0)
  if (DATA.show_steps) {
    fitCount(document.getElementById('round'), 34, 18)
    fitUniform('.fs-ssum', 30, 14)
    fitUniform('.fs-sgift', 40, 16)
  }
  fitUniform('.fs-info', 28, 16)
  fitQr()
}

/* ── 6. Движение: «перелей воду» — 1 500 превращаются в 2 025 ─────────────
   Карточки по очереди (1 500 → 3 000 → 5 000), ход длится, пока плашка
   не покажет все грани (cardMs). У активной
   три фазы — классы на карточке:
     p1 — верхний сосуд «пополнение» наливается; нижний в тени, в нём пока
          та же сумма;
     p2 — верхний чуть наклоняется и переливается в нижний: уровень сверху
          падает, снизу растёт слой денег гостя до --split;
     p3 — сверху доливается бонус, число досчитывается до итога, в тень
          уходит пустой верхний сосуд; досчитало — done (вспышка числа).
   У остальных карточек сосуды спокойные: нижний ровно чуть подкрашен, итог
   на месте — все три числа читаются в любой момент.
     done — досчитало: «на карте» красуется — поворот гранями, свет (CSS).
   half — «на карте» налито наполовину: плашка бонуса «наливается» и
          показывает ВСЕ свои грани по очереди, по FACE_STEP_MS каждая,
          начиная с той, что на ней стоит: бонус → игры → тикеты → бонус…
          Смена — «барабаном» (showFace). Только когда последняя отстояла
          своё — ход переходит к следующей карточке (длина хода — cardMs).
          Карточка гаснет — заливка плашки стекает, значение остаётся: у
          спокойных карточек плашка не меняется (решения владельца 01.10). Момент half
          считается по той же кривой, что у перехода жидкости в index.html
          (halfAt).
   Без движения (prefers-reduced-motion) — спокойные сосуды, итог и первая
   грань стоят. */
const FACE_STEP_MS = 1700  // сколько стоит каждая грань плашки
const BRAG_MS = 1600       // «красуется» (animation brag в index.html)
const FILL_MS = 1000    // верхний наливается и стоит полный, потом переливается
const POUR_MS = 900     // переливание в нижний (как transition у .liq в index.html)
const BONUS_MS = 1000   // долив бонуса (transition-duration у .card.p3 .seg-b .liq)
const COUNT_MS = 1100
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

/* Число «на карте» — в двух местах: в сосуде и в «жидкости» над ним */
function setNum(card, v) {
  card.querySelectorAll('.fs-card .num').forEach((n) => { n.textContent = fmt(v) })
}

/* Доля пути по времени, за которую cubic-bezier(.45,0,.3,1) — кривая
   перехода жидкости в index.html — проходит долю p уровня. */
function easeTimeFor(p) {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const bz = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  for (let t = 0; t <= 1; t += 0.002) if (bz(0, 1, t) >= p) return bz(0.45, 0.3, t)
  return 1
}

/* Когда «на карте» дойдёт до половины: деньги гостя наливаются до --split
   (доли суммы в итоге); если их меньше половины — половину добирает бонус. */
function halfAt(card) {
  const s = Number(card.dataset.sum) / Number(card.dataset.total)
  return s >= 0.5
    ? FILL_MS + POUR_MS * easeTimeFor(0.5 / s)
    : FILL_MS + POUR_MS + BONUS_MS * easeTimeFor((0.5 - s) / (1 - s))
}

/* Часы карточек с паузой. Плеер экранов (media/shared/screens.js) ставит
   экран на паузу и продолжает С ТОГО ЖЕ МЕСТА — поэтому все ходы карточек
   идут через later(), а не голый setTimeout: на паузе таймеры снимаются и
   запоминают остаток, на продолжении — доигрывают его. clockNow() на паузе
   стоит, поэтому и счёт «на карте» замирает на своём числе. */
let pausedAt = 0
let pausedTotal = 0
let seq = 0
const pending = new Map()
const clockNow = () => (pausedAt || performance.now()) - pausedTotal
function later(fn, ms) {
  const id = ++seq
  const t = { due: clockNow() + ms, h: 0, run: () => { pending.delete(id); fn() } }
  if (!pausedAt) t.h = setTimeout(t.run, ms)
  pending.set(id, t)
  return id
}
function cancel(id) {
  const t = pending.get(id)
  if (t) { clearTimeout(t.h); pending.delete(id) }
}
function clockPause() {
  if (pausedAt) return
  pausedAt = performance.now()
  pending.forEach((t) => clearTimeout(t.h))
}
function clockResume() {
  if (!pausedAt) return
  pausedTotal += performance.now() - pausedAt
  pausedAt = 0
  pending.forEach((t) => { t.h = setTimeout(t.run, Math.max(0, t.due - clockNow())) })
}

let timers = []
function countUp(card) {
  const from = Number(card.dataset.sum)
  const to = Number(card.dataset.total)
  setNum(card, from)                    // пока наливается «пополнение» — внизу та же сумма, в тени
  card.classList.remove('done', 'p2', 'p3', 'half')
  card.classList.add('on', 'p1')
  timers.push(later(() => {
    card.classList.replace('p1', 'p2')  // наклон: деньги перетекают вниз
  }, FILL_MS))
  /* Налито наполовину — плашка «наливается» тем значением, что на ней
     стоит, и прокручивает все остальные по кругу */
  const half = halfAt(card)
  timers.push(later(() => card.classList.add('half'), half))
  const fs = [...card.querySelectorAll('.face')]
  const start = Math.max(0, fs.findIndex((f) => f.classList.contains('on')))
  for (let k = 1; k < fs.length; k++) {
    timers.push(later(() => showFace(card, (start + k) % fs.length), half + k * FACE_STEP_MS))
  }
  timers.push(later(() => {
    card.classList.replace('p2', 'p3')  // доливается бонус, число растёт
    const t0 = clockNow() + 100
    const step = () => {
      if (!card.classList.contains('on')) { setNum(card, to); return }
      const k = Math.min(1, Math.max(0, (clockNow() - t0) / COUNT_MS))
      const e = 1 - Math.pow(1 - k, 3)
      setNum(card, Math.round((from + (to - from) * e) / 5) * 5)
      if (k < 1) requestAnimationFrame(step)
      else { setNum(card, to); card.classList.add('done') }
    }
    requestAnimationFrame(step)
  }, FILL_MS + POUR_MS))
}

/* Ход за ходом: следующая карточка — только когда предыдущая показала
   все грани плашки (cardMs). */
let active = -1
let cycleTimer = 0   // следующий ход — его снимает пауза плеера экранов
function cycleCards() {
  const cards = [...document.querySelectorAll('#cards .card')]
  if (!cards.length) return
  timers.forEach(cancel)
  timers = []
  /* Гаснущая карточка: заливка плашки стекает (снят half), значение на
     плашке остаётся — без карточки плашка не меняется (владелец 01.10) */
  cards.forEach((c) => {
    c.classList.remove('on', 'p1', 'p2', 'p3', 'half', 'done')
    c.querySelectorAll('.face').forEach((f) => f.classList.remove('roll-in', 'roll-out'))
    setNum(c, Number(c.dataset.total))
  })
  active = (active + 1) % cards.length
  countUp(cards[active])
  cycleTimer = later(cycleCards, cardMs(cards[active]))
}

/* Показать грань k залитой плашки — «барабан»: старое значение уезжает
   вверх (.roll-out), новое въезжает снизу (.roll-in). Обе грани залиты
   одним цветом, плашка обрезана по скруглению (index.html) — шва нет,
   видно, как прокручивается текст. */
const ROLL_MS = 520   // animation roll-in / roll-out .45s в index.html
function showFace(card, k) {
  const fs = [...card.querySelectorAll('.face')]
  const cur = fs.findIndex((f) => f.classList.contains('on'))
  if (k === cur || !fs[k]) return
  fs.forEach((f, i) => {
    f.classList.toggle('on', i === k)
    f.classList.toggle('roll-in', i === k)
    f.classList.toggle('roll-out', i === cur)
  })
  timers.push(later(() => fs.forEach((f) => f.classList.remove('roll-in', 'roll-out')), ROLL_MS))
}

/* Длина хода карточки: пока плашка не покажет все грани и пока «на карте»
   не докрасуется. */
function cardMs(card) {
  const n = card.querySelectorAll('.face').length
  return Math.round(Math.max(halfAt(card) + n * FACE_STEP_MS, FILL_MS + POUR_MS + 100 + COUNT_MS + BRAG_MS + 300))
}

/* ── 7. Жизненный цикл ───────────────────────────────────────────────────── */
render()
fitStage()
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage)
setTimeout(fitStage, 1200)
window.addEventListener('resize', fitStage)

if (REDUCED) {
  document.querySelectorAll('#cards .card').forEach((c) => c.classList.add('done'))
} else if (PARKS[park]) {
  cycleTimer = later(cycleCards, 700)
}

/* ── Плеер экранов (loyalty ⇄ kassa) и выбор парка — media/shared/screens.js.
   Полный круг экрана = все карточки по очереди (cardMs каждой) + стартовая
   пауза 700 мс. Пауза — часы и CSS-анимации замирают, продолжение — с того
   же места; показ экрана — круг с первой карточки. */
function stopCards() {
  cancel(cycleTimer)
  timers.forEach(cancel)
  timers = []
}
if (PARKS[park]) {
  initScreens({
    id: 'kassa',
    park,
    parks: PARKS,
    parkOrder: DATA.park_order,
    cycleMs: () => 700 + [...document.querySelectorAll('#cards .card')].reduce((t, c) => t + cardMs(c), 0),
    restart: () => {
      stopCards()
      clockResume()
      active = -1
      restartAnimations()
      if (!REDUCED) cycleTimer = later(cycleCards, 700)
    },
    pause: () => {
      clockPause()
      pauseAnimations()
    },
    resume: () => {
      clockResume()
      resumeAnimations()
    },
  })
}

/* Суточный самоперезапуск в 05:00 по Москве — как у турбо и «Твоей карты»:
   забрать новую сборку и не копить утечки. */
function mskHm(d) {
  try {
    return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
if (TV && !isEmbedded()) {   // встроенную в плеер перезапускает хозяин
  setInterval(() => {
    if (mskHm(new Date()) === '05:00') location.reload()
  }, 60000)
}
