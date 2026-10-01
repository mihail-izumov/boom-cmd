/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  media/shared/screens.js — общий для ТВ-экранов «Твоя карта» (loyalty) и
 *  «Заряди карту» (kassa): выбор парка, плеер, который чередует экраны,
 *  и заставка между ними.
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. Плашка «БУМБАСТИК // парк» в шапке — выпадающий список парков.
 *     Выбор = ?park=<код> в адресе + тот же ключ в localStorage, что у
 *     турбо (boom-turbo-park). Смена идёт через заставку: она закрывает
 *     экран, страница перезагружается под ней и открывается, только когда
 *     полностью готова (шрифты, картинки, второй экран плеера).
 *  2. Справа в шапке — плеер: ❚❚/▶ и два экрана; под активным — полоса
 *     времени до смены. Экран стоит ровно один полный круг своей анимации
 *     (у «Твоей карты» — сцена 42,4 с, у кассы — все карточки по очереди).
 *     Пауза замораживает экран вместе с полосой; «▶» продолжает с того же
 *     места. Пауза живёт до перезагрузки: после 05:00 и после смены парка
 *     плеер снова играет (?play=0 в адресе — стартовать на паузе).
 *  3. Заставка — фраза «Играй больше — плати меньше» во всю ширину и
 *     акульи глаза b00m.fun. Уход: фраза гаснет, глаза «выстреливают» —
 *     вырастают на весь экран и растворяются, под ними проявляется экран.
 *
 *  Как чередуется без перезагрузки:
 *   Страница, открытая на панели, — «хозяин». Второй экран она один раз
 *   грузит в скрытый слой поверх себя (iframe, тот же парк + embed=1) и
 *   дальше только показывает/прячет его. Тот, кого не видно, стоит на паузе;
 *   тот, кого показали, начинает анимацию с начала. Встроенная страница
 *   своего плеера не ведёт — показывает состояние хозяина и передаёт ему
 *   нажатия (window.parent.boomScreens).
 *
 *  ⚠ Турбо (media/turbo/) этот модуль НЕ подключает — его шапка не менялась.
 *  ⚠ Новый экран в ротацию: строка в SCREENS ниже + initScreens() в его js
 *    + слот <div class="slot" id="screens"> в шапке.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import SHARK from './shark-eyes.svg'

/* Экраны ротации — по порядку показа. path — от корня сайта. */
const SCREENS = [
  { id: 'loyalty', name: 'Твоя карта',   path: 'media/loyalty/' },
  { id: 'kassa',   name: 'Заряди карту', path: 'media/kassa/' },
]

const PARK_KEY = 'boom-turbo-park'   // тот же ключ, что у турбо и обеих страниц
const MIN_DWELL = 8000               // страховка, если страница не знает свой круг
const IN_MS = 400                    // заставка закрывает экран
const HOLD_MS = 1300                 // минимум на заставке — фраза успевает прочитаться
const OUT_MS = 750                   // «выстрел» глаз и проявление экрана

const Q = new URLSearchParams(location.search)
const EMBED = Q.get('embed') === '1' && window.parent !== window

/** true — страница открыта внутри плеера другого экрана (не хозяин). */
export function isEmbedded() {
  return EMBED
}

/* CSS-анимации страницы: заморозить, продолжить, начать с начала.
   Заставку не трогаем — её глаза пульсируют, пока страница на паузе. */
