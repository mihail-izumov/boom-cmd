/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  media/shared/screens.js — общий для ТВ-экранов «Твоя карта» (loyalty) и
 *  «Заряди карту» (kassa): выбор парка и плеер, который чередует экраны.
 * ═══════════════════════════════════════════════════════════════════════════
 *  Что делает:
 *   1. Плашка «БУМБАСТИК // парк» в шапке — выпадающий список парков.
 *      Выбор = ?park=<код> в адресе + тот же ключ в localStorage, что у
 *      турбо (boom-turbo-park), и перезагрузка — обе страницы плеера
 *      переходят на новый парк разом.
 *   2. Справа в шапке — плеер: ▶/❚❚, два экрана (активный — с полосой
 *      времени до смены) и режим смены «цикл» / «30 с».
 *      «цикл» — экран стоит ровно один полный круг своей анимации
 *      (у «Твоей карты» — сцена 42,4 с, у кассы — все карточки по очереди).
 *
 *  Как чередуется без перезагрузки:
 *   Страница, открытая на панели, — «хозяин». Второй экран она один раз
 *   грузит в скрытый слой поверх себя (iframe, тот же адрес парка + embed=1)
 *   и дальше только показывает/прячет его. Смена — через заставку с
 *   акульими глазами (та же, что на b00m.fun). Тот, кого не видно, стоит
 *   на паузе; тот, кого показали, начинает свою анимацию с начала.
 *   Встроенная страница своего плеера не ведёт — она показывает состояние
 *   хозяина и передаёт ему нажатия (window.parent.boomScreens).
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

const PARK_KEY = 'boom-turbo-park'         // тот же ключ, что у турбо и обеих страниц
const STATE_KEY = 'boom-screens'           // { playing, mode } — помнит выбор на панели
const FIXED_MS = 30000                     // режим «30 с»
const FADE_MS = 350                        // заставка проявляется / гаснет
const HOLD_MS = 900                        // сколько стоят глаза между экранами

const Q = new URLSearchParams(location.search)
const EMBED = Q.get('embed') === '1' && window.parent !== window

/* CSS-анимации страницы: пауза и запуск с начала. Заставку плеера не
   трогаем — её глаза должны пульсировать, пока страница-хозяин на паузе. */
const own = (a) => !(a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.sc-curtain'))
export function pauseAnimations() {
  document.getAnimations().filter(own).forEach((a) => a.pause())
}
export function restartAnimations() {
  document.getAnimations().filter(own).forEach((a) => { a.currentTime = 0; a.play() })
}

/** true — страница открыта внутри плеера другого экрана (не хозяин). */
export function isEmbedded() {
  return EMBED
}

function readState() {
  let s = {}
  try { s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {} } catch { /* приватный режим */ }
  return {
    playing: Q.get('play') === '0' ? false : s.playing !== false,   // по умолчанию — играет
    mode: s.mode === '30' ? '30' : 'cycle',
  }
}
function saveState(st) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ playing: st.playing, mode: st.mode })) } catch {}
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

