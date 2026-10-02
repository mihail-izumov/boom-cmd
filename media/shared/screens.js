/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  media/shared/screens.js — общий для ТВ-экранов «Твоя карта» (loyalty),
 *  «Заряди карту» (kassa) и «Турбо» (turbo): выбор парка, плеер, который
 *  чередует экраны, заставка между ними, автообновление и суточный
 *  перезапуск панели.
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. Плашка «БУМБАСТИК // парк» в шапке — выпадающий список парков.
 *     Выбор = ?park=<код> в адресе + тот же ключ в localStorage, что у
 *     турбо (boom-turbo-park). Смена идёт через заставку: она закрывает
 *     экран, страница перезагружается под ней и открывается, только когда
 *     полностью готова (шрифты, картинки, остальные экраны плеера, у турбо —
 *     ещё и первое расписание).
 *  2. Справа в шапке — плеер: ❚❚/▶ и три экрана; под активным — полоса
 *     времени до смены. После перехода экран 3 с стоит на первом кадре,
 *     потом играет ровно один полный круг своей анимации (у «Статуса» —
 *     сцена 42,4 с с кадра «Заряжено», у «Зарядки» — все карточки по очереди,
 *     у «Турбо» — два круга шаров над плашкой «+50», 36 с).
 *     Пауза замораживает экран вместе с полосой; «▶» продолжает с того же
 *     места. Пауза живёт до перезагрузки: после 05:00 и после смены парка
 *     плеер снова играет (?play=0 в адресе — стартовать на паузе).
 *     Экран, который сейчас показать нельзя (у турбо в портрете и в маленьком
 *     окне вместо витрины — заглушка), плеер пропускает, а его кнопку гасит.
 *  3. Заставка — фраза «Играй больше — плати меньше» во всю ширину и
 *     акульи глаза b00m.fun. Уход: фраза гаснет, глаза «выстреливают» —
 *     вырастают на весь экран и растворяются, под ними проявляется экран.
 *     Заставка никогда не остаётся навсегда: парк не найден — уходит сразу
 *     (видна плашка «Парк не найден»), страница сломалась — уходит сама
 *     через 20 с.
 *
 *  Как чередуется без перезагрузки:
 *   Страница, открытая на панели, — «хозяин». Остальные экраны она один раз
 *   грузит в скрытые слои поверх себя (iframe на каждый, тот же парк +
 *   embed=1) и дальше только показывает/прячет их. Те, кого не видно, стоят
 *   на паузе; тот, кого показали, начинает анимацию с начала. Встроенная
 *   страница своего плеера не ведёт — показывает состояние хозяина и передаёт
 *   ему нажатия (window.parent.boomScreens). Хозяином может быть любой из
 *   трёх экранов: какой адрес открыт на панели, с того и начинается круг.
 *
 *  4. Автообновление. Каждая публикация кладёт рядом media/build.json со
 *     своим номером; тот же номер вшит в страницу (__MEDIA_BUILD__,
 *     vite.config.js). Хозяин раз в минуту сверяет их. Вышла новая сборка —
 *     на ближайшей смене экрана, когда заставка уже закрыла экран, страница
 *     перезагружается в обход кэша (?r=…), остальные экраны плеера грузятся
 *     заново вместе с ней. Персоналу парка версия не нужна: на панели
 *     всегда последняя. На паузе не дёргаем — обновится после пуска.
 *     Бейдж в подвале (рядом с меткой версии) сам говорит, что с версией:
 *       ✓ Актуальная версия            — сверились с сервером, совпало;
 *       ✓ Актуальная · обновилась сама ЧЧ:ММ — пришла автообновлением;
 *       ↻ Вышла новая — обновится на смене экрана (или «после пуска»);
 *       ⚠ Устарела — нажмите, чтобы обновить — автообновление не помогло;
 *       Нет связи — версия не проверена.
 *     Кнопка ⟳ в подвале тоже грузит страницу в обход кэша.
 *
 *  5. Суточный перезапуск (только режим ТВ, ?tv=1). Раз в сутки, в 05:00 по
 *     Москве, панель перезагружается в обход кэша — не копить утечки за
 *     месяцы работы. Один механизм на все три экрана, у хозяина: встроенные
 *     страницы перезагружаются вместе с ним. Играет — на ближайшей смене
 *     экрана под заставкой; на паузе — сразу (пауза до утра не живёт).
 *     Считается по дате «с 05:00 до 05:00», а не по совпадению минуты:
 *     пропущенная проверка (панель задумалась) перезапуск не отменяет.
 *
 *  ⚠ Новый экран в ротацию: строка в SCREENS ниже + initScreens() в его js
 *    + слот <div class="slot" id="screens"> в шапке + страховка загрузки
 *    первым скриптом в <head> (как у трёх экранов).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import SHARK from './shark-eyes.svg'

