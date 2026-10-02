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
 *     Кнопка ⟳ в подвале тоже грузит страницу в обход кэша.
 *
 *  6. Служебный блок в подвале — ОДИН на экран, одинаковый у всех трёх
 *     (до 02.10 их было два: метка с временем и версией + бейдж версии,
 *     они дублировали друг друга, и было непонятно, куда смотреть):
 *       [состояние] 02.10 08:35 МСК [v7.8] ⟳
 *     Состояние — плашка, закрашенная своим цветом: зелёная «Всё в
 *     порядке», жёлтая «Обновится сам» / «Ждём расписание» (само пройдёт),
 *     красная «Нужно обновить» /
 *     «Расписание устарело» / «Турбо пропущен» / «Экран не загрузился»,
 *     серая «Нет связи». Это итог ВСЕЙ ПАНЕЛИ (трёх экранов и версии), а не
 *     одной страницы: что бы ни было на экране, плашка одна и та же.
 *     Время — когда загружена панель. Версия — бейджем, у каждого экрана
 *     своя. ВСЕ времена — по Москве, «МСК».
 *     Нажатие на блок на любом экране — одно окно «Состояние панели»: итог и
 *     что делать обычными словами, по строке на каждый из трёх экранов,
 *     общие сведения (парк, проверка версии, загрузка, перезапуск, плеер)
 *     и расшифровка цветов. Пока окно открыто, плеер стоит; закрывается
 *     само через минуту.
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
const INFO_MS = 60000                // окно «Состояние панели» закрывается само

/* Когда и почему загружена страница — для окна «Состояние панели».
   Причину кладёт сам плеер перед перезагрузкой (reloadFresh, setPark);
   встроенные экраны грузятся вместе с хозяином, им причина не нужна. */
const LOADED_AT = Date.now()
let RELOAD_WHY = ''
if (!EMBED) {
  try { RELOAD_WHY = sessionStorage.getItem('boom-why') || ''; sessionStorage.removeItem('boom-why') } catch {}
  if (!RELOAD_WHY && Q.get('r')) RELOAD_WHY = 'fresh'
}
const WHY = {
  update: 'сам: вышла новая версия',
  daily: 'сам: ежедневный перезапуск в 05:00 МСК',
  manual: 'вручную: кнопка «Обновить»',
  park: 'после смены парка',
  fresh: 'перезагрузка в обход кэша браузера',
  '': 'при включении панели или открытии страницы',
}

/** Время по Москве с подписью: «02.10 08:35 МСК» (или «08:35 МСК»).
    Пояс панели в расчёт не входит: моноблок может стоять с чужим. */
export function msk(ms, withDate = true) {
  if (!ms) return '—'
  const o = { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }
  if (withDate) { o.day = '2-digit'; o.month = '2-digit' }
  try { return `${new Date(ms).toLocaleString('ru-RU', o).replace(',', '')} МСК` } catch { return '—' }
}

/** true — страница открыта внутри плеера другого экрана (не хозяин). */
export function isEmbedded() {
  return EMBED
}

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
/* Служебный блок в подвале: [состояние] время МСК [версия] ⟳. Состояние —
   плашка, закрашенная цветом итога: ok зелёный, warn жёлтый, bad красный,
   off серый. Версия — бейдж. Точка страницы не нужна: цвет несёт плашка. */