/* ── Стили — один раз на страницу. Канва 1920 (как вся шапка), px. ───── */
const CSS = `
header.head{z-index:50}   /* список парков — поверх блоков страницы */
.brand-badge.sc-pick{cursor:pointer;position:relative;user-select:none}
.brand-badge.sc-pick .sc-chev{width:14px;height:14px;margin-left:2px;opacity:.7;transition:transform .2s}
.brand-badge.sc-pick.open .sc-chev{transform:rotate(180deg)}
.sc-menu{position:absolute;left:0;top:calc(100% + 8px);min-width:100%;z-index:60;display:none;
  background:#16143f;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:6px;
  box-shadow:0 18px 40px rgba(0,0,0,.55)}
.brand-badge.open .sc-menu{display:block}
.sc-menu button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;
  background:transparent;border:none;border-radius:10px;padding:10px 12px;cursor:pointer;
  color:#fff;font-family:'Unbounded';font-weight:700;font-size:15px;letter-spacing:.3px;text-align:left;white-space:nowrap}
.sc-menu button:hover{background:rgba(255,255,255,.08)}
.sc-menu button.on{color:#c6f52e}
.sc-menu button.on::after{content:'●';font-size:10px}

.slot.sc-player{display:flex;align-items:center;gap:8px;min-width:0;height:auto;outline:none}
.slot.sc-player::after{content:none !important}
.sc-btn{flex:none;width:44px;height:44px;border-radius:12px;border:none;cursor:pointer;display:grid;place-items:center;
  background:rgba(255,255,255,.09);color:#fff}
.sc-btn svg{width:20px;height:20px}
.sc-btn.play{background:#c6f52e;color:#0d0a2e}
.sc-tabs{display:flex;gap:4px;background:rgba(255,255,255,.06);border-radius:14px;padding:4px}
.sc-tab{position:relative;overflow:hidden;border:none;cursor:pointer;background:transparent;border-radius:10px;
  padding:9px 14px;color:rgba(240,244,255,.6);font-family:'Inter';font-weight:700;font-size:15px;white-space:nowrap}
.sc-tab.on{background:#2d6bff;color:#fff}
.sc-tab .sc-bar{position:absolute;left:0;bottom:0;height:3px;width:0;background:#c6f52e}
.sc-mode{flex:none;border:1px solid rgba(255,255,255,.16);background:transparent;cursor:pointer;border-radius:10px;
  padding:9px 10px;color:rgba(240,244,255,.75);font-family:'Inter';font-weight:700;font-size:13px;white-space:nowrap}

.sc-frame{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9000;visibility:hidden;pointer-events:none;background:#0d0a2e}
.sc-frame.on{visibility:visible;pointer-events:auto}
.sc-curtain{position:fixed;inset:0;z-index:9500;background:#1c1a3e;display:flex;align-items:center;justify-content:center;
  opacity:0;pointer-events:none;transition:opacity ${FADE_MS}ms ease}
.sc-curtain.on{opacity:1;pointer-events:auto}
.sc-curtain img{width:120px;height:80px;object-fit:contain;animation:sc-pulse .5s ease-in-out infinite alternate}
@keyframes sc-pulse{0%{transform:scale(.92);opacity:.7}100%{transform:scale(1.08);opacity:1}}
`

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>'
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>'
const ICON_CHEV = '<svg class="sc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

/**
 * Подключить выбор парка и плеер к странице.
 * @param {object} o
 *   id        — 'loyalty' | 'kassa' (строка из SCREENS)
 *   park      — текущий код парка
 *   parks     — { код: { name } }
 *   parkOrder — порядок парков в списке
 *   cycleMs   — () => длина полного круга анимации страницы, мс
 *   restart   — () => начать анимацию страницы с начала
 *   pause     — () => остановить анимацию (страницу не видно)
 */
export function initScreens(o) {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const host = EMBED ? safeParent() : null
  const api = { id: o.id, cycleMs: o.cycleMs, restart: o.restart, pause: o.pause, update: () => {} }

  setupParkMenu(o, (code) => (host ? host.setPark(code) : setPark(code)))
  api.update = setupPlayer(o.id, (action, arg) => (host ? host.act(action, arg) : hostAct(action, arg)))

  if (host) { host.register(api); return }
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

/** Новый парк — в адрес и в память, перезагрузка хозяина (iframe поедет следом). */
function setPark(code) {
  try { localStorage.setItem(PARK_KEY, code) } catch {}
  const u = new URL(location.href)
  u.searchParams.set('park', code)
  u.searchParams.delete('embed')
  location.replace(u.toString())
}

/* ── Плеер: разметка в слоте шапки ─────────────────────────────────────── */
function setupPlayer(selfId, act) {
  const slot = document.getElementById('screens')
  if (!slot) return () => {}
  slot.removeAttribute('aria-hidden')
  slot.classList.add('sc-player')
  document.body.classList.add('has-screens')
  slot.innerHTML =
    `<button class="sc-btn" data-act="toggle" title="Пауза / пуск"></button>` +
    `<div class="sc-tabs">${SCREENS.map((s) => `<button class="sc-tab" data-act="go" data-id="${s.id}">${esc(s.name)}<i class="sc-bar"></i></button>`).join('')}</div>` +
    `<button class="sc-mode" data-act="mode" title="Когда менять экран"></button>`
  slot.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]')
    if (b) act(b.dataset.act, b.dataset.id)
  })
  const btn = slot.querySelector('.sc-btn')
  const mode = slot.querySelector('.sc-mode')
  const tabs = [...slot.querySelectorAll('.sc-tab')]

  /* Состояние приходит от хозяина: { current, playing, mode, progress 0..1 } */
  return (st) => {
    btn.innerHTML = st.playing ? ICON_PAUSE : ICON_PLAY
    btn.classList.toggle('play', !st.playing)
    mode.textContent = st.mode === '30' ? '30 с' : 'цикл'
    tabs.forEach((t) => {
      const on = t.dataset.id === st.current
      t.classList.toggle('on', on)
      t.querySelector('.sc-bar').style.width = on && st.playing ? `${Math.round(st.progress * 1000) / 10}%` : '0'
    })
  }
}

