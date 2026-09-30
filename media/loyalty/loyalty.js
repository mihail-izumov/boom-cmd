/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /media/loyalty/ — ТВ-экран «Твоя карта» для постоянных гостей
 * ═══════════════════════════════════════════════════════════════════════════
 *  Отдельный Vite-вход, как /media/turbo/. Ни одного импорта из src/.
 *  Страница СТАТИЧНАЯ: без API. Всё, что меняется по парку, — в конфиге ниже.
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
const PAGE_VERSION = 'v2.0'

/* Парки. Коды и названия — те же, что у турбо (park / park_ru источника),
   чтобы бейдж и переключатель при смене экрана не менялись ни на букву.

   bonus — ячейка «+500 бонусов за первую регистрацию в кабинете».
   ⚠ Питерленд — false по решению владельца. Не «выравнивать» по соседям.
     Вместо +500 там ячейка «уровень навсегда» (FAQ b00m.fun/rewards).
   charge — ячейка «до +60% бонусами при пополнении онлайн от 500 ₽»
     (b00m.fun/rewards). Флаг заведён на случай, если в каком-то парке
     онлайн-пополнение работает иначе. */
const PARKS = {
  ohta:      { name: 'Охта Молл', bonus: true,  charge: true },
  piterland: { name: 'Питерленд', bonus: false, charge: true },
  iyun:      { name: 'ТЦ Июнь',   bonus: true,  charge: true },
}
const PARK_ORDER = ['ohta', 'piterland', 'iyun']

/* Лестница статусов. Пороги, скидки, «≈ игр за 1 500 ₽» и цвета — ровно из
   BoomRewards.vue (b00m.fun/rewards), по возрастанию. Владелец подтвердил
   30.09: «цифры верны». Поменялись на кассе — править здесь И на /rewards,
   иначе экран и сайт разойдутся.

   SHOW_LEVEL_NUMBERS = false — ступени без ₽ и %: только имена и цвета.
   Выключатель на случай, если цифры снова окажутся под вопросом, — ячейка
   при этом не пустеет. */
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
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')   // неразрывный: «10 500» не рвётся

const LEVEL_ICONS = {
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  medal: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
  swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
  bow: '<path d="M17 3h4v4"/><path d="M18.575 11.082a13 13 0 0 1 1.048 9.027 1.17 1.17 0 0 1-1.914.597L14 17"/><path d="M7 10 3.29 6.29a1.17 1.17 0 0 1 .6-1.91 13 13 0 0 1 9.03 1.05"/><path d="M7 14a1.7 1.7 0 0 0-1.207.5l-2.646 2.646A.5.5 0 0 0 3.5 18H5a1 1 0 0 1 1 1v1.5a.5.5 0 0 0 .854.354L9.5 18.207A1.7 1.7 0 0 0 10 17v-2a1 1 0 0 0-1-1z"/><path d="M9.707 14.293 21 3"/>',
}

/**
 * Лестница. Каждая цифра — с подписью, что это: «−15% скидка», «от 5 000 ₽
 * на игры», «≈25 игр за 1 500 ₽». Цифра без подписи — ровно та беда, что с
 * макетом «1300 зарядов», который прочли как цену.
 */
function renderLevels() {
  const box = document.getElementById('ladder')
  const top = LEVELS[LEVELS.length - 1]
  document.getElementById('lad-max').hidden = !showNumbers
  document.getElementById('lad-pct').textContent = `−${top.discount}%`
  document.getElementById('lad-sub').textContent = showNumbers
    ? 'и экономь на каждой игре'
    : 'чем больше играешь — тем выше статус'
  box.innerHTML = LEVELS.map((l) => {
    const body = !showNumbers
      ? ''
      : l.discount
        ? `<div class="s-disc"><span class="fs-disc">−${l.discount}%</span></div>
           <div class="s-lbl">скидка</div>
           <div class="s-thr">от <b>${fmt(l.threshold)}\u00a0₽</b> на игры</div>
           <div class="s-games"><b>≈${l.games}\u00a0игр</b> за 1\u00a0500\u00a0₽</div>`
        : `<div class="s-base">базовый</div>
           <div class="s-games"><b>≈${l.games}\u00a0игр</b> за 1\u00a0500\u00a0₽</div>`
    return `
      <div class="step" data-id="${l.id}" style="--c:${l.color}">
        <svg class="s-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LEVEL_ICONS[l.icon] || ''}</svg>
        <div class="s-name"><span class="fs-name">${esc(l.name)}</span></div>
        ${body}
      </div>`
  }).join('')
}

const INF_SVG = '<svg class="inf" viewBox="0 0 24 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 12c-3 0-5-2.2-5-5s2-5 5-5c4.5 0 7.5 10 12 10 3 0 5-2.2 5-5s-2-5-5-5C13.5 2 10.5 12 6 12Z"/></svg>'

function renderPromos(p) {
  const el = document.getElementById('p500')
  el.classList.toggle('alt', !p.bonus)
  el.innerHTML = p.bonus
    ? '<div class="plate"><div class="big">+500</div><div class="word">БОНУСОВ</div></div><div class="cap">за первую регистрацию в кабинете</div>'
    : `${INF_SVG}<div class="ttl">Уровень навсегда</div><div class="cap">не понижается и работает во всех парках</div>`
  document.getElementById('p60').hidden = !p.charge
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
  renderPromos(p)

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

/* Три слова «накоплено» — ОДНИМ кеглем: разные размеры читались бы как
   разная важность. */
function fitWords() {
  const words = [...document.querySelectorAll('.fit-word')]
  let size = 999
  words.forEach((w) => { size = Math.min(size, fitCount(w, 48, 20)) })
  words.forEach((w) => { w.style.fontSize = `${size}px` })
}

/* Ступени: имена и скидки — единым кеглем по самой узкой ступени. */
function fitUniform(sel, max, min) {
  const els = [...document.querySelectorAll(sel)]
  let size = 999
  els.forEach((e) => { size = Math.min(size, fitCount(e, max, min)) })
  els.forEach((e) => { e.style.fontSize = `${size}px` })
}
function fitSteps() {
  fitUniform('.fs-name', 22, 12)
  fitUniform('.fs-disc', 46, 22)
}

/* Заголовок карты: по ширине плитки и не выше трети её высоты. */
function fitTitle() {
  const t = document.getElementById('offer-title')
  const tile = t.closest('.card-tile')
  fitCount(t, 80, 34, Math.round(tile.clientHeight * 0.34))
}

/* «−50%» — по месту, которое осталось справа от заголовка лестницы. */
function fitPct() {
  const pct = document.getElementById('lad-pct')
  const wrap = document.getElementById('lad-max')
  if (wrap.hidden) return
  const head = wrap.parentElement
  const left = head.firstElementChild
  const room = head.clientWidth - left.offsetWidth - 20
  wrap.style.width = `${Math.max(room, 120)}px`
  fitCount(pct, 130, 60)
  wrap.style.width = ''
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
  const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  const gap = parseFloat(cs.rowGap) || 0
  let other = 0
  for (const kid of tile.children) if (kid !== frame) other += kid.offsetHeight + gap
  let side = Math.floor(Math.min(tile.clientHeight - padV - other, tile.clientWidth - padH, 560))
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
  fitTitle()
  fitPct()
  fitSteps()
  fitWords()
  fitCount(document.getElementById('p60-pct'), 64, 30)
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