const own = (a) => !(a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.sc-curtain'))
export function pauseAnimations() {
  document.getAnimations().filter(own).forEach((a) => a.pause())
}
export function resumeAnimations() {
  document.getAnimations().filter(own).forEach((a) => a.play())
}
export function restartAnimations() {
  document.getAnimations().filter(own).forEach((a) => { a.currentTime = 0; a.play() })
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Страница готова: всё загружено, шрифты на месте, два кадра отрисованы. */
function pageReady() {
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => window.addEventListener('load', r, { once: true }))
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
  return Promise.all([loaded, fonts])
    .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

/* ── Стили. Шапка — канва 1920 px (её масштабирует сама страница);
   заставка — поверх всего окна, в vw/vh. ─────────────────────────────── */
const CSS = `
header.head{z-index:50}   /* список парков — поверх блоков страницы */
body.has-screens .brand{gap:18px}
body.has-screens .brand-icon{width:60px}
body.has-screens .brand-badge{font-size:23px;gap:12px;padding:9px 18px;border-radius:14px}
.brand-badge.sc-pick{cursor:pointer;position:relative;user-select:none}
.brand-badge.sc-pick .sc-chev{width:22px;height:22px;margin-left:2px;opacity:.75;transition:transform .2s}
.brand-badge.sc-pick.open .sc-chev{transform:rotate(180deg)}
.sc-menu{position:absolute;left:0;top:calc(100% + 10px);min-width:100%;z-index:60;display:none;
  background:#16143f;border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:8px;
  box-shadow:0 22px 50px rgba(0,0,0,.6)}
.brand-badge.open .sc-menu{display:block}
.sc-menu button{display:flex;align-items:center;justify-content:space-between;gap:20px;width:100%;
  background:transparent;border:none;border-radius:12px;padding:14px 16px;cursor:pointer;
  color:#fff;font-family:'Unbounded';font-weight:700;font-size:23px;letter-spacing:.3px;text-align:left;white-space:nowrap}
.sc-menu button:hover{background:rgba(255,255,255,.08)}
.sc-menu button.on{color:#c6f52e}
.sc-menu button.on::after{content:'';width:12px;height:12px;border-radius:50%;background:#c6f52e}

.slot.sc-player{display:flex;align-items:center;gap:10px;min-width:0;height:auto;outline:none}
.slot.sc-player::after{content:none !important}
.sc-btn{flex:none;width:58px;height:58px;border-radius:15px;border:none;cursor:pointer;display:grid;place-items:center;
  background:rgba(255,255,255,.1);color:#fff}
.sc-btn svg{width:26px;height:26px}
.sc-btn.play{background:#c6f52e;color:#0d0a2e}
.sc-tabs{display:flex;gap:5px;background:rgba(255,255,255,.07);border-radius:16px;padding:5px}
.sc-tab{position:relative;overflow:hidden;border:none;cursor:pointer;background:transparent;border-radius:12px;
  padding:12px 20px;color:rgba(240,244,255,.62);font-family:'Inter';font-weight:800;font-size:21px;white-space:nowrap}
.sc-tab.on{background:#2d6bff;color:#fff}
.sc-tab .sc-bar{position:absolute;left:0;bottom:0;height:4px;width:0;background:#c6f52e}

.sc-frame{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9000;visibility:hidden;pointer-events:none;background:#0d0a2e}
.sc-frame.on{visibility:visible;pointer-events:auto}

.sc-curtain{position:fixed;inset:0;z-index:9500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5vh;
  background:#1c1a3e;opacity:0;pointer-events:none;overflow:hidden;transition:opacity ${IN_MS}ms ease}
.sc-curtain.on{opacity:1;pointer-events:auto}
.sc-curtain img{height:min(34vh,46vw);width:auto;animation:sc-pulse .5s ease-in-out infinite alternate}
.sc-curtain .sc-say{margin:0 3vw;text-align:center;white-space:nowrap;color:#fff;
  font-family:'Unbounded',sans-serif;font-weight:700;font-size:4.3vw;line-height:1.15;letter-spacing:.02em}
.sc-curtain .sc-say b{color:#c6f52e;font-weight:700}
@media (orientation:portrait){
  .sc-curtain .sc-say{font-size:8.2vw;white-space:normal}
  .sc-curtain .sc-say span{display:block}
}
@keyframes sc-pulse{0%{transform:scale(.94);opacity:.8}100%{transform:scale(1.06);opacity:1}}
/* Уход заставки: фраза гаснет, глаза выстреливают на весь экран, фон тает */
.sc-curtain.out{opacity:0;transition:opacity ${OUT_MS}ms cubic-bezier(.4,0,.2,1)}
.sc-curtain.out .sc-say{opacity:0;transform:scale(.96);transition:opacity ${Math.round(OUT_MS * 0.25)}ms ease,transform ${Math.round(OUT_MS * 0.25)}ms ease}
.sc-curtain.out img{animation:sc-shoot ${OUT_MS}ms cubic-bezier(.5,0,.75,0) forwards}
@keyframes sc-shoot{0%{transform:scale(1);opacity:1}100%{transform:scale(9);opacity:0}}
`

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>'
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>'
const ICON_CHEV = '<svg class="sc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

/* ── Заставка хозяина — ставится сразу при загрузке модуля, чтобы новая
   страница не мелькнула недорисованной. Встроенной странице она не нужна. */
let curtain = null
if (!EMBED) {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  curtain = document.createElement('div')
  curtain.className = 'sc-curtain on'
  curtain.style.transition = 'none'        // первый кадр — сразу закрыто
  curtain.innerHTML = `<img src="${SHARK}" alt=""><div class="sc-say"><span>Играй больше —</span> <b>плати меньше</b></div>`
  const put = () => { document.body.appendChild(curtain); requestAnimationFrame(() => { curtain.style.transition = '' }) }
  if (document.body) put()
  else document.addEventListener('DOMContentLoaded', put, { once: true })
}

function curtainIn() {
  curtain.classList.remove('out')
  curtain.classList.add('on')
  return wait(IN_MS)
}
function curtainOut() {
  curtain.classList.add('out')
  return wait(OUT_MS).then(() => curtain.classList.remove('on', 'out'))
}

/**
 * Подключить выбор парка и плеер к странице.
 * @param {object} o
 *   id        — 'loyalty' | 'kassa' (строка из SCREENS)
 *   park      — текущий код парка
 *   parks     — { код: { name } }
 *   parkOrder — порядок парков в списке
 *   cycleMs   — () => длина полного круга анимации страницы, мс
 *   restart   — () => начать анимацию с начала (экран показали)
 *   pause     — () => заморозить анимацию (пауза или экран скрыт)
 *   resume    — () => продолжить с того же места
 */
export function initScreens(o) {
  if (EMBED) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
  }
  const host = EMBED ? safeParent() : null
  const api = { id: o.id, cycleMs: o.cycleMs, restart: o.restart, pause: o.pause, resume: o.resume, update: () => {} }

  setupParkMenu(o, (code) => (host ? host.setPark(code) : setPark(code)))
  api.update = setupPlayer((action, arg) => (host ? host.act(action, arg) : hostAct(action, arg)))

  if (host) {
    o.pause()                                  // пока не показали — стоим
    pageReady().then(() => host.register(api)) // хозяин узнаёт, что экран готов
    return
  }
  becomeHost(o, api)
}

function safeParent() {
  try { return window.parent.boomScreens || null } catch { return null }
}

/* ── Выбор парка ───────────────────────────────────────────────────────── */
function setupParkMenu(o, choose) {
  const badge = document.querySelector('.brand-badge')
  if (!badge) return
  badge.classList.add('sc-pick')
  badge.setAttribute('role', 'button')
  badge.insertAdjacentHTML('beforeend', ICON_CHEV + '<div class="sc-menu"></div>')
  const menu = badge.querySelector('.sc-menu')
  menu.innerHTML = o.parkOrder
    .filter((c) => o.parks[c])
    .map((c) => `<button data-park="${c}"${c === o.park ? ' class="on"' : ''}>${esc(o.parks[c].name)}</button>`)
    .join('')
  badge.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-park]')
    if (b) { e.stopPropagation(); badge.classList.remove('open'); if (b.dataset.park !== o.park) choose(b.dataset.park); return }
    badge.classList.toggle('open')
  })
  document.addEventListener('click', (e) => { if (!badge.contains(e.target)) badge.classList.remove('open') })
}