.stamp.sc-st{gap:10px;padding-left:5px}
.stamp.sc-st .dot{display:none}
.stamp.sc-st .when{color:#cfcae8}
.sc-chip{display:inline-flex;align-items:center;padding:3px 10px;border-radius:8px;font-weight:800;white-space:nowrap;line-height:1.3}
.sc-chip.ok{background:#3fe06c;color:#06340f}
.sc-chip.warn{background:#ffb020;color:#2b1a00}
.sc-chip.bad{background:#ff3d68;color:#fff}
.sc-chip.off{background:#8f88bd;color:#0d0a2e}
.sc-vb{display:inline-flex;align-items:center;padding:2px 8px;border-radius:7px;white-space:nowrap;line-height:1.3;
  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#e9e6ff;font-weight:800}
.stamp.sc-st .ver.sc-vb{color:#e9e6ff;font-size:14px}

/* Окно «Состояние панели» — поверх всего, в единицах окна (не канвы):
   читается и на панели, и на ноутбуке */
.sc-info{position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;padding:3vmin;
  background:rgba(6,4,26,.6);font-family:'Inter',system-ui,sans-serif;font-size:clamp(13px,1.6vmin,20px);color:#fff}
.sc-info .box{position:relative;width:min(74em,94vw);max-height:94vh;overflow:auto;background:#16143f;
  border:1px solid rgba(255,255,255,.18);border-radius:1.1em;padding:1.4em 1.6em 1.2em;box-shadow:0 2em 4em rgba(0,0,0,.6);line-height:1.45}
.sc-info .x{position:absolute;right:.7em;top:.6em;width:2em;height:2em;border:none;border-radius:.6em;cursor:pointer;
  background:rgba(255,255,255,.08);color:#fff;font-size:1em;font-weight:800}
.sc-info .cap{font-size:.8em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9b94d0}
.sc-info h2{display:flex;align-items:center;gap:.5em;margin:.25em 2.2em .35em 0;font-family:'Unbounded',sans-serif;font-weight:700;font-size:1.45em;line-height:1.2}
.sc-info .lead{margin:0 0 1em;font-size:1.05em;color:#e9e6ff}
.sc-info dl{display:grid;grid-template-columns:max-content 1fr;gap:.45em 1.1em;margin:.55em 0 0;padding:1em 1.1em;
  background:rgba(255,255,255,.05);border-radius:.8em}
.sc-info dt{color:#9b94d0;font-weight:700;white-space:nowrap}
.sc-info dd{margin:0;font-weight:600}
/* Две колонки на широкой панели: экраны слева, сведения о панели справа */
.sc-info .cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:1.2em;margin:0 0 1.1em;align-items:start}
.sc-info .scr{display:grid;gap:.55em}
.sc-info .cols h3,.sc-info .scr h3{margin:0;font-size:.8em;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9b94d0}
.sc-info .row{padding:.7em 1em;border-radius:.8em;background:rgba(255,255,255,.05);border:1px solid transparent}
.sc-info .row.now{border-color:rgba(198,245,46,.55)}
.sc-info .row .hd{display:flex;align-items:center;gap:.6em;flex-wrap:wrap}
.sc-info .row .hd b{font-size:1.05em}
.sc-info .row .hd em{font-style:normal;font-size:.82em;font-weight:800;color:#c6f52e}
.sc-info .row .ln{margin-top:.3em;color:#cfcae8;font-size:.95em}
.sc-info h2 .sc-chip{font-family:'Inter',sans-serif;font-size:.62em}
.sc-info h2 .sc-chip:only-child{font-size:.8em;padding:.25em .6em}
.sc-info .legend{display:grid;grid-template-columns:1fr 1fr;gap:.35em 1.2em;margin:0 0 1.1em;font-size:.88em;color:#cfcae8}
.sc-info .legend span{display:flex;align-items:center;gap:.5em}
.sc-info .legend i{flex:none;width:.65em;height:.65em;border-radius:50%}
.sc-info .acts{display:flex;align-items:center;gap:.8em;flex-wrap:wrap}
.sc-info .acts button{border:none;border-radius:.7em;padding:.7em 1.2em;cursor:pointer;font-family:inherit;font-size:1em;font-weight:800}
.sc-info .acts .go{background:#c6f52e;color:#0d0a2e}
.sc-info .acts .no{background:rgba(255,255,255,.1);color:#fff}
.sc-info .acts small{margin-left:auto;color:#8f88bd;font-size:.82em}
.sc-info .c-ok{background:#3fe06c}.sc-info .c-warn{background:#ffb020}.sc-info .c-bad{background:#ff3d68}.sc-info .c-off{background:#8f88bd}
@media (max-width:1100px),(orientation:portrait){.sc-info .cols{grid-template-columns:1fr}}
@media (max-width:640px){.sc-info dl{grid-template-columns:1fr}.sc-info dt{margin-top:.4em}.sc-info .legend{grid-template-columns:1fr}}
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
 *   version   — версия экрана для служебного блока («v3.4»)
 *   status    — (необязательно) () => состояние данных экрана для блока и
 *               окна «Состояние панели». Только у турбо: { kind: 'schedule',
 *               fresh, at, fail: { at, why } | null, retryAt, everyMin,
 *               recent — запрос не прошёл, но на экране ещё свежие данные }
 *   offWhy    — (необязательно) () => почему экран сейчас не показать:
 *               { text, problem } — problem=true, если это надо чинить
 *               (турбо: парка нет в таблице турбо), false — так задумано
 *               (турбо на вертикальной панели)
 */
export function initScreens(o) {
  if (EMBED) addStyle()
  const host = EMBED ? safeParent() : null
  /* Без плеера: парк не найден (экран уже закрыт плашкой «Парк не найден»)
     или страницу встроили не в наш плеер. Служебный блок и окно
     «Состояние панели» работают и так — сами по себе. */
  const alone = !o.parks[o.park] || (EMBED && !host)
  const page = {
    id: o.id,
    version: o.version || '',
    parkName: (o.parks[o.park] || {}).name || '',
    status: o.status || null,
    available: o.available || (() => true),
    offWhy: o.offWhy || null,
  }
  const act = (action, arg) => {
    if (alone) return aloneAct(page, action)
    return host ? host.act(action, arg) : hostAct(action, arg)
  }
  const service = setupService(page, act)

  if (alone) {
    /* Парк не найден — плеера и соседних экранов нет, а заставку убираем
       сразу: до 02.10 панель с опечаткой в ?park= навсегда оставалась на
       заставке, и плашку с ошибкой никто не видел. */
    curtainOut()
    const tick = () => service({ panel: aloneModel(page).panel, loadedAt: LOADED_AT })
    tick()
    setInterval(tick, 1000)
    return
  }
  const api = {
    id: o.id,
    version: page.version,
    parkName: page.parkName,
    status: page.status,
    offWhy: page.offWhy,
    cycleMs: o.cycleMs,
    restart: o.restart,
    pause: o.pause,
    resume: o.resume,
    available: o.available || (() => true),
    update: () => {},
  }

  setupParkMenu(o, (code) => (host ? host.setPark(code) : setPark(code)))
  const player = setupPlayer(act)
  api.update = (st) => { player(st); service(st) }

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
  try { sessionStorage.setItem('boom-why', 'park') } catch {}
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

/* ── Состояние панели: по экрану и итог ──────────────────────────────────
   Один расчёт на блок в подвале и окно «Состояние панели». Уровни:
   ok — всё в порядке, warn — само пройдёт, bad — нужна помощь, off — нет
   связи / ещё проверяем. Итог панели — худший из версии и трёх экранов. */
const RANK = { ok: 0, off: 1, warn: 2, bad: 3 }
const LOAD_FAIL_MS = 20000           // экран так и не загрузился — после стольких с от старта панели

function safeStatus(page) {
  try { return page && page.status ? page.status() : null } catch { return null }
}

/** Состояние одного экрана по его api (или странице без плеера).
    { lvl, word, line } — слово для плашки и строка для окна. */
function rowOf(a) {
  const s = safeStatus(a)
  let avail = true
  try { avail = typeof a.available !== 'function' || a.available() !== false } catch { avail = false }
  if (!avail) {
    let why = null
    try { why = a.offWhy ? a.offWhy() : null } catch {}
    if (why && why.problem) return { lvl: 'bad', word: 'Турбо пропущен', line: why.text }
    return { lvl: 'ok', word: 'Пропускается', line: (why && why.text) || 'сейчас не показывается — плеер его пропускает' }
  }
  if (s && s.kind === 'schedule') {
    if (s.fresh) return { lvl: 'ok', word: 'Всё в порядке', line: `расписание получено ${msk(s.at)}, обновляется само каждые ${s.everyMin || 5} мин` }
    if (s.recent) {
      /* Запрос не прошёл, но расписанию на экране меньше 15 минут — гости
         видят верные часы. Само пройдёт: жёлтое, не красное. */
      return { lvl: 'warn', word: 'Ждём расписание', line: `на экране расписание, полученное ${msk(s.at)}, — оно ещё свежее; последний запрос${s.fail ? ` в ${msk(s.fail.at, false)} не прошёл: ${s.fail.why}` : ' не прошёл'}${s.retryAt ? `; повтор в ${msk(s.retryAt, false)}` : ''}` }
    }
    const tail = `${s.fail ? `; источник не отвечает с ${msk(s.fail.at)}: ${s.fail.why}` : '; источник не отвечает'}${s.retryAt ? `; следующая попытка в ${msk(s.retryAt, false)}` : ''}`
    return s.at
      ? { lvl: 'bad', word: 'Расписание устарело', line: `на экране расписание, полученное ${msk(s.at)}${tail}` }
      : { lvl: 'bad', word: 'Нет расписания', line: `расписания нет, экран показывает общий вид без часов${tail}` }
  }
  return { lvl: 'ok', word: 'Всё в порядке', line: 'готов: тексты и цифры входят в версию, из сети ничего не берёт' }
}

/** Версия панели: [уровень, слово] */
function verLevel(v) {
  switch (v && v.state) {
    case 'stale': return ['bad', 'Нужно обновить']
    case 'pending': return ['warn', 'Обновится сам']
    case 'off': return ['off', 'Нет связи']
    case 'check': return ['off', 'Проверка…']
    default: return ['ok', 'Всё в порядке']
  }
}

/** Итог: худшее из версии и экранов. При равенстве — версия, потом экраны
    по порядку круга. */
function worstOf(ver, rows) {
  const [vl, vw] = verLevel(ver)
  let w = { lvl: vl, word: vw, from: null }
  for (const r of rows) if (RANK[r.lvl] > RANK[w.lvl]) w = { lvl: r.lvl, word: r.word, from: r }
  return w
}

/* Модель для хозяина: все три экрана */
function hostModel() {
  const rows = SCREENS.map((sc) => {
    const a = apiOf(sc.id)
    const base = { id: sc.id, name: sc.name, now: sc.id === H.current }
    if (!a) {
      return Date.now() - LOADED_AT > LOAD_FAIL_MS
        ? { ...base, version: '', lvl: 'bad', word: 'Экран не загрузился', line: 'не загрузился — плеер его пропускает, остальные экраны работают' }
        : { ...base, version: '', lvl: 'off', word: 'Загружается…', line: 'загружается…' }
    }
    return { ...base, version: a.version || '', ...rowOf(a) }
  })
  const self = H.self
  return {
    rows,
    panel: worstOf(H.ver, rows),
    ver: H.ver,
    park: self.parkName,
    playing: H.playing,
    held: !!(info && info.paused),
    current: screenName(H.current),
    next: screenName(nextId()),
    alone: false,
  }
}

/* Модель без плеера (парк не найден): только эта страница */
function aloneModel(page) {
  const rows = [{ id: page.id, name: screenName(page.id), now: true, version: page.version, ...rowOf(page) }]
  const ver = { state: 'none' }
  return { rows, panel: worstOf(ver, rows), ver, park: page.parkName, playing: true, held: false, current: '', next: '', alone: true }
}

/* ── Служебный блок в подвале + ⟳ в обход кэша ──────────────────────────
   Берёт готовую метку страницы (.stamp: точка, #stamp-when, #stamp-ver,
   ⟳) и делает из неё единый блок «[состояние] время МСК [версия] ⟳».
   Состояние — итог всей панели (st.panel от хозяина), время — загрузка
   панели, версия — этого экрана. Нажатие — окно «Состояние панели». */
const LEVELS = ['lvl-ok', 'lvl-warn', 'lvl-bad', 'lvl-off']

function setupService(page, act) {
  const stamp = document.getElementById('stamp')
  if (!stamp) return () => {}
  stamp.classList.add('sc-st')
  stamp.setAttribute('title', 'Состояние панели — нажмите, чтобы узнать подробности')
  const chip = document.createElement('b')
  chip.className = 'sc-chip sc-word'
  const dot = stamp.querySelector('.dot')
  if (dot) dot.after(chip)
  else stamp.prepend(chip)
  const when = document.getElementById('stamp-when')
  const ver = document.getElementById('stamp-ver')
  if (ver) ver.classList.add('sc-vb')
  stamp.addEventListener('click', (e) => {
    if (e.target.closest('#reload')) return
    act('info')
  })
  /* ⟳: страница сама зовёт location.reload(), а он может взять её из кэша.
     Перехватываем раньше и грузим заново в обход кэша. */
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
    const p = st.panel || { lvl: 'off', word: 'Проверка…' }
    const t = msk(st.loadedAt || LOADED_AT)
    const key = `${p.lvl}|${p.word}|${t}|${page.version}`
    if (key === shown) return
    shown = key
    LEVELS.forEach((c) => stamp.classList.toggle(c, c === `lvl-${p.lvl}`))
    chip.className = `sc-chip sc-word ${p.lvl}`
    chip.textContent = p.word
    if (when) when.textContent = t
    if (ver && page.version) ver.textContent = page.version
  }
}

/* ── Окно «Состояние панели» ──────────────────────────────────────────────
   Одно на всю панель, с какого экрана ни нажми: итог и что делать обычными
   словами, строка на каждый из трёх экранов, общие сведения и расшифровка
   цветов. Открывается у хозяина — поверх всех экранов; пока открыто, плеер
   стоит. Закрывается само через минуту: на панели его может быть некому
   закрыть. */
let info = null

function screenName(id) {
  const s = SCREENS.find((x) => x.id === id)
  return s ? s.name : ''
}

/** Заголовок и что делать — по худшему из версии и экранов */
function headOf(m) {
  const w = m.panel
  const r = w.from
  if (r) {
    if (r.word === 'Экран не загрузился') {
      return [`«${r.name}» не загрузился`, 'Плеер его пропускает, остальные экраны работают. Нажмите «Обновить сейчас». Не помогло — проверьте интернет на панели.']
    }
    if (r.word === 'Турбо пропущен') {
      return ['«Турбо» в этом парке не показывается', `Источник расписания турбо не знает парк «${m.park}» и отдаёт данные другого парка. Чтобы гости не увидели чужое расписание, плеер пропускает «Турбо». Нужно завести парк в таблице турбо — после этого экран начнёт показываться сам.`]
    }
    if (r.word === 'Ждём расписание') {
      return ['Источник расписания отвечает медленно', 'Последний запрос расписания турбо не прошёл, но на экране расписание, полученное совсем недавно, — гости видят верные часы. Панель сама повторит запрос, ничего делать не нужно. Если плашка станет красной — источник не отвечает дольше 15 минут.']
    }
    if (r.word === 'Расписание устарело') {
      return ['Расписание турбо не обновляется', 'Источник расписания не отвечает дольше 15 минут, и на экране «Турбо» — последнее полученное расписание; с тех пор оно могло измениться. Панель сама повторяет попытки. Если так дольше получаса — сообщите тому, кто ведёт таблицу турбо.']
    }
    if (r.word === 'Нет расписания') {
      return ['Нет расписания турбо', 'Источник расписания не отвечает, а сохранённого расписания этого парка на панели нет — «Турбо» показывает общий вид без часов. Панель сама повторяет попытки. Если так дольше получаса — сообщите тому, кто ведёт таблицу турбо.']
    }
  }
  switch (m.ver.state) {
    case 'stale':
      return ['Версия панели устарела', 'Вышла новая версия, но браузер панели отдаёт старую. Нажмите «Обновить сейчас». Не помогло — подождите 10 минут и нажмите ещё раз.']
    case 'pending':
      return ['Вышла новая версия', m.playing || m.held
        ? 'Панель обновится сама на ближайшей смене экрана — ничего делать не нужно.'
        : 'Панель обновится сама, как только плеер снова запустят (▶ в шапке).']
    case 'off':
      return ['Нет связи с сайтом панелей', 'Экраны работают и показывают то, что уже загрузили, но панель не может проверить, последняя ли у неё версия. Проверьте интернет на панели.']
    case 'check':
      return ['Проверяем версию…', 'Панель только что загрузилась и сверяет версию с сайтом — это несколько секунд.']
    default:
      return ['Всё в порядке', m.alone
        ? 'Экран работает. Ничего делать не нужно.'
        : `Все экраны работают, версия последняя. Панель сама проверяет обновления раз в минуту${TV ? ' и перезагружается каждый день в 05:00 МСК' : ''}. Ничего делать не нужно.`]
  }
}

function verLine(v) {
  const latest = v.latest ? `сборка от ${msk(Number(v.latest))}` : 'новая сборка'
  switch (v.state) {
    case 'ok': return `${msk(v.checkedAt)} — совпадает с сайтом; проверка раз в минуту`
    case 'pending': return `${msk(v.checkedAt)} — на сайте ${latest}`
    case 'stale': return `${msk(v.checkedAt)} — на сайте ${latest}, а браузер панели отдал старую`
    case 'off': return `${msk(v.checkedAt)} — сайт панелей не ответил; повтор через минуту`
    case 'check': return 'идёт…'
    default: return 'не проводится'
  }
}

function infoHtml(m, closeAt) {
  const [title, lead] = headOf(m)
  const rows = m.rows.map((r) => `
      <div class="row${r.now ? ' now' : ''}">
        <div class="hd"><b>«${esc(r.name)}»</b>${r.version ? `<span class="sc-vb">${esc(r.version)}</span>` : ''}<span class="sc-chip ${r.lvl}">${esc(r.word)}</span>${r.now && !m.alone ? '<em>сейчас на экране</em>' : ''}</div>
        <div class="ln">${esc(r.line)}</div>
      </div>`).join('')
  const facts = [['Парк', m.park || '—']]
  if (BUILD && Number(BUILD)) facts.push(['Сборка', msk(Number(BUILD))])
  if (!m.alone) facts.push(['Проверка версии', verLine(m.ver)])
  facts.push(['Панель загружена', `${msk(LOADED_AT)} — ${WHY[RELOAD_WHY] || WHY['']}`])
  facts.push(['Перезапуск', TV ? 'каждый день в 05:00 МСК, сам' : 'выключен — в адресе панели нет &tv=1 (так бывает, когда экран открыт на компьютере)'])
  if (!m.alone) {
    const next = m.next && m.next !== m.current ? `дальше «${m.next}»` : 'другие экраны сейчас не показываются'
    facts.push(['Плеер', `на экране «${m.current}», ${next}; ${m.held ? 'стоит, пока открыто это окно' : m.playing ? 'играет' : 'на паузе (▶ в шапке — запустить)'}`])
  }
  const left = Math.max(0, Math.ceil((closeAt - Date.now()) / 1000))
  return `<div class="box" role="dialog" aria-modal="true" aria-label="Состояние панели">
    <button class="x" data-info="close" aria-label="Закрыть">✕</button>
    <div class="cap">Состояние панели</div>
    <h2><span class="sc-chip ${m.panel.lvl}">${esc(m.panel.word)}</span>${title !== m.panel.word ? esc(title) : ''}</h2>
    <p class="lead">${esc(lead)}</p>
    <div class="cols">
      <div class="scr"><h3>${m.alone ? 'Экран' : 'Экраны панели'}</h3>${rows}</div>
      <div><h3>Панель</h3><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    </div>
    <div class="legend">
      <span><b class="sc-chip ok">Зелёный</b>всё в порядке, ничего делать не нужно</span>
      <span><b class="sc-chip warn">Жёлтый</b>временная заминка или новая версия — панель справится сама</span>
      <span><b class="sc-chip bad">Красный</b>нужна помощь — что делать, написано выше</span>
      <span><b class="sc-chip off">Серый</b>нет связи с сайтом — проверьте интернет</span>
    </div>
    <div class="acts">
      <button class="go" data-info="fresh">Обновить сейчас</button>
      <button class="no" data-info="close">Закрыть</button>
      <small>Все времена — московские (МСК). Окно закроется само через ${left} с</small>
    </div>
  </div>`
}

/** Открыть окно. model() — свежее состояние на каждый кадр (раз в секунду). */
function openInfo(model, onFresh) {
  if (info) return
  const el = document.createElement('div')
  el.className = 'sc-info'
  const closeAt = Date.now() + INFO_MS
  info = { el, timer: 0, paused: false }
  /* Пока окно открыто, экран не сменится под читающим */
  if (H && H.playing && !H.busy) { hostAct('toggle'); info.paused = true }
  const paint = () => { el.innerHTML = infoHtml(model(), closeAt) }
  paint()
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-info]')
    if (b && b.dataset.info === 'fresh') { closeInfo(); onFresh(); return }
    if ((b && b.dataset.info === 'close') || e.target === el) closeInfo()
  })
  document.body.appendChild(el)
  info.timer = setInterval(() => (Date.now() >= closeAt ? closeInfo() : paint()), 1000)
}
function closeInfo() {
  if (!info) return
  clearInterval(info.timer)
  info.el.remove()
  const resume = info.paused
  info = null
  if (resume && H && !H.playing) hostAct('toggle')
}

/* Без плеера (парк не найден): окно и ⟳ — у самой страницы */
function aloneAct(page, action) {
  if (action === 'info') openInfo(() => aloneModel(page), () => reloadFresh('manual'))
  else if (action === 'fresh') reloadFresh('manual')
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
    ver: { state: BUILD ? 'check' : 'none', checkedAt: 0, latest: '' },   // для блока в подвале и окна
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
    setTimeout(checkBuild, 4000)
    setInterval(checkBuild, CHECK_MS)
  }
  if (TV) setInterval(checkDaily, 30000)
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
    curtainIn().then(() => reloadFresh('daily'))
  }
}

/* ── Автообновление ────────────────────────────────────────────────────── */
function checkBuild() {
  if (H.update) return
  fetch(`${import.meta.env.BASE_URL}media/build.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      H.ver.checkedAt = Date.now()
      if (!j || !j.build) { H.ver.state = 'off'; broadcast(); return }
      if (String(j.build) === BUILD) { H.ver.state = 'ok'; broadcast(); return }
      H.ver.latest = String(j.build)
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
      H.ver.checkedAt = Date.now()
      if (H.ver.state !== 'ok') { H.ver.state = 'off'; broadcast() }
    })
}
/** Перезагрузка в обход кэша — вызывается, когда заставка уже закрыла экран.
    why — причина для окна «Состояние панели» после загрузки (WHY). */
function reloadFresh(why) {
  try { if (H && H.update) sessionStorage.setItem('boom-upd', H.update) } catch {}
  try { sessionStorage.setItem('boom-why', why || 'fresh') } catch {}
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
  if (H.update || H.daily) { reloadFresh(H.update ? 'update' : 'daily'); return }   // новая сборка или 05:00 — грузимся под заставкой
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
  if (action === 'fresh') {            // ⟳ или «Обновить сейчас»: под заставкой, в обход кэша
    closeInfo()
    clearTimeout(H.timer)
    H.busy = true
    curtainIn().then(() => reloadFresh('manual'))
    return
  }
  if (action === 'info') {             // нажали на служебный блок — окно «Состояние панели»
    openInfo(hostModel, () => hostAct('fresh'))
    broadcast()
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
        curtainIn().then(() => reloadFresh('daily'))
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
  const m = hostModel()
  const st = {
    current: H.current, playing: H.playing, progress: H.dwell ? Math.min(1, run / H.dwell) : 0, ver: H.ver, off,
    panel: { lvl: m.panel.lvl, word: m.panel.word },   // итог панели — для блока в подвале на всех экранах
    loadedAt: LOADED_AT,
  }
  H.self.update(st)
  for (const kid of Object.values(H.kids)) {
    if (kid.api) { try { kid.api.update(st) } catch { kid.api = null } }
  }
}