/* ── Хозяин ────────────────────────────────────────────────────────────── */
let H = null   // состояние хозяина (одно на окно)

function becomeHost(o, selfApi) {
  const st = readState()
  H = {
    selfId: o.id,
    self: selfApi,
    child: null,            // api встроенной страницы, когда она загрузится
    frame: null,
    curtain: null,
    current: o.id,
    playing: st.playing,
    mode: st.mode,
    startedAt: performance.now(),
    dwell: 0,
    timer: 0,
    busy: false,
  }
  window.boomScreens = {
    register(api) { H.child = api; if (H.current !== api.id) api.pause(); else api.restart(); broadcast() },
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
  }
  H.curtain = document.createElement('div')
  H.curtain.className = 'sc-curtain'
  H.curtain.innerHTML = `<img src="${SHARK}" alt="">`
  document.body.appendChild(H.curtain)

  schedule()
  setInterval(broadcast, 250)
  broadcast()
}

function apiOf(id) {
  return id === H.selfId ? H.self : H.child
}

function schedule() {
  clearTimeout(H.timer)
  const a = apiOf(H.current)
  H.dwell = H.mode === '30' ? FIXED_MS : Math.max(8000, (a && a.cycleMs()) || FIXED_MS)
  H.startedAt = performance.now()
  if (H.playing) H.timer = setTimeout(() => switchTo(nextId()), H.dwell)
}

function nextId() {
  const i = SCREENS.findIndex((s) => s.id === H.current)
  return SCREENS[(i + 1) % SCREENS.length].id
}

function switchTo(id) {
  if (H.busy || id === H.current) return
  const target = apiOf(id)
  if (!target) {                       // встроенная ещё грузится — попробуем позже
    H.timer = setTimeout(() => switchTo(id), 5000)
    return
  }
  H.busy = true
  H.curtain.classList.add('on')
  setTimeout(() => {
    const prev = apiOf(H.current)
    H.frame && H.frame.classList.toggle('on', id !== H.selfId)
    H.current = id
    target.restart()
    if (prev) prev.pause()
    broadcast()
    setTimeout(() => {
      H.curtain.classList.remove('on')
      H.busy = false
      schedule()
    }, HOLD_MS)
  }, FADE_MS)
}

function hostAct(action, arg) {
  if (!H) return
  if (action === 'toggle') {
    H.playing = !H.playing
    saveState(H)
    if (H.playing) schedule()
    else clearTimeout(H.timer)
  } else if (action === 'mode') {
    H.mode = H.mode === '30' ? 'cycle' : '30'
    saveState(H)
    schedule()
  } else if (action === 'go') {
    if (arg && arg !== H.current) { clearTimeout(H.timer); switchTo(arg) }
  }
  broadcast()
}

function broadcast() {
  if (!H) return
  const progress = H.playing ? Math.min(1, (performance.now() - H.startedAt) / (H.dwell || 1)) : 0
  const st = { current: H.current, playing: H.playing, mode: H.mode, progress }
  H.self.update(st)
  if (H.child) { try { H.child.update(st) } catch { H.child = null } }
}
