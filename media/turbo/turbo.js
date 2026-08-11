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

/* ── 0. Иконки категорий ─────────────────────────────────────────────────────
   Картинки, а не эмодзи. Эмодзи рисуются системным шрифтом: на моноблоке с
   другой ОС они выглядят иначе, чем на макете, а часть глифов может не найтись
   вовсе. Здесь это критичнее обычного — иконки несут числа аппаратов, то есть
   доказательство «любой автомат».

   Импортируем, а не тянем из public/: Vite подставит хешированные имена, и
   новая картинка доедет до панели сама, без чистки кэша.

   ⚠ Иконки живут В КОДЕ, а поле `icon` из таблицы остаётся ЗАПАСНЫМ (см.
   renderMachines). Причина: набор категорий фиксирован дизайном, а таблица —
   про числа. Заведут новую категорию в таблице без картинки — она отрисуется
   эмодзи из ячейки, а не сломает блок. */
import iconRace from './icons/race.webp'
import iconShoot from './icons/shoot.webp'
import iconMusic from './icons/music.webp'
import iconOther from './icons/other.webp'

const CATEGORY_ICONS = {
  race: iconRace,
  shoot: iconShoot,
  music: iconMusic,
  other: iconOther,
  // airhockey — картинки пока нет: категория заведена с нулём и не рисуется.
  // Появится число → нужна и иконка, иначе выпадет на эмодзи из таблицы.
}

/* ── 1. Параметры запуска ────────────────────────────────────────────────── */
const Q = new URLSearchParams(location.search)
const FIXED = (Q.get('park') || '').trim().toLowerCase() // панель прибита к парку
const TV = Q.get('tv') === '1'
const DEMO = Q.get('demo') === '1'
const MOCKERR = Q.get('mockError') === '1'

/* URL источника подставляет Vite на сборке из repo Variable VITE_TURBO_API.
   В репозитории лежит только имя переменной — сам URL туда не попадает (§4). */
const API = import.meta.env.VITE_TURBO_API || ''

/* Версия НОСИТЕЛЯ (не Apps Script — у него своя SCRIPT_VERSION).
   Видна в служебном бейдже справа внизу: по ней с трёх метров понятно, что
   именно открыто на панели в парке.

   ⚠ ПОДНИМАТЬ при любой правке, которая меняет вид или поведение страницы —
   включая правку СТРУКТУРЫ и ТЕКСТОВ в boom-cmd-turbo.xlsx: деплоя при этом
   нет, и по git будет не понять, почему экран выглядит иначе. Расписание и
   победители — данные, версию не трогают.

   Полное правило и история: boom-cmd-data/docs/changelog/media-turbo.md
   Не поднял — бейдж врёт, и доверять ему больше нельзя никогда. */
const PAGE_VERSION = 'v2.1'

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
  is_tuesday: false, today: [], next_window: null, machines: [], packages: [],
  winners: [], copy: {}, settings: {},
}
let D = EMPTY
let forcedMode = null // песочница перебивает реальное состояние
let hasData = false   // приходил ли хоть один успешный ответ

/* ── Загрузочные состояния ───────────────────────────────────────────────────
   Тот же shimmer-«перелив», что во всех разделах приложения (bc-skeleton).
   Ключевое отличие от приложения — КОГДА он показывается.

   Приложение живёт сессиями: пользователь зашёл, увидел скелетон, получил
   данные. Панель в зале работает месяцами и перечитывает расписание раз в
   пять минут. Мигать скелетоном на работающем экране каждые пять минут —
   значит превратить витрину в мигалку. Поэтому:
     первая загрузка (показывать нечего) → скелетоны на месте данных;
     фоновое обновление (данные уже есть) → крутится только иконка в бейдже. */
const sk = (cls) => `<div class="bc-skeleton ${cls}"></div>`

