/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /media/turbo/ · блок «День рождения» — декор, физика конфетти, сценарий шаров
 * ═══════════════════════════════════════════════════════════════════════════
 *  Вынесено из turbo.js намеренно: там живёт расписание турбо-часов — логика,
 *  от которой зависит, придёт гость в парк вовремя или нет. Смешивать её с
 *  анимацией праздника нельзя: правка конфетти не должна заставлять
 *  перечитывать машину состояний таймера.
 *
 *  Содержание блока — DRV-08 (день рождения) × канал №7 механики DRV-06.
 *  Обоснование оформления — в CSS блока `.bday` в index.html.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const rnd = (a, b) => a + Math.random() * (b - a)

/* Палитра частиц — родные цвета хлопушки с референса владельца. Это НЕ палитра
   страницы: конфетти читается как конфетти именно потому, что оно разноцветное.
   Единственное место на носителе, где цвета вне основного набора легальны. */
const PCOLORS = ['#9a79e8', '#8ecf5a', '#ffd530', '#e8425a', '#ffa8bd']
const KINDS = ['squiggle', 'ring', 'square', 'dot']

/** Фигуры, на которые разложена хлопушка: серпантин, колечко, квадрат, кружок. */
function shapeSVG(kind, color, s) {
  if (kind === 'squiggle')
    return `<svg width="${s * 2.2}" height="${s * 3}" viewBox="0 0 22 30"><path d="M5 2 q12 5 3 10 q-9 5 3 10 q10 4 2 8" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/></svg>`
  if (kind === 'ring')
    return `<svg width="${s * 1.6}" height="${s * 1.6}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.4" fill="none" stroke="${color}" stroke-width="4"/></svg>`
  if (kind === 'square')
    return `<svg width="${s * 1.3}" height="${s * 1.3}" viewBox="0 0 13 13"><rect x="1.5" y="1.5" width="10" height="10" rx="2.5" fill="${color}"/></svg>`
  return `<svg width="${s * 1.4}" height="${s * 1.4}" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="${color}"/></svg>`
}

/* ── Параметры симуляции ────────────────────────────────────────────────────
   Панель работает месяцами без перезагрузки, поэтому бюджет частиц жёсткий.
   BURST/CYCLE_MS/LIFE_MS связаны: в установившемся режиме живых частиц
   примерно BURST × LIFE_MS / CYCLE_MS = 16 × 150 / 6 ≈ 400. MAX_PARTS — потолок
   на случай, если вкладка была свёрнута и таймеры «сгрудились».

   ⚠ Дорого не количество узлов, а их обновление. Осевшая частица не
   пересчитывается и не перерисовывается вообще — в кадре считаются только
   летящие, а их всегда около полутора десятков. */
const BURST = 16
const CYCLE_MS = 6000
const LIFE_MS = 150000
const MAX_PARTS = 430
const BIN = 24 // ширина колонки в карте высот сугроба

