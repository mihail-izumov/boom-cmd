/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /media/turbo/ — логика страницы ТУРБО для ТВ-панелей у кассы (DRV-10)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Отдельный Vite-вход. Ни одного импорта из src/ — страница намеренно не
 *  делит код с приложением «Мастерплан»: у неё другой жизненный цикл (висит
 *  месяцами на моноблоке в зале) и другая аудитория (гость, не руководитель).
 *
 *  Контракт источника: boom-cmd/docs/DATA-CONTRACT-turbo.md
 *  Обоснование блоков:  boom-cmd-data/drivers/DRV-06-turbo/mehanika/ТУРБО-веб-страница.md
 *  Расписание-мастер:   boom-cmd-data/drivers/DRV-06-turbo/ЖУРНАЛ-турбо-часов.md
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ── 1. Параметры запуска ────────────────────────────────────────────────── */
const Q = new URLSearchParams(location.search)
const FIXED = (Q.get('park') || '').trim().toLowerCase() // панель прибита к парку
const TV = Q.get('tv') === '1'
const DEMO = Q.get('demo') === '1'
const MOCKERR = Q.get('mockError') === '1'

/* URL источника подставляет Vite на сборке из repo Variable VITE_TURBO_API.
   В репозитории лежит только имя переменной — сам URL туда не попадает (§4). */
const API = import.meta.env.VITE_TURBO_API || ''

const CACHE_KEY = 'boom-turbo-cache-v1'
const CACHE_MAX_MS = 24 * 3600 * 1000 // кэш старше суток не используем
const DEFAULT_REFRESH_SEC = 300
const DEFAULT_OPEN = '10:00'
const DEFAULT_CLOSE = '22:00'

if (TV) document.body.classList.add('tv')
if (DEMO) document.getElementById('demo').classList.add('on')

/* ── 2. Часы: панель у кассы может врать дважды ──────────────────────────────
   Расписание задано настенным временем парка («с 16:00»), а моноблок в зале
   никто не настраивает. Ошибиться он может двумя независимыми способами:
     1) сбитые часы — лечится сверкой с сервером;
     2) сбитый ЧАСОВОЙ ПОЯС — часы верные, но Date.getHours() отдаёт не то
        время, которое написано на двери парка. Сверка момента это НЕ лечит:
        мгновение правильное, стрелки не те.
   Поэтому время суток берём из строки server_time (там настенное время МСК)
   и дальше просто прибавляем прошедшие миллисекунды. Системный пояс панели в
   расчёт не входит вообще. Нет server_time → откатываемся на местные часы. */
let anchor = null // { wallMin: минуты от полуночи по серверу, at: Date.now() }

function setAnchor(serverTime) {
  const m = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(serverTime || ''))
  if (!m) return
  anchor = { wallMin: +m[1] * 60 + +m[2] + (+(m[3] || 0)) / 60, at: Date.now() }
}

/** Текущее настенное время парка в минутах от полуночи (дробное). */
function wallMin() {
  if (!anchor) {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  }
  return (anchor.wallMin + (Date.now() - anchor.at) / 60000) % 1440
}

/** Сколько миллисекунд до отметки. Отрицательное = отметка позади. */
const msUntil = (targetMin) => (targetMin - wallMin()) * 60000

function hmToMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim())
  if (!m) return null
  const h = +m[1]
  const mi = +m[2]
  return h > 23 || mi > 59 ? null : h * 60 + mi
}
const pad = (n) => String(n).padStart(2, '0')
const minToHm = (v) => `${pad(Math.floor(v / 60))}:${pad(v % 60)}`
function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/* ── 3. Модель и безопасный дефолт ───────────────────────────────────────────
   Молчит источник → состояние `none`, страница ничего не обещает
   (ТУРБО-веб-страница §3). Пустые счётчики и пакеты не рисуем: пусто лучше,
   чем неверная цифра на экране в зале. */
const EMPTY = {
  parks: [], park: '', park_ru: '', turbo_status: 'active',
  open: DEFAULT_OPEN, close: DEFAULT_CLOSE,
  is_tuesday: false, today: [], machines: [], packages: [],
  winners: [], copy: {}, settings: {},
}
let D = EMPTY
let forcedMode = null // песочница перебивает реальное состояние

