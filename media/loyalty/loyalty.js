/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /media/loyalty/ — ТВ-экран «Твоя карта» для постоянных гостей
 * ═══════════════════════════════════════════════════════════════════════════
 *  Отдельный Vite-вход, как /media/turbo/. Ни одного импорта из src/.
 *  Страница СТАТИЧНАЯ: без API, без расписания, без кэша. Всё, что меняется
 *  по парку, — в конфиге ниже.
 *
 *  Механика канвы и подгона кеглей — из media/turbo/turbo.js (fitStage,
 *  fitCount). Не изобретать свою: эта уже пережила разбор «с расстояния не
 *  читается» и «поля обрезаются».
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { LOYALTY_QR } from './loyalty-qr.js'

/* ── 0. Конфиг ───────────────────────────────────────────────────────────── */

/* Версия НОСИТЕЛЯ — видна в служебном бейдже внизу справа. Поднимать при
   любой правке вида или текстов: по ней с трёх метров понятно, что открыто
   на панели в парке. */
const PAGE_VERSION = 'v1.0'

/* Парки. Коды — те же, что у турбо-страницы (?park=ohta|piterland|iyun).
   accent — цвет парка, тот же, что у страниц bonus500 на b00m.fun.

   bonus — строка «+500 бонусов за первую регистрацию в кабинете».
   ⚠ Питерлэнд — false по решению владельца. Не «выравнивать» по соседям. */
const PARKS = {
  ohta:      { name: 'Охта Молл', accent: '#FF0080', bonus: true },
  piterland: { name: 'Питерлэнд', accent: '#00FF88', bonus: false },
  iyun:      { name: 'Июнь',      accent: '#00D4FF', bonus: true },
}

/* Лестница статусов. Цвета и иконки — ровно из BoomRewards.vue
   (b00m.fun/rewards), по возрастанию.

   ⚠ SHOW_LEVELS = false — И НЕ ВКЛЮЧАТЬ, пока пороги и скидки не сверены
     с кассовой системой. Цифры ниже взяты с b00m.fun/rewards и на кассе
     могут быть другими; экран в зале, обещающий гостю не ту скидку, хуже
     экрана без лестницы. Посмотреть, как блок выглядит, — ?demo=1, кнопка
     «Предпросмотр» (рисуется с плашкой «черновик»). */
const SHOW_LEVELS = false
const LEVELS = [
  { id: 'standard', name: 'Стандарт', threshold: 0,     discount: 0,  color: '#6B6B7C', icon: 'bow' },
  { id: 'silver',   name: 'Серебро',  threshold: 5000,  discount: 15, color: '#00D4FF', icon: 'swords' },
  { id: 'gold',     name: 'Золото',   threshold: 10500, discount: 30, color: '#FFD60A', icon: 'medal' },
  { id: 'platinum', name: 'Платина',  threshold: 45000, discount: 50, color: '#FF0080', icon: 'crown' },
]

/* ── 1. Параметры запуска — те же, что у турбо ───────────────────────────── */
const Q = new URLSearchParams(location.search)
const ASKED = (Q.get('park') || '').trim().toLowerCase()
const TV = Q.get('tv') === '1'
const DEMO = Q.get('demo') === '1'

let park = PARKS[ASKED] ? ASKED : (DEMO ? 'ohta' : '')
let previewLevels = false

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
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const LEVEL_ICONS = {
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
  swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  bow: '<path d="M17 3h4v4"/><path d="M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17"/><path d="M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05"/><path d="M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z"/><path d="M9.707 14.293 21 3"/>',
}

/**
 * Лестница. При SHOW_LEVELS = false блок НЕ рендерится вовсе (hidden и
 * пустой), а сетка страницы о нём не знает — класс has-levels не ставится.
 * Каждая цифра — с подписью, что это: «от 5 000 ₽ покупок», «−15% скидка».
 */
function renderLevels() {
  const box = document.getElementById('levels')
  const on = SHOW_LEVELS || previewLevels
  document.body.classList.toggle('has-levels', on)
  box.hidden = !on
  if (!on) { box.innerHTML = ''; return }
  box.innerHTML =
    (SHOW_LEVELS ? '' : '<span class="draft">ЧЕРНОВИК · ПОРОГИ НЕ СВЕРЕНЫ</span>') +
    '<div class="levels-title"><h2>Лестница статусов</h2><p>Твоя ступень — в кабинете</p></div>' +
    '<div class="ladder">' +
    LEVELS.map((l) => `
      <div class="step" data-id="${l.id}" style="--c:${l.color}">
        <svg class="s-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LEVEL_ICONS[l.icon] || ''}</svg>
        <div class="s-name">${esc(l.name)}</div>
        <div class="s-meta">${l.threshold ? `от <b>${fmt(l.threshold)} ₽</b> покупок` : 'с первой игры'}</div>
        <div class="s-meta">${l.discount ? `скидка <b>−${l.discount}%</b>` : 'без скидки'}</div>
      </div>`).join('') +
    '</div>'
}