/** Новый парк: заставка закрывает экран → перезагрузка под ней. Новая
    страница стартует с закрытой заставкой и откроется, когда будет готова. */
function setPark(code) {
  try { localStorage.setItem(PARK_KEY, code) } catch {}
  const u = new URL(location.href)
  u.searchParams.set('park', code)
  u.searchParams.delete('embed')
  u.searchParams.delete('play')
  if (H) { clearTimeout(H.timer); H.busy = true }
  curtainIn().then(() => location.replace(u.toString()))
}

/* ── Плеер: разметка в слоте шапки ─────────────────────────────────────── */
function setupPlayer(act) {
  const slot = document.getElementById('screens')
  if (!slot) return () => {}
  slot.removeAttribute('aria-hidden')
  slot.classList.add('sc-player')
  document.body.classList.add('has-screens')
  slot.innerHTML =
    `<button class="sc-btn" data-act="toggle" title="Пауза / пуск"></button>` +
    `<div class="sc-tabs">${SCREENS.map((s) => `<button class="sc-tab" data-act="go" data-id="${s.id}">${esc(s.name)}<i class="sc-bar"></i></button>`).join('')}</div>`
  slot.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]')
    if (b) act(b.dataset.act, b.dataset.id)
  })
  const btn = slot.querySelector('.sc-btn')
  const tabs = [...slot.querySelectorAll('.sc-tab')]

  /* Состояние приходит от хозяина: { current, playing, progress 0..1 } */
  return (st) => {
    btn.innerHTML = st.playing ? ICON_PAUSE : ICON_PLAY
    btn.classList.toggle('play', !st.playing)
    tabs.forEach((t) => {
      const on = t.dataset.id === st.current
      t.classList.toggle('on', on)
      t.querySelector('.sc-bar').style.width = on ? `${Math.round(st.progress * 1000) / 10}%` : '0'
    })
  }
}