function normalize(j) {
  const o = { ...EMPTY, ...(j || {}) }
  const arr = (v) => (Array.isArray(v) ? v : [])
  o.parks = arr(j?.parks)
  o.machines = arr(j?.machines)
  o.packages = arr(j?.packages)
  o.winners = arr(j?.winners)
  o.today = arr(j?.today).filter(
    (w) => w && (w.all_day || (hmToMin(w.from) !== null && hmToMin(w.to) !== null)),
  )
  o.copy = (j && typeof j.copy === 'object' && j.copy) || {}
  o.settings = (j && typeof j.settings === 'object' && j.settings) || {}
  if (hmToMin(o.open) === null) o.open = DEFAULT_OPEN
  if (hmToMin(o.close) === null) o.close = DEFAULT_CLOSE
  o.turbo_status = String(o.turbo_status || 'active').toLowerCase()
  return o
}

/* ── 4. Загрузка ─────────────────────────────────────────────────────────────
   GET без заголовков и без redirect:'manual' — иначе CORS-preflight, на который
   Apps Script не отвечает (грабли дневного слоя). cache:'no-store' — расписание
   правят управляющие в течение дня. */
const parkParam = () => FIXED || D.park || localStorage.getItem('boom-turbo-park') || ''

function readCache() {
  try {
    const o = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    return o && o.data ? o : null
  } catch {
    return null
  }
}
function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch { /* приватный режим / переполнение — не критично, работаем без кэша */ }
}

const staleEl = document.getElementById('stale')
const staleTxt = document.getElementById('stale-txt')
function setStale(on, txt) {
  staleEl.classList.toggle('on', !!on)
  if (txt) staleTxt.textContent = txt
}

async function load() {
  const park = parkParam()
  try {
    if (MOCKERR) throw new Error('Симуляция ошибки (?mockError=1)')

    if (!API) {
      // В проде отсутствие источника — ошибка, мок туда не попадает (правило R2):
      // литеральная проверка DEV нужна, чтобы бандлер вырезал ветку из сборки.
      if (import.meta.env.DEV) {
        D = normalize((await import('./turbo.mock.json')).default)
        setStale(true, 'мок-данные (dev)')
        render()
        return
      }
      throw new Error('Источник данных не настроен')
    }

    const url = `${API}?action=turbo${park ? `&park=${encodeURIComponent(park)}` : ''}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Источник недоступен (${res.status})`)
    const j = await res.json()
    if (j && j.error) throw new Error(String(j.error))

    // якорь настенного времени парка — до первого рендера
    setAnchor(j?.server_time)
    D = normalize(j)
    writeCache(j)
    if (D.park) { try { localStorage.setItem('boom-turbo-park', D.park) } catch {} }
    setStale(false)
  } catch (e) {
    // Сеть отвалилась — показываем последнее известное, но честно помечаем, что
    // данные не свежие. Кэш старше суток не берём: расписание за ночь наверняка
    // сменилось, а неверное окно на экране хуже пустого.
    const c = readCache()
    if (c && Date.now() - c.at < CACHE_MAX_MS) {
      D = normalize(c.data)
      const when = new Date(c.at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
      setStale(true, `расписание от ${when}`)
    } else {
      D = EMPTY
      setStale(true, 'нет связи с расписанием')
    }
    if (import.meta.env.DEV) console.warn('[turbo]', e)
  }
  render()
}

/* ── 5. Рендер блоков ────────────────────────────────────────────────────── */
function renderParks() {
  const box = document.getElementById('parks')
  // Панель прибита к парку через ?park= — переключатель не нужен и опасен:
  // случайное касание оставит экран с чужими цифрами до перезагрузки.
  if (FIXED || D.parks.length < 2) {
    box.hidden = true
    box.innerHTML = ''
    return
  }
  box.hidden = false
  box.innerHTML = D.parks
    .map((p) => `<button data-park="${esc(p.park)}"${p.park === D.park ? ' class="on"' : ''}>${esc(p.park_ru || p.park)}</button>`)
    .join('')
  box.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      try { localStorage.setItem('boom-turbo-park', b.dataset.park) } catch {}
      D = { ...D, park: b.dataset.park }
      load()
    })
  })
}

function renderMachines() {
  document.getElementById('apps').innerHTML = D.machines
    .filter((m) => Number(m.count) > 0)
    .map(
      (m) =>
        `<span class="app"><span class="box">${esc(m.icon || '🕹️')}` +
        `<span class="cnt">${esc(m.count)}</span></span>` +
        `<span class="lbl">${esc(m.label_ru || m.category)}</span></span>`,
    )
    .join('')
}

