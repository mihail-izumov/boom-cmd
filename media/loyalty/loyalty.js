/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /media/loyalty/ — ТВ-экран «Твоя карта» для постоянных гостей
 * ═══════════════════════════════════════════════════════════════════════════
 *  Отдельный Vite-вход, как /media/turbo/. Ни одного импорта из src/.
 *  Страница СТАТИЧНАЯ: без API. Всё, что меняется по парку, — в конфиге ниже.
 *  Анимация сцены «карта ↔ кабинет» — целиком в CSS (index.html), здесь
 *  только размер: fitScene.
 *
 *  Механика канвы, подгона кеглей, шапки и подвала — из media/turbo/turbo.js
 *  (fitStage, fitCount, renderParks, стамп, перезагрузка, режим ТВ). Экраны
 *  будут чередоваться на одной панели — поведение шапки и подвала обязано
 *  совпадать.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { LOYALTY_QR } from './loyalty-qr.js'

/* ── 0. Конфиг ───────────────────────────────────────────────────────────── */

/* Версия НОСИТЕЛЯ — в служебном бейдже внизу слева, как у турбо. Поднимать
   при любой правке вида или текстов. */
const PAGE_VERSION = 'v5.3'

/* Парки. Коды и названия — те же, что у турбо (park / park_ru источника),
   чтобы бейдж и переключатель при смене экрана не менялись ни на букву.

   host — адрес кабинета ЭТОГО парка в шапке телефона сцены (те же адреса,
     что у кнопки на b00m.fun/karta и в data/parks.js сайта).
   bonus — второй путь в плитке QR: «Новый гость? +500 зарядов — регайся и
     забирай» (нарратив наклейки «Бонус на старт», b00m.fun/bonus500).
   ⚠ Питерленд — false по решению владельца. Не «выравнивать» по соседям.
     Там в плитке QR остаётся один путь — «есть карта → кабинет». */
const PARKS = {
  ohta:      { name: 'Охта Молл', host: 'LK.B00M.FUN',  bonus: true },
  piterland: { name: 'Питерленд', host: 'PTL.B00M.FUN', bonus: false },
  iyun:      { name: 'ТЦ Июнь',   host: 'JUN.B00M.FUN', bonus: true },
}
const PARK_ORDER = ['ohta', 'piterland', 'iyun']

/* Статусы. Пороги, скидки, «≈ игр за 1 500 ₽» и цвета — ровно из
   BoomRewards.vue (b00m.fun/rewards). Владелец подтвердил 30.09: «цифры
   верны». Поменялись на кассе — править здесь И на /rewards.
   Порядок — лестница слева направо: от Стандарта к Платине.

   SHOW_LEVEL_NUMBERS = false — строки без ₽ и %: только имена и цвета.
   Выключатель на случай, если цифры снова окажутся под вопросом. */
const SHOW_LEVEL_NUMBERS = true
const LEVELS = [
  { id: 'standard', name: 'Стандарт', threshold: 0,     discount: 0,  games: 21, color: '#6B6B7C', icon: 'bow' },
  { id: 'silver',   name: 'Серебро',  threshold: 5000,  discount: 15, games: 25, color: '#00D4FF', icon: 'swords' },
  { id: 'gold',     name: 'Золото',   threshold: 10500, discount: 30, games: 30, color: '#FFD60A', icon: 'medal' },
  { id: 'platinum', name: 'Платина',  threshold: 45000, discount: 50, games: 42, color: '#FF0080', icon: 'crown' },
]

/* ── 1. Параметры запуска — те же, что у турбо ───────────────────────────── */
const Q = new URLSearchParams(location.search)
const FIXED = (Q.get('park') || '').trim().toLowerCase() // панель прибита к парку
const TV = Q.get('tv') === '1'
const DEMO = Q.get('demo') === '1'

/* Тот же ключ, что у турбо: выбранный на одном экране парк держится и на
   другом — нужно для будущего автопереключения экранов внутри парка. */