/* ── Хозяин ────────────────────────────────────────────────────────────── */
let H = null

function becomeHost(o, selfApi) {
  H = {
    selfId: o.id,
    self: selfApi,
    child: null,          // api встроенной страницы — когда она готова
    childReady: null,     // промис «встроенная готова»
    frame: null,
    current: o.id,
    playing: Q.get('play') !== '0',
    dwell: 0,
    elapsed: 0,           // сколько текущий экран уже отыграл до последней паузы
    startedAt: 0,
    timer: 0,
    busy: true,           // пока открывается первый раз
  }
  let markChild
  H.childReady = new Promise((r) => { markChild = r })
  window.boomScreens = {
    register(api) {
      H.child = api
      if (H.current !== api.id) api.pause()
      markChild()
      broadcast()
    },
    act: hostAct,
    setPark,
  }

  const other = SCREENS.find((s) => s.id !== o.id)
  if (other) {
    const u = new URL(import.meta.env.BASE_URL + other.path, location.href)
    for (const k of ['park', 'tv', 'demo']) if (Q.get(k)) u.searchParams.set(k, Q.get(k))
    if (!u.searchParams.get('park')) u.searchParams.set('park', o.park)
    u.searchParams.set('embed', '1')
    H.frame = document.createElement('iframe')
    H.frame.className = 'sc-frame'
    H.frame.title = other.name
    H.frame.src = u.toString()
    document.body.appendChild(H.frame)
  } else {
    markChild()
  }

  /* Первое открытие: ждём, пока готовы обе страницы (вторую — не дольше
     8 с, чтобы панель не висела на заставке), и открываем экран с начала. */
  selfApi.pause()
  Promise.all([pageReady(), Promise.race([H.childReady, wait(8000)]), wait(HOLD_MS)]).then(() => {
    selfApi.restart()
    if (!H.playing) selfApi.pause()
    startDwell()
    return curtainOut()
  }).then(() => { H.busy = false })

  setInterval(broadcast, 200)
  broadcast()
}

function apiOf(id) {
  return id === H.selfId ? H.self : H.child
}

/* Новый отсчёт для текущего экрана: ровно один его круг. */
function startDwell() {
  clearTimeout(H.timer)
  const a = apiOf(H.current)
  H.dwell = Math.max(MIN_DWELL, (a && a.cycleMs()) || MIN_DWELL)
  H.elapsed = 0
  H.startedAt = performance.now()
  if (H.playing) H.timer = setTimeout(() => switchTo(nextId()), H.dwell)
}

function nextId() {
  const i = SCREENS.findIndex((s) => s.id === H.current)
  return SCREENS[(i + 1) % SCREENS.length].id
}

async function switchTo(id) {
  if (H.busy || id === H.current) return
  H.busy = true
  clearTimeout(H.timer)
  await curtainIn()
  /* Встроенная ещё грузится — держим заставку, пока не будет готова */
  if (!apiOf(id)) await Promise.race([H.childReady, wait(15000)])
  const target = apiOf(id)
  if (!target) {                       // так и не загрузилась — остаёмся где были
    await curtainOut()
    H.busy = false
    startDwell()
    return
  }
  const prev = apiOf(H.current)
  if (prev) prev.pause()
  H.frame && H.frame.classList.toggle('on', id !== H.selfId)
  H.current = id
  H.playing = true                     // переход всегда играет
  await wait(HOLD_MS - 300)
  target.restart()
  startDwell()
  broadcast()
  await curtainOut()
  H.busy = false
}

function hostAct(action, arg) {
  if (!H) return
  if (action === 'toggle') {
    const a = apiOf(H.current)
    if (H.playing) {                   // пауза: замираем вместе с полосой
      H.playing = false
      clearTimeout(H.timer)
      H.elapsed += performance.now() - H.startedAt
      if (a) a.pause()
    } else {                           // пуск: с того же места
      H.playing = true
      H.startedAt = performance.now()
      if (a) a.resume()
      if (!H.busy) H.timer = setTimeout(() => switchTo(nextId()), Math.max(0, H.dwell - H.elapsed))
    }
  } else if (action === 'go') {
    if (arg && arg !== H.current) switchTo(arg)
  }
  broadcast()
}

function broadcast() {
  if (!H) return
  const run = H.elapsed + (H.playing && H.startedAt ? performance.now() - H.startedAt : 0)
  const st = { current: H.current, playing: H.playing, progress: H.dwell ? Math.min(1, run / H.dwell) : 0 }
  H.self.update(st)
  if (H.child) { try { H.child.update(st) } catch { H.child = null } }
}