function renderPacks() {
  const list = [...D.packages].sort((a, b) => (a.sort || 0) - (b.sort || 0))
  document.getElementById('packs-body').innerHTML = list
    .map((p) => {
      const per = p.price && p.games ? Math.round(p.price / p.games) : null
      const kind = String(p.badge_kind || '').toLowerCase()
      const badge = p.badge_ru
        ? `<small><span class="badge${kind === 'try' ? ' try' : ''}">${esc(p.badge_ru)}</span></small>`
        : ''
      return (
        `<a class="pack${kind === 'best' ? ' best' : ''}" href="${esc(p.url || '#')}" target="_blank" rel="noopener">` +
        `<div class="games">${esc(p.games)} игр${badge}</div>` +
        `<div class="buy"><div class="rub">${esc(p.price)} ₽</div>` +
        (per ? `<div class="per">${per} ₽ за игру</div>` : '') +
        `</div></a>`
      )
    })
    .join('')

  // CTA берёт минимальный пакет — «от N ₽» и бейдж с числом игр
  const cheapest = [...list].sort((a, b) => (a.price || 0) - (b.price || 0))[0]
  if (cheapest) {
    document.getElementById('cta-price').textContent = `от ${cheapest.price} ₽`
    document.getElementById('cta-tag').textContent = `${cheapest.games} ИГР`
    if (cheapest.url) document.getElementById('cta').href = cheapest.url
  }
}

function renderSteps() {
  // Победители недели подменяют «как это работает» (механика §6в, решение 07.08).
  // Показываем только то, что контур данных пометил опубликованным: имя на экране
  // в зале — ответственность парка, а не автоподстановка из журнала розыгрыша.
  const w = D.winners.filter((x) => x && x.display_name)
  if (!w.length) return // дефолтная разметка «как это работает» уже в HTML
  document.getElementById('steps-title').textContent = 'Победители недели'
  document.getElementById('steps-body').innerHTML = w
    .slice(0, 3)
    .map(
      (x) =>
        `<div class="win"><div class="medal">🏆</div><div>` +
        `<div class="who">${esc(x.display_name)}</div>` +
        `<div class="prize">${esc(x.prize_ru || '15 турбо-игр')}</div></div></div>`,
    )
    .join('')
}

function renderBrand() {
  // Пока данные не пришли, парк неизвестен — показываем только «БУМБАСТИК»
  // без висящего разделителя. Врать названием парка на экране в зале нельзя.
  const name = D.park_ru || ''
  document.getElementById('brand-park').textContent = name
  document.getElementById('brand-sep').style.display = name ? '' : 'none'
}

function renderCopy() {
  const c = D.copy || {}
  const set = (id, val, html) => {
    if (!val) return
    const n = document.getElementById(id)
    if (html) n.innerHTML = val
    else n.textContent = val
  }
  set('slogan', c.slogan_html, true)
  set('claim', c.claim_html, true)
  set('fineband', c.fineband)
  set('cta-text', c.cta_text)
  set('sub-note', c.subscribe_note)
}

/* ── 6. Машина состояний таймера ─────────────────────────────────────────────
   now   — идут турбо-часы           → зелёная рамка, отсчёт до конца окна
   tue   — вторник (весь день)       → как now, подпись «Турбо-вторник»
   today — окно сегодня впереди      → жёлтый акцент, отсчёт до начала
   none  — окон нет / нет данных     → «Расписание — у подписчиков»
   soon  — парк на паузе             → акция ещё не включена (Питерленд, PIT-21)
   Будущие дни недели наружу не отдаются вовсе — срезаны в Apps Script. */
const el = {
  box: document.getElementById('timer'),
  num: document.getElementById('t-num'),
  count: document.getElementById('t-count'),
  label: document.getElementById('t-label'),
  state: document.getElementById('t-state'),
  note: document.getElementById('t-note'),
}
let startMin = null // отметка начала окна, минуты от полуночи
let endMin = null   // отметка конца окна

function currentWindow() {
  const cur = wallMin()
  const open = hmToMin(D.open)
  const close = hmToMin(D.close)
  let active = null
  let next = null
  D.today.forEach((w) => {
    // «весь день» = часы работы парка; отдельных границ у такого окна нет
    const f = w.all_day ? open : hmToMin(w.from)
    const t = w.all_day ? close : hmToMin(w.to)
    if (f === null || t === null || t <= f) return
    if (cur >= f && cur < t) {
      if (!active || t > hmToMin(active.to)) active = { from: minToHm(f), to: minToHm(t) }
    } else if (cur < f) {
      if (!next || f < hmToMin(next.from)) next = { from: minToHm(f), to: minToHm(t) }
    }
  })
  return { active, next }
}

function computeMode() {
  if (D.turbo_status === 'paused') return 'soon'
  const w = currentWindow()
  if (w.active) return D.is_tuesday ? 'tue' : 'now'
  if (w.next) return 'today'
  return 'none'
}