/* Экраны ротации — по порядку показа. path — от корня сайта. */
const SCREENS = [
  { id: 'loyalty', name: 'Статус',  path: 'media/loyalty/' },
  { id: 'kassa',   name: 'Зарядка', path: 'media/kassa/' },
  /* Третьим — турбо, подпись «Турбо» (решение владельца 01.10) */
  { id: 'turbo',   name: 'Турбо',   path: 'media/turbo/' },
]

const PARK_KEY = 'boom-turbo-park'   // тот же ключ, что у всех трёх страниц
const MIN_DWELL = 8000               // страховка, если страница не знает свой круг
const IN_MS = 400                    // заставка закрывает экран
const HOLD_MS = 1300                 // минимум на заставке — фраза успевает прочитаться
const OUT_MS = 750                   // «выстрел» глаз и проявление экрана
// eslint-disable-next-line no-undef
const BUILD = typeof __MEDIA_BUILD__ !== 'undefined' ? __MEDIA_BUILD__ : ''
const CHECK_MS = 60000               // как часто сверять номер сборки с сервером
const FIRST_MS = 3000                // после перехода экран стоит на первом кадре (решение владельца 01.10)
const READY_MS = 8000                // дольше этого первое открытие не ждёт ни один экран
const SAFETY_MS = 20000              // заставка, которую никто не убрал, уходит сама
const DAY_FROM = '05:00'             // суточный перезапуск, по Москве

const Q = new URLSearchParams(location.search)
const EMBED = Q.get('embed') === '1' && window.parent !== window
const TV = Q.get('tv') === '1'

/** true — страница открыта внутри плеера другого экрана (не хозяин). */
export function isEmbedded() {
  return EMBED
}

/* Метка сборки для бейджа в подвале: «собрано ДД.ММ» по Москве. Одна на
   все три экрана — та же, что у приложения (define __APP_BUILD__ в
   vite.config.js, «ГГГГ-ММ-ДД ЧЧ:ММ» по UTC). Вне сборки — пусто. */
// eslint-disable-next-line no-undef
const APP_BUILT = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''
export const BUILT_DAY = (() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(APP_BUILT || ''))
  if (!m) return ''
  try {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
    return d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' })
  } catch { return `${m[3]}.${m[2]}` }
})()

/* CSS-анимации страницы: заморозить, продолжить, начать с начала.
   Заставку не трогаем — её глаза пульсируют, пока страница на паузе.
   Браузер без getAnimations (старый моноблок) — анимации просто идут, как
   шли: экран не ломается. */