function renderPark() {
  const p = PARKS[park]
  const err = document.getElementById('parkerr')
  err.classList.toggle('on', !p)
  if (!p) {
    document.getElementById('parkerr-asked').textContent = ASKED ? `?park=${ASKED}` : 'пустой ?park='
    return
  }
  document.documentElement.style.setProperty('--pk', p.accent)
  document.getElementById('brand-park').textContent = p.name.toUpperCase()
  document.getElementById('bonus').hidden = !p.bonus

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
}

document.getElementById('ver').textContent = PAGE_VERSION

/* ── 3. Канва и подгон кеглей ────────────────────────────────────────────── */

/* Подгон замером — тот же приём, что fitCount в turbo.js: элемент
   inline-block (ширина по тексту), сравниваем его offsetWidth с шириной
   РОДИТЕЛЯ и сбавляем кегль шагом 2px. Статус шрифта — часть ключа кэша:
   Unbounded долетает позже и шире системного фолбэка. */
const fitCache = new WeakMap()
function fitCount(node, max, min, maxH) {
  const box = node.parentElement
  if (!box) return max
  const fontsState = document.fonts ? document.fonts.status : 'none'
  const key = `${box.clientWidth}|${maxH || 0}|${fontsState}|${node.textContent.length}`
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

/* Три крупных слова плиток — ОДНИМ кеглем: самое длинное задаёт размер
   всем. Иначе «Заряды» и «Статус» разного размера читаются как разная
   важность. */
function fitWords() {
  const words = [...document.querySelectorAll('.fit-word')]
  let size = 999
  words.forEach((w) => { size = Math.min(size, fitCount(w, 72, 30)) })
  words.forEach((w) => { w.style.fontSize = `${size}px` })
}

/* Заголовок оффера: влезть по ширине И по высоте свободного места. */
function fitTitle() {
  const t = document.getElementById('offer-title')
  const copy = t.closest('.offer-copy')
  const sub = copy.querySelector('.offer-sub')
  const room = copy.clientHeight - sub.offsetHeight - parseFloat(getComputedStyle(sub).marginTop)
  fitCount(t, 150, 40, Math.max(room, 60))
}

/* QR — самый крупный квадрат, который помещается в плитку рядом с
   подписями. Квадрат считаем сами: CSS-«aspect-ratio + max-height» на
   панелях разной геометрии ломал квадрат в прямоугольник (см. .sub .qr
   в турбо). Потолок 640 — дальше код не читается лучше, а подписи
   теряют место. */
function fitQr() {
  const tile = document.getElementById('qr-tile')
  const frame = document.getElementById('qr-frame')
  const cs = getComputedStyle(tile)
  const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  const gap = parseFloat(cs.rowGap) || 0
  let other = 0
  for (const kid of tile.children) if (kid !== frame) other += kid.offsetHeight + gap
  let side = Math.floor(Math.min(tile.clientHeight - padV - other, tile.clientWidth - padH, 640))
  side = Math.max(side, 200)

  /* Модуль — ЦЕЛОЕ число физических пикселей. Канва масштабирована
     (scale(k)), и при дробном модуле crispEdges рисует соседние модули
     разной толщины: на 1280×720 код Охты переставал читаться детектором.
     Поля рамки и плашки (2×22 + 2×22 = 88) в модули не входят. */
  const q = LOYALTY_QR[park]
  if (q && stageScale) {
    const n = Number(q.viewBox.split(' ')[2]) || 41
    const innerPx = (side - 88) * stageScale
    const mod = Math.max(1, Math.floor(innerPx / n))
    side = Math.floor((mod * n) / stageScale + 88)
  }
  frame.style.setProperty('--qr', `${side}px`)
}

/* k = min(vw/1920, vh/1080) — как в турбо; в портрете эталон повёрнут. */
const stageEl = document.getElementById('stage')
const viewportEl = document.getElementById('viewport')
let stageScale = 0

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
  fitTitle()
  fitWords()
  fitQr()
}

if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage)
setTimeout(fitStage, 1200)
window.addEventListener('resize', fitStage)

/* ── 4. Жизненный цикл ───────────────────────────────────────────────────── */
renderPark()
renderLevels()
fitStage()

/* Суточный самоперезапуск в 05:00 — забрать новую сборку и не копить утечки.
   Сверки часов, как у турбо, здесь нет: страница не показывает время, и
   сдвиг перезапуска на час-другой ни на что не влияет. */
if (TV) {
  setInterval(() => {
    const d = new Date()
    if (d.getHours() === 5 && d.getMinutes() === 0) location.reload()
  }, 60000)
}

/* ── 5. Песочница (?demo=1) ──────────────────────────────────────────────── */
function markDemo() {
  document.querySelectorAll('.demo [data-park]').forEach((b) => b.classList.toggle('on', b.dataset.park === park))
  document.querySelectorAll('.demo [data-levels]').forEach((b) => b.classList.toggle('on', previewLevels))
}
document.querySelectorAll('.demo button').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.park) park = b.dataset.park
    if (b.dataset.levels) previewLevels = !previewLevels
    renderPark()
    renderLevels()
    fitStage()
    markDemo()
  })
})
if (DEMO) markDemo()