function showSkeleton() {
  document.getElementById('apps').innerHTML =
    Array.from({ length: 5 }, () => `<span class="app">${sk('sk-app')}</span>`).join('')
  document.getElementById('packs-body').innerHTML =
    Array.from({ length: 3 }, () => sk('sk-pack')).join('')
  // ⚠ Писать в el.count нельзя: внутри него лежит <small id="t-label">, и
  //   innerHTML снёс бы подпись «Турбо-часы» / «Турбо-вторник» насовсем —
  //   applyMode потом обращался бы к удалённому узлу. Заполняем только сам
  //   счётчик и строку состояния.
  el.num.innerHTML = sk('sk-count')
  delete el.num.dataset.parts
  el.state.innerHTML = sk('sk-line')
  el.note.innerHTML = ''
}

/**
 * Отрисовка отсчёта с ПУЛЬСИРУЮЩИМ двоеточием.
 *
 * Наивное `el.num.textContent = str` каждую секунду пересоздаёт узлы, и
 * CSS-анимация двоеточия перезапускается с нуля раз в секунду — вместо
 * плавной двухсекундной пульсации получается дёрганье. Поэтому структуру
 * держим стабильной и меняем только сами цифры.
 */
function paintCount(str) {
  const parts = String(str).split(':')
  if (el.num.dataset.parts !== String(parts.length)) {
    el.num.innerHTML = parts
      .map((_, i) => (i ? '<span class="bl">:</span>' : '') + '<span></span>')
      .join('')
    el.num.dataset.parts = String(parts.length)
  }
  const cells = el.num.querySelectorAll('span:not(.bl)')
  parts.forEach((p, i) => {
    if (cells[i] && cells[i].textContent !== p) cells[i].textContent = p
  })
}

function setBusy(on) {
  document.getElementById('reload').classList.toggle('spin', !!on)
}

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
  // Ближайшее будущее окно. Источник может его не прислать (schedule_visibility
  // = today) — тогда отсчёта просто не будет, а не будет выдуманного времени.
  const nw = j?.next_window
  o.next_window = nw && hmToMin(nw.from) !== null ? nw : null
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

const stampEl = document.getElementById('stamp')
const stampWhen = document.getElementById('stamp-when')

/* «МСК» приписываем явно: браузер форматирует в поясе панели, а моноблок в
   зале может стоять с чужим поясом — тогда без подписи не понять, чьё это
   время. Ровно на этом мы уже спотыкались с таблицей (пояс был лос-анджелесский). */
const fmtWhen = (ms) =>
  new Date(ms).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).replace(',', '') + ' МСК'

/**
 * Служебный бейдж внизу справа. Заменил плавающую метку «нет связи»: две
 * индикации одного и того же состояния в разных углах — лишний шум на экране,
 * который персонал всё равно будет читать в одном месте.
 *   stale=false → зелёная точка и время последнего успешного ответа
 *   stale=true  → розовая точка и время данных, которые сейчас показываются
 */
function setStamp(stale, at) {
  stampEl.classList.toggle('stale', !!stale)
  stampWhen.textContent = at ? fmtWhen(at) : '—'
}
document.getElementById('stamp-ver').textContent = PAGE_VERSION

/* Что означает точка. На панели нет курсора, поэтому hover-подсказка там
   недоступна — нужен клик. Персоналу это единственный способ понять, живые
   данные на экране или последние сохранённые. */
const hintEl = document.getElementById('hint')
let hintTimer = null
function toggleHint() {
  const stale = stampEl.classList.contains('stale')
  hintEl.innerHTML = stale
    ? '<b>Розовая точка</b> — источник не отвечает. На экране последние сохранённые ' +
      'данные, время рядом — когда они получены. Расписание могло с тех пор ' +
      'измениться. Нажми ⟳ справа, чтобы перезагрузить.'
    : '<b>Зелёная точка</b> — данные свежие. Рядом время последнего ответа сервера ' +
      'по Москве и версия страницы. Панель сама перечитывает расписание каждые ' +
      'несколько минут.'
  hintEl.classList.toggle('on')
  clearTimeout(hintTimer)
  if (hintEl.classList.contains('on')) hintTimer = setTimeout(() => hintEl.classList.remove('on'), 12000)
}
stampEl.addEventListener('click', (e) => {
  if (e.target.closest('#reload')) return   // кнопка перезагрузки — не подсказка
  toggleHint()
})