const own = (a) => !(a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.sc-curtain'))
const anims = () => (typeof document.getAnimations === 'function' ? document.getAnimations() : []).filter(own)
export function pauseAnimations() {
  anims().forEach((a) => a.pause())
}
export function resumeAnimations() {
  anims().forEach((a) => a.play())
}
/* offset, мс — с какого места круга начать (у «Статуса» — с кадра «Заряжено») */
export function restartAnimations(offset = 0) {
  anims().forEach((a) => { a.currentTime = offset; a.play() })
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Страница готова: всё загружено, шрифты на месте, два кадра отрисованы,
    и то, чего страница ждёт сама (o.ready — у турбо первое расписание),
    пришло — но не дольше READY_MS. */
function pageReady(extra) {
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise((r) => window.addEventListener('load', r, { once: true }))
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
  const mine = Promise.race([Promise.resolve(extra).catch(() => {}), wait(READY_MS)])
  return Promise.all([loaded, fonts, mine])
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
/* Клики ловит сама кнопка, не её значок: значок меняется при паузе/пуске */
.sc-btn svg,.sc-tab .sc-bar{pointer-events:none}
.sc-btn svg{width:26px;height:26px}
.sc-btn.play{background:#c6f52e;color:#0d0a2e}
.sc-tabs{display:flex;gap:5px;background:rgba(255,255,255,.07);border-radius:16px;padding:5px}
.sc-tab{position:relative;overflow:hidden;border:none;cursor:pointer;background:transparent;border-radius:12px;
  padding:12px 20px;color:rgba(240,244,255,.62);font-family:'Inter';font-weight:800;font-size:21px;white-space:nowrap}
.sc-tab.on{background:#2d6bff;color:#fff}
/* Экран сейчас не показать (турбо в портрете) — кнопка погашена, плеер его пропускает */
.sc-tab.off{opacity:.32;cursor:default}
.sc-tab .sc-bar{position:absolute;left:0;bottom:0;height:4px;width:0;background:#c6f52e}
/* Вертикальная панель: в шапке 1040 px на плашку и три кнопки — кнопки поуже */
body.portrait .sc-tab{padding:12px 14px;font-size:19px}
body.portrait .sc-btn{width:52px;height:52px}

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
/* Бейдж версии в подвале — в ряд с меткой времени и версии */
.sc-ver{flex:none;display:flex;align-items:center;gap:9px;border-radius:11px;padding:0 14px;
  font-family:'Inter';font-weight:800;font-size:15px;letter-spacing:.3px;white-space:nowrap;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:#cfcae8}
.sc-ver i{font-style:normal;font-weight:900}
.sc-ver.ok{background:rgba(33,196,90,.14);border-color:rgba(33,196,90,.45);color:#7ee2a2}
.sc-ver.pending{background:rgba(255,176,32,.14);border-color:rgba(255,176,32,.5);color:#ffc964}
.sc-ver.stale{background:#ff3d68;border-color:#ff3d68;color:#fff;cursor:pointer}
.sc-ver.off{color:#8f88bd}
@keyframes sc-shoot{0%{transform:scale(1);opacity:1}100%{transform:scale(9);opacity:0}}
`

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>'
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>'
const ICON_CHEV = '<svg class="sc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

let styled = false
function addStyle() {
  if (styled) return
  styled = true
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
}

/* ── Заставка хозяина — ставится сразу при загрузке модуля, чтобы новая
   страница не мелькнула недорисованной. Встроенной странице она не нужна. */
let curtain = null
let safety = 0
if (!EMBED) {
  addStyle()
  curtain = document.createElement('div')
  curtain.className = 'sc-curtain on'
  curtain.style.transition = 'none'        // первый кадр — сразу закрыто
  curtain.innerHTML = `<img src="${SHARK}" alt=""><div class="sc-say"><span>Играй больше —</span> <b>плати меньше</b></div>`
  const put = () => { document.body.appendChild(curtain); requestAnimationFrame(() => { curtain.style.transition = '' }) }
  if (document.body) put()
  else document.addEventListener('DOMContentLoaded', put, { once: true })
  /* Страховка: страница упала раньше, чем открыла экран (ошибка в её
     скрипте), — заставка не должна стоять на панели вечно. Первое же
     открытие экрана страховку снимает (curtainOut). */
  safety = setTimeout(curtainOut, SAFETY_MS)
}

function curtainIn() {
  curtain.classList.remove('out')
  curtain.classList.add('on')
  return wait(IN_MS)
}
function curtainOut() {
  clearTimeout(safety)
  if (!curtain || !curtain.classList.contains('on')) return Promise.resolve()
  curtain.classList.add('out')
  return wait(OUT_MS).then(() => curtain.classList.remove('on', 'out'))
}

/**
 * Подключить выбор парка и плеер к странице.
 * @param {object} o
 *   id        — 'loyalty' | 'kassa' | 'turbo' (строка из SCREENS)
 *   park      — текущий код парка
 *   parks     — { код: { name } }
 *   parkOrder — порядок парков в списке
 *   cycleMs   — () => длина полного круга анимации страницы, мс
 *   restart   — () => встать на первый кадр круга (экран показали)
 *   pause     — () => заморозить анимацию (пауза или экран скрыт)
 *   resume    — () => продолжить с того же места
 *   ready     — (необязательно) промис «страница готова к показу» сверх
 *               загрузки и шрифтов: у турбо — пришло первое расписание
 *   available — (необязательно) () => можно ли сейчас показать экран;
 *               false — плеер его пропускает (турбо в портрете: заглушка)
 */
export function initScreens(o) {
  if (EMBED) addStyle()
  /* Парк не найден — страница уже закрыла экран плашкой «Парк не найден».
     Плеера и соседних экранов нет, а заставку убираем сразу: до 02.10
     панель с опечаткой в ?park= навсегда оставалась на заставке, и плашку
     с ошибкой никто не видел. */
  if (!o.parks[o.park]) {
    curtainOut()
    return
  }
  const host = EMBED ? safeParent() : null
  if (EMBED && !host) return                 // встроили не в наш плеер — играем сами по себе
  const api = {
    id: o.id,
    cycleMs: o.cycleMs,
    restart: o.restart,
    pause: o.pause,
    resume: o.resume,
    available: o.available || (() => true),
    update: () => {},
  }

  setupParkMenu(o, (code) => (host ? host.setPark(code) : setPark(code)))
  api.update = setupPlayer((action, arg) => (host ? host.act(action, arg) : hostAct(action, arg)))

  if (host) {
    o.pause()                                  // пока не показали — стоим
    pageReady(o.ready).then(() => host.register(api)) // хозяин узнаёт, что экран готов
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
  const tabs = [...slot.querySelector('.sc-tabs').children]
  const ver = setupVerBadge(act)

  /* Состояние приходит от хозяина 5 раз в секунду: { current, playing,
     progress 0..1, off: [экраны, которые сейчас не показать] }.
     ⚠ Разметку кнопки трогаем ТОЛЬКО при смене состояния. Раньше значок
       ❚❚/▶ перерисовывался на каждом тике — нажатие, попавшее на
       перерисовку, браузер терял (элемент под пальцем исчезал между
       «нажал» и «отпустил»), и кнопка срабатывала через раз. */
  let shown = null
  return (st) => {
    if (shown !== st.playing) {
      shown = st.playing
      btn.innerHTML = st.playing ? ICON_PAUSE : ICON_PLAY
      btn.classList.toggle('play', !st.playing)
      btn.setAttribute('aria-label', st.playing ? 'Пауза' : 'Пуск')
    }
    ver(st)
    const off = st.off || []
    tabs.forEach((t) => {
      const on = t.dataset.id === st.current
      if (t.classList.contains('on') !== on) t.classList.toggle('on', on)
      const dim = off.includes(t.dataset.id)
      if (t.classList.contains('off') !== dim) t.classList.toggle('off', dim)
      const w = on ? `${Math.round(st.progress * 1000) / 10}%` : '0'
      const bar = t.querySelector('.sc-bar')
      if (bar.style.width !== w) bar.style.width = w
    })
  }
}

/* ── Бейдж версии в подвале + ⟳ в обход кэша ───────────────────────────── */
function setupVerBadge(act) {
  const svc = document.querySelector('.fineband .svc')
  if (!svc || !BUILD) return () => {}
  const el = document.createElement('span')
  el.className = 'sc-ver'
  el.setAttribute('role', 'status')
  svc.appendChild(el)
  el.addEventListener('click', () => { if (el.classList.contains('stale')) act('fresh') })
  /* ⟳ в подвале: страница сама зовёт location.reload(), а он может взять
     её из кэша. Перехватываем раньше и грузим заново в обход кэша. */
  const rl = document.getElementById('reload')
  if (rl) {
    rl.addEventListener('click', (e) => {
      e.stopImmediatePropagation()
      rl.classList.add('spin')
      act('fresh')
    }, true)
  }
  let shown = ''
  return (st) => {
    const v = st.ver || {}
    const text = {
      check: '<i>…</i> Проверка версии',
      ok: v.auto ? `<i>✓</i> Актуальная · обновилась сама в ${v.auto}` : '<i>✓</i> Актуальная версия',
      pending: st.playing ? '<i>↻</i> Вышла новая — обновится на смене экрана' : '<i>↻</i> Вышла новая — обновится после пуска',
      stale: '<i>⚠</i> Устарела — нажмите, чтобы обновить',
      off: 'Нет связи — версия не проверена',
    }[v.state] || ''
    const key = v.state + text
    if (key === shown) return
    shown = key
    el.className = `sc-ver ${{ check: '', ok: 'ok', pending: 'pending', stale: 'stale', off: 'off' }[v.state] || ''}`
    el.innerHTML = text
    el.hidden = !text
  }
}

/* ── Хозяин ────────────────────────────────────────────────────────────── */
let H = null

function becomeHost(o, selfApi) {
  H = {
    selfId: o.id,
    self: selfApi,
    kids: {},             // остальные экраны: { id: { frame, api, ready, mark } }
    current: o.id,
    playing: Q.get('play') !== '0',
    dwell: 0,
    elapsed: 0,           // сколько текущий экран уже отыграл до последней паузы
    startedAt: 0,
    timer: 0,
    busy: true,           // пока открывается первый раз
    holding: false,       // экран стоит на первом кадре после перехода
    update: '',           // номер новой сборки, если вышла
    daily: false,         // пора суточного перезапуска
    ver: { state: BUILD ? 'check' : 'none', auto: '' },   // для бейджа в подвале
  }
  window.boomScreens = {
    register(api) {
      const kid = H.kids[api.id]
      if (!kid) return
      kid.api = api
      if (H.current !== api.id) api.pause()
      /* Показанная сейчас страница перезагрузилась сама (страховка
         загрузки в её <head>) и встала на паузу, как любая встроенная, —
         запускаем её круг заново, иначе стояла бы замёрзшей до смены. */
      else if (!H.busy) { present(api); afterHold(api) }
      kid.mark()
      broadcast()
    },
    act: hostAct,
    setPark,
  }

  /* Остальные экраны — каждый в свой скрытый слой, тот же парк */
  for (const s of SCREENS) {
    if (s.id === o.id) continue
    const u = new URL(import.meta.env.BASE_URL + s.path, location.href)
    for (const k of ['park', 'tv', 'demo']) if (Q.get(k)) u.searchParams.set(k, Q.get(k))
    if (!u.searchParams.get('park')) u.searchParams.set('park', o.park)
    u.searchParams.set('embed', '1')
    if (BUILD) u.searchParams.set('v', BUILD)   // свой адрес у каждой сборки — браузер не подсунет старую из кэша
    const frame = document.createElement('iframe')
    frame.className = 'sc-frame'
    frame.title = s.name
    frame.src = u.toString()
    const kid = { frame, api: null, mark: null, ready: null }
    kid.ready = new Promise((r) => { kid.mark = r })
    H.kids[s.id] = kid
    document.body.appendChild(frame)
  }

  /* Первое открытие: ждём, пока готовы все страницы (остальные — не дольше
     READY_MS, чтобы панель не висела на заставке), и открываем экран с
     начала. Свой экран сейчас не показать (турбо в портрете) — начинаем со
     следующего. */
  selfApi.pause()
  const kidsReady = Promise.all(Object.values(H.kids).map((k) => k.ready))
  Promise.all([pageReady(o.ready), Promise.race([kidsReady, wait(READY_MS)]), wait(HOLD_MS)]).then(() => {
    const first = canShow(H.selfId) ? H.selfId : nextId()
    showFrame(first)
    H.current = first
    present(apiOf(first))
    broadcast()
    return curtainOut()
  }).then(() => { H.busy = false; afterHold(apiOf(H.current)) })

  setInterval(broadcast, 200)
  broadcast()
  if (BUILD) {
    /* Пришли автообновлением: в адресе метка ?r=…, и эту сборку мы и ждали */
    let tried = ''
    try { tried = sessionStorage.getItem('boom-upd') || '' } catch {}
    if (Q.get('r') && tried === BUILD) H.ver.auto = mskHm()
    setTimeout(checkBuild, 4000)
    setInterval(checkBuild, CHECK_MS)
  }
  if (TV) setInterval(checkDaily, 30000)
}

function mskHm() {
  try { return new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

/* ── Суточный перезапуск ───────────────────────────────────────────────── */
/* «Рабочие сутки» панели по Москве: с DAY_FROM до DAY_FROM. Сменились —
   пора перезапускаться. */
const [DAY_H, DAY_M] = DAY_FROM.split(':').map(Number)
function workDay() {
  try {
    const t = new Date(Date.now() - (DAY_H * 60 + DAY_M) * 60000)
    return t.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })
  } catch { return '' }
}
const BORN_DAY = workDay()
function checkDaily() {
  if (H.daily || !BORN_DAY || workDay() === BORN_DAY) return
  H.daily = true
  /* Играет — перезагрузимся на ближайшей смене экрана, под заставкой.
     На паузе смены не будет: перезагружаемся сразу. */
  if (!H.playing && !H.busy) {
    clearTimeout(H.timer)
    H.busy = true
    curtainIn().then(reloadFresh)
  }
}

/* ── Автообновление ────────────────────────────────────────────────────── */
function checkBuild() {
  if (H.update) return
  fetch(`${import.meta.env.BASE_URL}media/build.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !j.build) { H.ver.state = 'off'; broadcast(); return }
      if (String(j.build) === BUILD) { H.ver.state = 'ok'; broadcast(); return }
      /* Уже перезагружались ради этой сборки, а пришла всё равно старая
         (публикация ещё раскатывается) — не крутимся в перезагрузках,
         обновимся в 05:00 или при следующей сборке. */
      let tried = ''
      try { tried = sessionStorage.getItem('boom-upd') || '' } catch {}
      if (tried === String(j.build)) { H.ver.state = 'stale'; broadcast(); return }
      H.update = String(j.build)
      H.ver.state = 'pending'
      broadcast()
    })
    .catch(() => {                     // нет сети — проверим через минуту
      if (H.ver.state !== 'ok') { H.ver.state = 'off'; broadcast() }
    })
}
/** Перезагрузка в обход кэша — вызывается, когда заставка уже закрыла экран. */
function reloadFresh() {
  try { if (H && H.update) sessionStorage.setItem('boom-upd', H.update) } catch {}
  const u = new URL(location.href)
  u.searchParams.set('r', Date.now())
  u.searchParams.delete('embed')
  u.searchParams.delete('play')
  location.replace(u.toString())
}

function apiOf(id) {
  if (id === H.selfId) return H.self
  const kid = H.kids[id]
  return kid ? kid.api : null
}

/* Можно ли сейчас показать экран: страница готова и сама не против
   (у турбо в портрете вместо витрины заглушка). Встроенная страница могла
   уйти на перезагрузку — тогда её ответ недоступен, считаем «нельзя». */
function canShow(id) {
  const a = apiOf(id)
  if (!a) return false
  if (typeof a.available !== 'function') return true   // страница не говорит — значит можно
  try { return a.available() !== false } catch { return false }
}

function showFrame(id) {
  for (const [k, kid] of Object.entries(H.kids)) kid.frame.classList.toggle('on', k === id)
}

/* Экран показан: встаёт на первый кадр и стоит (FIRST_MS после того,
   как ушла заставка), потом играет. Полоса времени в это время пустая. */
function present(api) {
  clearTimeout(H.timer)
  api.restart()
  api.pause()
  H.holding = true
  H.dwell = 0
  H.elapsed = 0
}
function afterHold(api) {
  clearTimeout(H.timer)
  H.timer = setTimeout(() => {
    H.holding = false
    if (H.playing) api.resume()
    startDwell()
  }, FIRST_MS)
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

/* Следующий по кругу экран, который можно показать. Других нет — тот же
   экран: switchTo проиграет его круг заново (иначе «Зарядка», которая в
   плеере играет один круг, так и стояла бы между ходами). */
function nextId() {
  const i = SCREENS.findIndex((s) => s.id === H.current)
  for (let k = 1; k <= SCREENS.length; k++) {
    const id = SCREENS[(i + k) % SCREENS.length].id
    if (canShow(id)) return id
  }
  return H.current
}

async function switchTo(id) {
  if (H.busy) return
  H.busy = true
  clearTimeout(H.timer)
  await curtainIn()
  if (H.update || H.daily) { reloadFresh(); return }   // новая сборка или 05:00 — грузимся под заставкой
  /* Встроенная ещё грузится — держим заставку, пока не будет готова */
  if (!apiOf(id) && H.kids[id]) await Promise.race([H.kids[id].ready, wait(15000)])
  const target = apiOf(id)
  if (!target) {                       // так и не загрузилась — остаёмся где были
    await curtainOut()
    H.busy = false
    startDwell()
    return
  }
  const prev = apiOf(H.current)
  if (prev && prev !== target) prev.pause()
  showFrame(id)
  H.current = id
  H.playing = true                     // переход всегда играет
  await wait(HOLD_MS - 300)
  present(target)
  broadcast()
  await curtainOut()
  H.busy = false
  afterHold(target)
}

function hostAct(action, arg) {
  if (!H) return
  if (action === 'fresh') {            // ⟳ или «Устарела — нажмите»: под заставкой, в обход кэша
    clearTimeout(H.timer)
    H.busy = true
    curtainIn().then(reloadFresh)
    return
  }
  if (action === 'toggle' && H.holding) {
    H.playing = !H.playing             // экран ещё стоит на первом кадре — запомним, играть ли потом
  } else if (action === 'toggle') {
    const a = apiOf(H.current)
    if (H.playing) {                   // пауза: замираем вместе с полосой
      H.playing = false
      clearTimeout(H.timer)
      H.elapsed += performance.now() - H.startedAt
      if (a) a.pause()
      if (H.daily && !H.busy) {        // 05:00 уже наступило — на паузе не ждём
        H.busy = true
        curtainIn().then(reloadFresh)
        return
      }
    } else {                           // пуск: с того же места
      H.playing = true
      H.startedAt = performance.now()
      if (a) a.resume()
      if (!H.busy) H.timer = setTimeout(() => switchTo(nextId()), Math.max(0, H.dwell - H.elapsed))
    }
  } else if (action === 'go') {
    /* Кнопка экрана: погашенную (экран сейчас не показать) не слушаем;
       ещё не загрузившийся — покажем, как только загрузится */
    if (arg && arg !== H.current && (canShow(arg) || !apiOf(arg))) switchTo(arg)
  }
  broadcast()   // кнопка меняется сразу, не ждёт следующего тика
}

function broadcast() {
  if (!H) return
  const run = H.elapsed + (H.playing && H.startedAt ? performance.now() - H.startedAt : 0)
  const off = SCREENS.filter((s) => apiOf(s.id) && !canShow(s.id)).map((s) => s.id)
  const st = { current: H.current, playing: H.playing, progress: H.dwell ? Math.min(1, run / H.dwell) : 0, ver: H.ver, off }
  H.self.update(st)
  for (const kid of Object.values(H.kids)) {
    if (kid.api) { try { kid.api.update(st) } catch { kid.api = null } }
  }
}