function applyMode(m) {
  const w = currentWindow()
  el.box.className = 'tile timer'
  el.note.textContent = ''
  el.count.style.display = ''
  el.label.textContent = 'Турбо-часы'
  startMin = null
  endMin = null

  if (m === 'now' || m === 'tue') {
    el.box.classList.add('now')
    const to = w.active?.to || D.close
    endMin = hmToMin(to)
    if (m === 'tue') {
      el.label.textContent = 'Турбо-вторник'
      el.state.textContent = 'Играй весь день'
    } else {
      el.state.textContent = `До ${to}`
    }
  } else if (m === 'today') {
    el.box.classList.add('today')
    const from = w.next?.from || D.open
    startMin = hmToMin(from)
    el.state.textContent = `Сегодня с ${from}`
  } else if (m === 'soon') {
    // Парк на паузе. Пустой календарь показывать нельзя (ЖУРНАЛ §1) — говорим
    // прямо, что часы ещё назначаются, и уводим в подписку.
    el.box.classList.add('soon')
    el.count.style.display = 'none'
    el.state.textContent = 'Турбо-часы скоро'
    el.note.textContent = 'Часы этого парка ещё назначаются. Подпишись — пришлём, как только появятся'
  } else {
    el.box.classList.add('none')
    el.count.style.display = 'none'
    el.state.textContent = 'Расписание — у подписчиков'
    el.note.textContent = 'Нажми «Узнавать первым» внизу — пришлём турбо-часы недели'
  }
  tick()
}

let lastWall = null
function tick() {
  const target = endMin !== null ? endMin : startMin
  if (target !== null) {
    const left = msUntil(target)
    el.num.textContent = fmt(left)
    // Окно закрылось/открылось на ходу — пересобрать состояние, не дожидаясь fetch.
    if (left <= 0) applyMode(forcedMode || computeMode())
  }
  // Настенное время прыгнуло назад — прошла полночь. Панель работает месяцами,
  // и без этого она до следующего опроса показывала бы вчерашние окна.
  const w = wallMin()
  if (lastWall !== null && w < lastWall - 1) load()
  lastWall = w
}

function render() {
  renderBrand()
  renderParks()
  renderMachines()
  renderPacks()
  renderSteps()
  renderCopy()
  applyMode(forcedMode || computeMode())
}

/* ── 7. Жизненный цикл ───────────────────────────────────────────────────── */
setInterval(tick, 1000)
load()

// Автообновление расписания: управляющий поправил часы в таблице — панель
// подхватывает сама, без деплоя и без похода в зал.
let lastLoad = Date.now()
setInterval(() => {
  const sec = Number(D.settings?.refresh_sec) || DEFAULT_REFRESH_SEC
  if (Date.now() - lastLoad >= sec * 1000) {
    lastLoad = Date.now()
    load()
  }
}, 30000)

// Панель работает месяцами без перезагрузки: раз в сутки ночью перезагружаем
// вкладку — забрать новую сборку страницы и не копить утечки.
if (TV) {
  setInterval(() => {
    const h = Math.floor(wallMin() / 60)
    const m = Math.floor(wallMin() % 60)
    if (h === 5 && m === 0) location.reload()
  }, 60000)
}

/* ── 8. Модалка email ────────────────────────────────────────────────────────
   ⚠ Приём подписки пока МОК: базы нет, письмо не уходит. Реальный приём —
   отдельная задача (ТУРБО-веб-страница §5.1: куда пишем базу, double opt-in). */
const modal = document.getElementById('modal')
document.getElementById('openmodal').addEventListener('click', () => modal.classList.add('open'))
document.getElementById('closemodal').addEventListener('click', () => modal.classList.remove('open'))
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open') })
document.getElementById('subform').addEventListener('submit', (e) => {
  e.preventDefault()
  document.getElementById('sub-ok').style.display = 'block'
  e.target.style.display = 'none'
})
// На панели никто не закроет модалку — снимаем её сами.
if (TV) setInterval(() => modal.classList.remove('open'), 30000)

/* ── 9. Песочница (?demo=1) — в бой не идёт, кнопки скрыты без параметра ─── */
document.querySelectorAll('.demo button').forEach((b) => {
  b.addEventListener('click', () => {
    const m = b.dataset.mode
    forcedMode = m === 'auto' ? null : m
    document.querySelectorAll('.demo button').forEach((x) => {
      x.classList.toggle('on', x.dataset.mode === m)
    })
    applyMode(forcedMode || computeMode())
  })
})