async function load() {
  const park = parkParam()
  if (!hasData) showSkeleton()
  setBusy(true)
  try {
    if (MOCKERR) throw new Error('Симуляция ошибки (?mockError=1)')

    if (!API) {
      // В проде отсутствие источника — ошибка, мок туда не попадает (правило R2):
      // литеральная проверка DEV нужна, чтобы бандлер вырезал ветку из сборки.
      if (import.meta.env.DEV) {
        D = normalize((await import('./turbo.mock.json')).default)
        hasData = true
        setStamp(true, Date.now())
        setBusy(false)
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
    hasData = true
    setStamp(false, Date.now())
  } catch (e) {
    // Сеть отвалилась — показываем последнее известное, но честно помечаем, что
    // данные не свежие. Кэш старше суток не берём: расписание за ночь наверняка
    // сменилось, а неверное окно на экране хуже пустого.
    const c = readCache()
    if (c && Date.now() - c.at < CACHE_MAX_MS) {
      D = normalize(c.data)
      hasData = true
      setStamp(true, c.at)   // время данных, которые сейчас на экране
    } else {
      D = EMPTY
      setStamp(true, null)
    }
    if (import.meta.env.DEV) console.warn('[turbo]', e)
  }
  setBusy(false)
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
    .map((m) => {
      const src = CATEGORY_ICONS[m.category]
      // Есть картинка — рисуем её; нет — падаем на эмодзи из таблицы, чтобы
      // новая категория не оставила пустой квадрат.
      const inner = src
        ? `<img class="ico" src="${src}" alt="" loading="eager" decoding="async">`
        : esc(m.icon || '🕹️')
      return `<span class="app"><span class="box">${inner}` +
        `<span class="cnt">${esc(m.count)}</span></span>` +
        `<span class="lbl">${esc(m.label_ru || m.category)}</span></span>`
    })
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

/**
 * Сверка «просили парк X — источник вернул Y».
 *
 * Apps Script при неизвестном коде отдаёт первый парк по сортировке, чтобы
 * экран в зале не пустел. Логика верная для пустого ?park=, но опасная для
 * ОПЕЧАТКИ: `?park=piterlend` (через «е») молча превращается в Охту, и панель
 * в Питерленде месяцами показывает чужие цифры и чужое расписание. Гость
 * приходит в неверное время, а надпись «Охта Молл» в шапке никто не читает.
 *
 * Поймано в бою 08.08 владельцем. Лечим на фронте, а не в скрипте: только
 * страница знает, какой парк у неё в URL.
 */
function checkPark() {
  const el = document.getElementById('parkerr')
  const bad = !!FIXED && hasData && D.park && FIXED !== D.park
  el.classList.toggle('on', bad)
  if (bad) document.getElementById('parkerr-asked').textContent = `?park=${FIXED}`
  return bad
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
  // Подпись под QR содержит бейдж, поэтому приходит размеченной. Старый
  // плоский ключ поддерживаем: если в таблице ещё лежит subscribe_note,
  // страница не останется с пустой строкой после отката импорта.
  if (c.subscribe_note_html) set('sub-note', c.subscribe_note_html, true)
  else set('sub-note', c.subscribe_note)
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
let nextAt = null   // окно не сегодня: {from, days_ahead, …}

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
  if (D.next_window) return 'next'   // сегодня окон нет, но известно ближайшее
  return 'none'
}

const DOW_RU = ['', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']

/**
 * Сколько миллисекунд до начала окна, которое может быть не сегодня.
 * Считаем в настенном времени парка: дни целиком плюс остаток внутри суток.
 * Собственные часы панели в расчёт не берём — см. §2.
 */
function msUntilWindow(nw) {
  const fromMin = hmToMin(nw.from)
  if (fromMin === null) return 0
  const days = Math.max(0, Number(nw.days_ahead) || 0)
  return days * 86400000 + (fromMin - wallMin()) * 60000
}

/** «1 д 18:42» / «4:07:15» — дни отдельно, иначе часы уходят за сотню. */
function fmtLong(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const rest = total % 86400
  const h = Math.floor(rest / 3600)
  if (d > 0) return `${d} д ${pad(h)}:${pad(Math.floor((rest % 3600) / 60))}`
  return `${h}:${pad(Math.floor((rest % 3600) / 60))}:${pad(rest % 60)}`
}

function applyMode(m) {
  const w = currentWindow()
  el.box.className = 'tile timer'
  el.note.textContent = ''
  el.count.style.display = ''
  el.label.textContent = 'Турбо-часы'
  startMin = null
  endMin = null
  nextAt = null
  delete el.num.dataset.parts

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
  } else if (m === 'next') {
    // Сегодня окон нет, но ближайшее известно. Гостю нужен ответ на вопрос
    // «когда», а не «спроси у подписчиков» — иначе витрина ничего не обещает
    // и не удерживает. Раскрывается РОВНО одно окно, не сетка недели.
    el.box.classList.add('today')
    el.label.textContent = 'До турбо-часов'
    nextAt = D.next_window
    const nw = D.next_window
    const when = nw.days_ahead === 0 ? 'сегодня'
      : nw.days_ahead === 1 ? 'завтра'
      : `в ${DOW_RU[nw.dow] || ''}`
    el.state.textContent = nw.all_day
      ? `${when.charAt(0).toUpperCase()}${when.slice(1)} — весь день`
      : `${when.charAt(0).toUpperCase()}${when.slice(1)} с ${nw.from}`
  } else if (m === 'soon') {
    // Парк на паузе. Пустой календарь показывать нельзя (ЖУРНАЛ §1) — говорим
    // прямо, что часы ещё назначаются, и уводим в подписку.
    el.box.classList.add('soon')
    el.count.style.display = 'none'
    el.state.textContent = 'Турбо-часы скоро'
    el.note.textContent = 'Часы этого парка ещё назначаются. Подпишись — пришлём, как только появятся'
  } else {
    // Плитка слева — СОСТОЯНИЕ, нижний блок — ДЕЙСТВИЕ (QR). Раньше здесь стоял
    // призыв «нажми кнопку внизу», и это была двойная ошибка: текст дублировал
    // нижний блок, а нажать на панель в зале всё равно нельзя.
    el.box.classList.add('none')
    el.count.style.display = 'none'
    el.state.innerHTML = 'Когда следующие<br>турбо-часы?'
    el.note.textContent = 'Расписание — у подписчиков'
  }
  tick()
}

let lastWall = null
function tick() {
  if (nextAt) {
    const left = msUntilWindow(nextAt)
    paintCount(fmtLong(left))
    if (left <= 0) load()   // окно наступило — перечитать расписание
  }
  const target = endMin !== null ? endMin : startMin
  if (target !== null) {
    const left = msUntil(target)
    paintCount(fmt(left))
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
  checkPark()
  // Мягкое появление — тот же bc-fade-in, что в приложении. Только на первой
  // отрисовке: анимировать экран каждые пять минут незачем.
  const page = document.querySelector('.page')
  if (hasData && !page.dataset.shown) {
    page.dataset.shown = '1'
    page.classList.add('bc-fade-in')
  }
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

/* ── 8. Перезагрузка для персонала ──────────────────────────────────────────
   Иконка в служебном бейдже. «Жёсткая» здесь означает «гарантированно свежая»,
   и достаточно обычного reload: HTML носителя намеренно не кэшируется service
   worker'ом (см. public/sw.js), а бандл лежит под хешированным именем — новая
   сборка = новое имя. Единственное, что реально может залипнуть, — кэш
   расписания в localStorage, поэтому его чистим перед перезагрузкой.

   Модалка email убрана вместе с кнопкой: собирать адрес на экране, к которому
   нельзя прикоснуться, невозможно, а приём подписки всё равно был моком —
   страница обещала письмо, которое никто не отправлял. Теперь подписка живёт
   там, куда ведёт QR. */
document.getElementById('reload').addEventListener('click', () => {
  setBusy(true)
  try { localStorage.removeItem(CACHE_KEY) } catch {}
  location.reload()
})

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