export function initBday() {
  const tile = document.getElementById('bdaytile')
  const box = document.getElementById('confetti')
  const popper = document.getElementById('popper')
  const bal = document.getElementById('balloons')
  const amb = document.getElementById('ambient')
  if (!tile || !box || !popper || !bal || !amb) return

  /* ⚠ Через `window.`, а не голым идентификатором, и с проверкой на наличие.
     Голый `matchMedia` роняет весь модуль там, где его нет, — а нет его,
     например, в jsdom, где идёт приёмка носителя. Те же грабли уже ловились
     на `location` и `sessionStorage`: браузерные объекты берём только через
     window и только с проверкой. */
  const noMotion = !!(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  /* ── тихая жизнь: серпантин по свободным углам и мерцающие искры ──
     Координаты абсолютные: блок рисуется в логических пикселях канвы. */
  const ambient = [
    [560, 14, 'squiggle', '#9a79e8', 9, 0.32, 7],
    [452, 246, 'squiggle', '#8ecf5a', 8, 0.28, 8.5],
    [700, 60, 'squiggle', '#ffd530', 7, 0.28, 9.5],
  ]
  ambient.forEach((p) => {
    const d = document.createElement('div')
    d.className = 'amb'
    d.style.left = `${p[0]}px`
    d.style.top = `${p[1]}px`
    d.style.opacity = String(p[5])
    d.style.animationDuration = `${p[6]}s`
    d.innerHTML = shapeSVG(p[2], p[3], p[4])
    amb.appendChild(d)
  })
  for (let j = 0; j < 7; j++) {
    const st = document.createElement('div')
    st.className = 'star'
    const s = rnd(3, 6)
    st.style.left = `${Math.round(rnd(430, 850))}px`
    st.style.top = `${Math.round(rnd(10, 280))}px`
    st.style.animationDuration = `${rnd(2.4, 4.6).toFixed(2)}s`
    st.style.animationDelay = `${(-rnd(0, 4)).toFixed(2)}s`
    st.innerHTML =
      `<svg width="${s * 2}" height="${s * 2}" viewBox="0 0 10 10"><path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" fill="${j % 2 ? '#ffd530' : '#ffa8bd'}"/></svg>`
    amb.appendChild(st)
  }

  /* ⚠ Ниже начинается движение, и оно опирается на Web Animations API
     (element.animate) и requestAnimationFrame. Ни того, ни другого может не
     оказаться: браузер моноблока ТЦ Июня нам неизвестен вовсе (реестр
     панелей §2.2, вопрос П-1), а в jsdom, где идёт приёмка, WAAPI нет.
     Без проверки страница осталась бы БЕЗ РАСПИСАНИЯ: initBday зовётся до
     load(), и исключение отсюда обрывало бы весь модуль.
     Нет движения — блок просто стоит статикой, это полностью рабочий вид. */
  const canAnimate =
    typeof bal.animate === 'function' && typeof window.requestAnimationFrame === 'function'
  if (noMotion || !canAnimate) return

  /* ── СЦЕНАРИЙ ШАРОВ: 18 секунд пряток с плашкой «+50» ──────────────────────
     Шары то уходят ЗА плашку, то выныривают ПЕРЕД ней, на мгновение её
     закрывая. Смена слоя происходит только когда шары почти целиком за нижним
     краем блока — подмены зритель не видит.
     ⚠ Слой переключает rAF по anim.currentTime, а НЕ отдельный setInterval:
       на панели, которая не перезагружается месяцами, независимый таймер
       неминуемо разъедется с CSS-анимацией, и шары начнут менять слой на
       виду. Одни часы — одна правда. */
  const DUR = 18000
  const anim = bal.animate(
    [
      { offset: 0.0, transform: 'translate(0px, 0px) rotate(0deg)' },
      { offset: 0.17, transform: 'translate(-210px, 26px) rotate(-5deg)' },
      { offset: 0.28, transform: 'translate(-190px, -46px) rotate(3deg)' },
      { offset: 0.42, transform: 'translate(-20px, 10px) rotate(2deg)' },
      { offset: 0.55, transform: 'translate(-60px, 330px) rotate(-8deg)' },
      { offset: 0.68, transform: 'translate(-235px, 60px) rotate(4deg)' },
      { offset: 0.8, transform: 'translate(-180px, 34px) rotate(-3deg)' },
      { offset: 0.92, transform: 'translate(-40px, 340px) rotate(6deg)' },
      { offset: 1.0, transform: 'translate(0px, 0px) rotate(0deg)' },
    ],
    { duration: DUR, iterations: Infinity, easing: 'linear' },
  )

  /* ── ХЛОПУШКА: дыхание плюс отдача в момент залпа ──
     Залп берёт время у ЭТОЙ анимации, поэтому отдача корпуса и вылет частиц
     не разъедутся за сутки работы. */
  const popAnim = popper.animate(
    [
      { offset: 0.0, transform: 'rotate(0deg) scale(1)' },
      { offset: 0.03, transform: 'rotate(0deg) scale(1)' },
      { offset: 0.05, transform: 'rotate(11deg) scale(1.12)' },
      { offset: 0.09, transform: 'rotate(-4deg) scale(1.03)' },
      { offset: 0.13, transform: 'rotate(0deg) scale(1)' },
      { offset: 0.55, transform: 'rotate(-2.5deg) translateY(-4px) scale(1)' },
      { offset: 1.0, transform: 'rotate(0deg) scale(1)' },
    ],
    { duration: CYCLE_MS, iterations: Infinity, easing: 'linear' },
  )

  /* ── ФИЗИКА КОНФЕТТИ ────────────────────────────────────────────────────────
     Кейфреймами это не выражается: нужен отскок от потолка, хаотичный разлёт
     и НАКОПЛЕНИЕ кучками внизу. Поэтому считаем по-настоящему.

     Куча растёт за счёт карты высот: ширина блока порезана на колонки по BIN,
     heap[i] хранит высоту сугроба в колонке, частица садится на верх сугроба,
     а не на пол. Плюс осыпание — без него профиль получался «гребёнкой»
     (соседние колонки 0 и 160px), а настоящий песок так не лежит.

     capOf — переменный потолок кучи. Под текстом (левая часть блока) сугробу
     расти запрещено: пёстрая куча за розовой строкой съедала её читаемость.
     Там остаётся тонкая праздничная кромка. */
  let W = 873
  let H = 300
  let NBINS = 37
  let capOf = []
  let heap = []
  let parts = []

  function measure() {
    const r = tile.getBoundingClientRect()
    /* Со сцены снят transform: scale(). getBoundingClientRect отдаёт уже
       масштабированные размеры, поэтому делим на фактический масштаб, иначе
       физика считалась бы в экранных пикселях, а рисовалась в логических. */
    const stage = document.getElementById('stage')
    const k = stage ? (stage.getBoundingClientRect().width / stage.offsetWidth) || 1 : 1
    W = Math.max(300, Math.round(r.width / k))
    H = Math.max(160, Math.round(r.height / k))
    NBINS = Math.ceil(W / BIN)
    const heapMax = Math.round(H * 0.57) // уровень панели «9 000»
    const guard = Math.min(580, W * 0.66) // поляна под текстом
    capOf = []
    heap = []
    for (let i = 0; i < NBINS; i++) {
      capOf.push(i * BIN < guard ? 22 : heapMax)
      heap.push(0)
    }
  }

  function reset() {
    parts.forEach((p) => p.el.remove())
    parts = []
    measure()
  }

  const binOf = (x) => Math.max(0, Math.min(NBINS - 1, Math.floor(x / BIN)))

  function spawnBurst() {
    if (parts.length > MAX_PARTS - BURST) return
    for (let i = 0; i < BURST; i++) {
      const el = document.createElement('div')
      el.className = 'p'
      const size = rnd(6, 11)
      el.innerHTML = shapeSVG(KINDS[i % 4], PCOLORS[i % 5], size)
      box.appendChild(el)
      /* Веер круче к вертикали, чем «просто влево»: дальнобойные частицы
         улетали на поляну под текстом, где куче расти запрещено, и сугроб
         не набирался вовсе. */
      const a = (rnd(-146, -94) * Math.PI) / 180
      const v = rnd(9, 16)
      parts.push({
        el, x: W - 107, y: H - 94, size,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        rot: rnd(0, 360), vr: rnd(-14, 14),
        born: performance.now(), settled: false, dying: false, contrib: 0, bin: 0,
      })
    }
  }

  function step(now) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]

      if (p.settled && !p.dying) {
        if (now - p.born > LIFE_MS) {
          p.dying = true
          p.settled = false
          p.vy = 0.4
          p.vx = 0
          heap[p.bin] = Math.max(0, heap[p.bin] - p.contrib) // куча дышит
        }
        continue // лежит — не считаем и не перерисовываем
      }

      p.vy += 0.34 // гравитация
      p.vx *= 0.995 // сопротивление воздуха
      p.vy *= 0.998
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr

      if (!p.dying) {
        if (p.y < 4) { // ПОТОЛОК: хаотичный отскок
          p.y = 4
          p.vy = Math.abs(p.vy) * rnd(0.35, 0.6)
          p.vx = p.vx * rnd(0.4, 0.9) + rnd(-2.5, 2.5)
          p.vr = rnd(-16, 16)
        }
        if (p.x < 4) { p.x = 4; p.vx = Math.abs(p.vx) * 0.5 }
        if (p.x > W - 8) { p.x = W - 8; p.vx = -Math.abs(p.vx) * 0.5 }

        let b = binOf(p.x)
        // осыпание: скатываемся в соседнюю колонку, если перепад больше размера
        if (b > 0 && heap[b - 1] < heap[b] - 14) { b -= 1; p.x = b * BIN + BIN / 2 }
        else if (b < NBINS - 1 && heap[b + 1] < heap[b] - 14) { b += 1; p.x = b * BIN + BIN / 2 }

        const ground = H - 4 - heap[b]
        if (p.y > ground) {
          p.y = ground
          if (Math.abs(p.vy) > 1.6) {
            p.vy = -Math.abs(p.vy) * rnd(0.25, 0.4)
            p.vx *= 0.5
            p.vr *= 0.5
          } else {
            p.settled = true
            p.bin = b
            // вклад в высоту — 3/4 размера: частицы ложатся внахлёст, но
            // сугроб должен ВИДИМО расти
            p.contrib = heap[b] < capOf[b] ? p.size * 0.75 : 0
            heap[b] += p.contrib
            p.vx = 0; p.vy = 0; p.vr = 0
            p.rot = Math.round(p.rot / 30) * 30 + rnd(-8, 8)
            p.el.style.opacity = '.92'
          }
        }
      } else if (p.y > H + 40) {
        p.el.remove()
        parts.splice(i, 1)
        continue
      } else {
        p.el.style.opacity = String(Math.max(0, 1 - (p.y - (H - 4)) / 60))
      }
      p.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${p.rot.toFixed(0)}deg)`
    }
  }

  let lastCycle = -1
  function frame(now) {
    // Вкладка свёрнута (ночной режим панели, переключение окна) — не считаем
    // вовсе: иначе после разворачивания вывалится пачка «догоняющих» залпов.
    if (!document.hidden) {
      const t = popAnim.currentTime || 0
      const c = Math.floor(t / CYCLE_MS)
      if (c !== lastCycle && (t % CYCLE_MS) / CYCLE_MS >= 0.04) {
        lastCycle = c
        spawnBurst()
      }
      step(now)
      const bt = ((anim.currentTime || 0) % DUR) / DUR
      bal.style.zIndex = bt > 0.585 && bt < 0.895 ? '5' : '3'
    }
    requestAnimationFrame(frame)
  }

  reset()
  spawnBurst()
  requestAnimationFrame(frame)

  // Смена геометрии панели (поворот, смена разрешения) — пересобрать карту
  // высот: колонок стало другое количество, старые сугробы к ней не относятся.
  return { reset }
}