const PARK_KEY = 'boom-turbo-park'
function storedPark() {
  try { return localStorage.getItem(PARK_KEY) || '' } catch { return '' }
}
let park = FIXED || (PARKS[storedPark()] ? storedPark() : PARK_ORDER[0])
let showNumbers = SHOW_LEVEL_NUMBERS

if (TV) document.body.classList.add('tv')
if (DEMO) document.getElementById('demo').classList.add('on')

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

/* ── 2. Отрисовка ────────────────────────────────────────────────────────── */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')   // неразрывный: «10 500» не рвётся

const LEVEL_ICONS = {
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
  swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  bow: '<path d="M17 3h4v4"/><path d="M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17"/><path d="M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05"/><path d="M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z"/><path d="M9.707 14.293 21 3"/>',
}

/**
 * Лестница статусов. Под скидкой — сменная строка: порог ↔ «≈ игр за
 * 1 500 ₽» (CSS .alt, 16 с). Каждая цифра — с подписью, что это: цифра без
 * подписи — ровно та беда, что с макетом «1300 зарядов», прочитанным как цена.
 */
function renderLevels() {
  const box = document.getElementById('ladder')
  document.getElementById('lvl-max').hidden = !showNumbers
  document.getElementById('lvl-pct').textContent = `до −${Math.max(...LEVELS.map((l) => l.discount))}%`
  box.innerHTML = LEVELS.map((l) => {
    const games = `<b>≈${l.games}\u00a0игр</b> за 1\u00a0500\u00a0₽`
    const body = !showNumbers
      ? ''
      : `<div class="s-disc"><span class="fs-disc">${l.discount ? `−${l.discount}%` : '0%'}</span></div>
         <div class="s-lbl">${l.discount ? 'скидка' : 'базовый'}</div>
         <div class="alt">
           <span class="a1">${l.threshold ? `от <b>${fmt(l.threshold)}\u00a0₽</b> на игры` : 'с первой игры'}</span>
           <span class="a2">${games}</span>
         </div>`
    return `
      <div class="step" data-id="${l.id}" style="--c:${l.color}">
        <svg class="s-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LEVEL_ICONS[l.icon] || ''}</svg>
        <div class="s-name"><span class="fs-name">${esc(l.name)}</span></div>
        ${body}
      </div>`
  }).join('')
}

/* Подвал справа — правило статусов (FAQ b00m.fun/rewards), у всех парков
   одинаковое. «+500» переехал в плитку QR вторым путём. */
function renderTerms() {
  document.getElementById('terms').textContent =
    'Уровень растёт автоматически и не понижается · работает во всех парках'
}

/* Второй путь «+500 на старт» — только у парков с бонусом */
function renderPaths(p) {
  document.getElementById('path-new').hidden = !p.bonus
  document.body.classList.toggle('no-bonus', !p.bonus)
}

/** Переключатель парков — как у турбо: при ?park= скрыт. */
function renderParks() {
  const box = document.getElementById('parks')
  if (FIXED) { box.hidden = true; document.body.classList.remove('has-parks'); return }
  box.hidden = false
  document.body.classList.add('has-parks')
  box.innerHTML = PARK_ORDER
    .map((code) => `<button data-park="${code}"${code === park ? ' class="on"' : ''}>${esc(PARKS[code].name)}</button>`)
    .join('')
  box.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      park = b.dataset.park
      try { localStorage.setItem(PARK_KEY, park) } catch {}
      render()
    })
  })
}

function renderPark() {
  const p = PARKS[park]
  const err = document.getElementById('parkerr')
  err.classList.toggle('on', !p)
  if (!p) {
    document.getElementById('parkerr-asked').textContent = `?park=${FIXED}`
    return false
  }
  document.getElementById('brand-park').textContent = p.name
  document.getElementById('ph-host').textContent = p.host
  renderTerms()
  renderPaths(p)

  const q = LOYALTY_QR[park]
  const svg = document.getElementById('qr-svg')
  const path = document.getElementById('qr-path')
  if (q) {
    svg.setAttribute('viewBox', q.viewBox)
    path.setAttribute('d', q.d)
    svg.dataset.url = q.url   // для проверки глазами в инспекторе
  } else {
    path.setAttribute('d', '')
  }
  return true
}

function render() {
  renderParks()
  renderPark()
  renderLevels()
  fitStage()
}

/* ── 3. Служебный бейдж — как у турбо ──────────────────────────────────────
   У турбо время в бейдже — свежесть расписания. Здесь данных нет, поэтому
   это время загрузки страницы по Москве: по нему персонал видит, что
   панель жива и суточный перезапуск отработал. */
function mskStamp(d) {
  try {
    const s = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return `${s.replace(',', '')} МСК`
  } catch { return '' }
}
document.getElementById('stamp-when').textContent = mskStamp(new Date())
document.getElementById('stamp-ver').textContent = PAGE_VERSION

const hintEl = document.getElementById('hint')
function toggleHint() {
  hintEl.innerHTML = `<b>Зелёная точка</b> — страница загружена в это время (по Москве). Экран статичный, данных из таблиц не берёт. <b>${PAGE_VERSION}</b> — версия экрана.`
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

/* ── 4. Канва и подгон кеглей ────────────────────────────────────────────── */

/* Подгон замером — тот же приём, что fitCount в turbo.js: элемент
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

/* Ступени: имена и скидки — единым кеглем по самой узкой ступени. */
function fitUniform(sel, max, min) {
  const els = [...document.querySelectorAll(sel)]
  let size = 999
  els.forEach((e) => { size = Math.min(size, fitCount(e, max, min)) })
  els.forEach((e) => { e.style.fontSize = `${size}px` })
}

/* Сцена — «доска» 60em × 64em (раскладка — в CSS у .board). Подбираем em
   так, чтобы доска заняла всю плитку: это и есть кегль всей сцены. */
function fitScene() {
  const wrap = document.getElementById('board-wrap')
  const board = document.getElementById('board')
  const em = Math.floor(Math.min(wrap.clientWidth / 60, wrap.clientHeight / 64) * 10) / 10
  board.style.fontSize = `${Math.max(em, 6)}px`
}

/* QR — самый крупный квадрат, что помещается в плитку рядом с подписями,
   с модулем в ЦЕЛОЕ число физических пикселей: при дробном модуле
   crispEdges рисует соседние модули разной толщины, и код хуже читается. */
let stageScale = 0
function fitQr() {
  const tile = document.getElementById('qr-tile')
  const frame = document.getElementById('qr-frame')
  const cs = getComputedStyle(tile)
  const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  /* Плитка горизонтальная: квадрат во всю высоту, но не больше 42% ширины —
     справа должны встать оба пути (карта / +500). */
  let side = Math.floor(Math.min(tile.clientHeight - padV, tile.clientWidth * 0.42, 560))
  side = Math.max(side, 160)
  const q = LOYALTY_QR[park]
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
  fitScene()
  fitCount(document.getElementById('lvl-pct'), 60, 24)
  fitUniform('.fs-name', 24, 12)
  fitUniform('.fs-disc', 72, 28)
  fitQr()
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage)
setTimeout(fitStage, 1200)
window.addEventListener('resize', fitStage)

/* ── 5. Жизненный цикл ───────────────────────────────────────────────────── */
render()

/* Суточный самоперезапуск в 05:00 по Москве — как у турбо: забрать новую
   сборку и не копить утечки. */
if (TV) {
  setInterval(() => {
    if (/ 05:00 /.test(mskStamp(new Date()))) location.reload()
  }, 60000)
}

/* ── 6. Песочница (?demo=1) — в бой не идёт ─────────────────────────────── */
function markDemo() {
  document.querySelectorAll('.demo [data-nums]').forEach((b) => b.classList.toggle('on', (b.dataset.nums === '1') === showNumbers))
}
document.querySelectorAll('.demo [data-nums]').forEach((b) => {
  b.addEventListener('click', () => {
    showNumbers = b.dataset.nums === '1'
    renderLevels()
    fitStage()
    markDemo()
  })
})
if (DEMO) markDemo()
