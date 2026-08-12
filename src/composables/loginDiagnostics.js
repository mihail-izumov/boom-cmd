// Диагностика отказа входа (D-22). ЧИСТЫЕ функции + пробы сети, без vue и DOM-разметки.
//
// ПОВОД. Жалобы «не пускает после СТАРТ» неразрешимы в принципе: в журнале
// выполнений Apps Script таких запросов НЕТ (они не доходят до Google — ровно
// как 05.08 с отчётом Охты), а у нас не остаётся ни следа. Человек говорит
// «нет связи с данными», и это единственное, что мы знаем.
//
// ЧТО ЭТО МЕНЯЕТ. Собираем не «логи вообще», а ответ на один вопрос: ГДЕ порвалось.
// Ядро — МАТРИЦА ДОСТУПНОСТИ из двух проб, которые идут ОДНОВРЕМЕННО:
//   свой хост (Pages/домен) │ script.google.com │ вывод
//   ─────────────────────────┼───────────────────┼──────────────────────────────
//   отвечает                 │ отвечает          │ сеть цела — причина в коде/ключе
//   отвечает                 │ НЕ отвечает       │ Google режется: VPN, ДПИ, сеть ТЦ
//   НЕ отвечает              │ НЕ отвечает       │ интернета нет вовсе
// Третья строка отличает «у человека упал вайфай» от «у нас закрыт Google», а
// вторая — это и есть тот самый случай, который владелец 05.08 вылечил
// выключением VPN (см. i18n/net.js).
//
// ПОЧЕМУ ПРОБА GOOGLE — ЭТО ГЕЙТ БЕЗ КЛЮЧА. `?key=` (пустой) боевой doGet
// отвечает `{error:'unauthorized'}` со статусом 200. То есть один запрос без
// единого секрета проверяет СРАЗУ ТРИ вещи: хост достижим, редирект на
// googleusercontent прошёл, развёртывание web-app живо и отвечает JSON'ом.
// Прилетел HTML вместо JSON — значит слетели настройки доступа развёртывания,
// и это НЕ сетевая проблема, хотя человеку она видна как «нет связи».
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ:
//   • отпечатка браузера (canvas, шрифты, плагины) — на вопрос «почему не пустило»
//     он не отвечает, а сотрудник прочитает его как слежку;
//   • geolocation — она поднимет системный запрос разрешения ровно в ту минуту,
//     когда человек и так раздражён, что не может войти;
//   • IP-адреса — от внешней пробы берём СТРАНУ и узел выхода, сам адрес не пишем;
//   • введённого кода доступа — никогда и ни в каком виде.
//
// БЮДЖЕТ ВРЕМЕНИ — ЖЁСТКИЙ. Всё собирается параллельно и целиком укладывается в
// DIAG_BUDGET_MS. Причина не в приватности: мы собираем диагностику в сети,
// которая УЖЕ сломана, и заявка обязана уйти, даже если ни одна проба не ответила.
// Поэтому каждый пункт в failsafe, а не собранное поле = пустая строка, не отказ.
//
// ⚠ БРАУЗЕРНЫЕ ОБЪЕКТЫ — ТОЛЬКО ЧЕРЕЗ window.*  Голые `navigator`/`location` в
// этом проекте уже дважды роняли функции МОЛЧА: обращение уходит в catch, поле
// оказывается пустым, и выглядит это как «данные не собрались», а не как ошибка.

// Потолок на всю сборку. 2.5 с — верхняя граница, за которой человек решает,
// что модалка зависла, и уходит, не отправив заявку.
export const DIAG_BUDGET_MS = 2500
// Потолок ОДНОЙ пробы. Меньше общего бюджета: пробы идут параллельно, и медленная
// не должна съесть время у остальных.
export const PROBE_TIMEOUT_MS = 2000

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_PROJECTS_API) ||
  ''

const BASE =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.BASE_URL) ||
  '/'

// Метка сборки. Подставляется Vite (define в vite.config.js). Отвечает на вопрос
// «а человек вообще на свежей версии?» — с PWA это не праздный вопрос.
const BUILD =
  typeof __APP_BUILD__ !== 'undefined' ? String(__APP_BUILD__) : 'dev'

// Внешний узел, который сообщает СТРАНУ ВЫХОДА трафика. Расхождение «часовой пояс
// Москва, а выходим из Нидерландов» — самый сильный признак включённого VPN,
// который вообще доступен из браузера: честного детектора VPN не существует
// (WebRTC-утечку закрыли, а Apps Script IP клиента не отдаёт).
// Отвечает text/plain вида `ip=…\nloc=NL\ncolo=AMS\n…`.
export const TRACE_URL = 'https://www.cloudflare.com/cdn-cgi/trace'

/** Безопасное чтение: любое падение (нет объекта, заблокировано политикой) → fallback. */
function safe(fn, fallback = '') {
  try {
    const v = fn()
    return v === undefined || v === null ? fallback : v
  } catch {
    return fallback
  }
}

/** fetch с потолком. Свой, а не из netPolicy: пробе не нужны повторы — нужен факт. */
async function probeFetch(url, timeoutMs = PROBE_TIMEOUT_MS) {
  const canAbort = typeof AbortController !== 'undefined'
  const ctrl = canAbort ? new AbortController() : null
  const timer = canAbort ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    return await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      ...(ctrl ? { signal: ctrl.signal } : {}),
    })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Часы: performance.now() монотонны и не врут при переводе системного времени. */
function now() {
  return safe(
    () => (window.performance && window.performance.now ? window.performance.now() : Date.now()),
    Date.now(),
  )
}

/**
 * Одна проба: сколько миллисекунд, какой статус, что упало.
 * `ok` — «хост ответил хоть чем-нибудь», а не «ответил успехом»: для матрицы
 * доступности 404 от живого сервера — это ДОСТИЖИМ, и путать его с обрывом нельзя.
 */
export async function probe(url, timeoutMs = PROBE_TIMEOUT_MS) {
  const t0 = now()
  try {
    const res = await probeFetch(url, timeoutMs)
    return { ok: true, status: res.status, ms: Math.round(now() - t0), error: '', res }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(now() - t0),
      // AbortError = сработал потолок (хост молчит), прочее = обрыв на транспорте.
      error: safe(() => (e && e.name === 'AbortError' ? 'timeout' : e.name || 'fail'), 'fail'),
      res: null,
    }
  }
}

/** Разбор ответа cdn-cgi/trace: `ip=…\nloc=NL\ncolo=AMS`. ЧИСТАЯ функция. */
export function parseTrace(text) {
  const out = { country: '', colo: '' }
  String(text == null ? '' : text)
    .split('\n')
    .forEach((line) => {
      const i = line.indexOf('=')
      if (i < 0) return
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      // `ip` СОЗНАТЕЛЬНО не читаем: адрес сотрудника нам не нужен ни для одного
      // вывода, а хранить его в таблице — лишний класс данных.
      if (k === 'loc') out.country = v.toUpperCase().slice(0, 4)
      if (k === 'colo') out.colo = v.toUpperCase().slice(0, 8)
    })
  return out
}

/**
 * Признаки устройства и браузера — без сети, мгновенно.
 * `standalone` важнее, чем кажется: установленная PWA на iOS живёт по своим
 * правилам (её выгружают из памяти при переключении приложений, и возврат =
 * полная перезагрузка = снова экран входа). Половина жалоб «не пускает» может
 * оказаться этим, и отличить одно от другого можно только по этому флагу.
 */
export function collectEnvironment() {
  const nav = safe(() => window.navigator, null)
  const conn = safe(() => nav.connection || nav.mozConnection || nav.webkitConnection, null)
  return {
    tz: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    // Смещение в минутах ОТ UTC (знак как у людей: Москва = +180, а не -180).
    tz_offset: safe(() => -new Date().getTimezoneOffset(), ''),
    lang: safe(() => nav.language),
    ua: safe(() => String(nav.userAgent).slice(0, 300)),
    online: safe(() => (nav.onLine === false ? 'no' : 'yes'), 'yes'),
    conn_type: safe(() => (conn && conn.effectiveType) || ''),
    conn_rtt: safe(() => (conn && typeof conn.rtt === 'number' ? conn.rtt : ''), ''),
    conn_down: safe(() => (conn && typeof conn.downlink === 'number' ? conn.downlink : ''), ''),
    save_data: safe(() => (conn && conn.saveData ? 'yes' : 'no'), ''),
    standalone: safe(
      () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
          ? 'yes'
          : 'no',
      '',
    ),
    screen: safe(
      () => `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio || 1}`,
    ),
    sw: safe(
      () =>
        !('serviceWorker' in window.navigator)
          ? 'unsupported'
          : window.navigator.serviceWorker.controller
            ? 'active'
            : 'none',
      '',
    ),
    build: BUILD,
    // Часы КЛИЕНТА, и они могут врать — поэтому сервер ставит свой штамп рядом.
    // Расхождение между ними само по себе диагноз: сбитые часы ломают TLS.
    client_at: safe(() => new Date().toISOString()),
  }
}

/**
 * Матрица доступности + страна выхода. Три пробы ПАРАЛЛЕЛЬНО, общий потолок.
 * `apiUrl` параметром (а не только из env) — чтобы приёмка гоняла функцию
 * на подставном сервере, не трогая боевой.
 */
export async function collectProbes({ apiUrl = API, traceUrl = TRACE_URL, base = BASE } = {}) {
  const origin = safe(() => window.location.origin, '')
  // Свой хост пробуем manifest.json: он маленький, лежит в precache и точно есть
  // на любом деплое. `?d=` — против кэша SW и промежуточных прокси: нам нужен
  // факт живой сети, а не бумажка из кэша.
  const selfUrl = origin ? `${origin}${base}manifest.json?d=${Date.now()}` : ''

  const [self, api, trace] = await Promise.all([
    selfUrl ? probe(selfUrl) : Promise.resolve(null),
    // Гейт БЕЗ ключа: секрета не передаём, а ответ `{error:'unauthorized'}`
    // доказывает, что жив весь путь до Google целиком.
    apiUrl ? probe(`${apiUrl}?key=&d=${Date.now()}`) : Promise.resolve(null),
    traceUrl ? probe(traceUrl) : Promise.resolve(null),
  ])

  // Прилетел ли от гейта РАЗБИРАЕМЫЙ JSON. Отличает «Google недоступен» от
  // «развёртывание отвечает страницей входа Google» — второе чинится настройками
  // доступа web-app, а не VPN, и путать их нельзя.
  let apiShape = ''
  if (api && api.ok && api.res) {
    apiShape = await api.res
      .clone()
      .json()
      .then((j) => (j && j.error === 'unauthorized' ? 'gate-json' : 'json'))
      .catch(() => 'not-json')
  }

  let country = ''
  let colo = ''
  if (trace && trace.ok && trace.res) {
    const parsed = await trace.res
      .text()
      .then(parseTrace)
      .catch(() => ({ country: '', colo: '' }))
    country = parsed.country
    colo = parsed.colo
  }

  return {
    probe_self_ok: self ? (self.ok ? 'yes' : 'no') : '',
    probe_self_ms: self ? self.ms : '',
    probe_self_status: self ? self.status : '',
    probe_self_error: self ? self.error : '',
    probe_api_ok: api ? (api.ok ? 'yes' : 'no') : '',
    probe_api_ms: api ? api.ms : '',
    probe_api_status: api ? api.status : '',
    probe_api_error: api ? api.error : '',
    probe_api_shape: apiShape,
    exit_country: country,
    exit_colo: colo,
  }
}

/**
 * Вердикт — КЛИЕНТСКАЯ версия. Тот же вывод независимо считает бэк (он попадает
 * в тему письма), и это не дублирование ради дублирования: здесь вердикт нужен,
 * чтобы ПРЯМО В МОДАЛКЕ сказать человеку, что делать, пока он ещё за телефоном.
 * ЧИСТАЯ функция — приёмка гоняет все ветки без сети.
 *
 * Порядок веток важен и повторяет логику networkHint: «нет интернета» проверяется
 * ПЕРВЫМ, иначе человека без связи отправят выключать VPN, которого у него нет.
 */
export function verdict(d = {}) {
  const selfOk = d.probe_self_ok === 'yes'
  const apiOk = d.probe_api_ok === 'yes'
  // ⚠ «Проба провалилась» и «пробу не делали» — РАЗНЫЕ вещи, и путать их нельзя:
  // на пустой справке (бюджет вышел, сеть отвалилась на самой диагностике) мы бы
  // объявили «интернета нет» человеку, у которого он есть, и отправили чинить
  // не то. Не измерили — так и говорим: причина не определилась.
  const measured = d.probe_self_ok === 'yes' || d.probe_self_ok === 'no'

  if (d.online === 'no' || (measured && !selfOk && !apiOk)) {
    return {
      code: 'offline',
      title: 'Интернета нет',
      advice: 'Проверьте Wi-Fi или мобильную связь и попробуйте снова.',
    }
  }
  if (selfOk && !apiOk) {
    return {
      code: 'google-blocked',
      title: 'Приложение открывается, а источник данных не отвечает',
      // Самый частый случай в наших сетях. Совет конкретный, а не «обратитесь в поддержку».
      advice: 'Чаще всего это VPN или сеть торгового центра. Выключите VPN и нажмите СТАРТ ещё раз.',
    }
  }
  if (apiOk && d.probe_api_shape === 'not-json') {
    return {
      code: 'deploy-broken',
      title: 'Источник отвечает, но не данными',
      advice: 'Это на нашей стороне — настройки доступа развёртывания. Мы уже видим заявку.',
    }
  }
  if (apiOk && d.fail_kind === 'unauthorized') {
    return {
      code: 'wrong-key',
      title: 'Связь есть, код доступа не принят',
      advice: 'Проверьте код: лишний пробел или раскладка. Если код точно верный — напишите нам.',
    }
  }
  if (apiOk) {
    return {
      code: 'flaky',
      title: 'Связь есть, но вход всё равно сорвался',
      advice: 'Похоже на разовую осечку сети. Попробуйте ещё раз — приложение теперь повторяет запрос само.',
    }
  }
  return {
    code: 'unknown',
    title: 'Причина не определилась',
    advice: 'Опишите, что происходит, — мы разберём по технической справке.',
  }
}

/**
 * Признак VPN. Отдельно от вердикта: он попадает в письмо как самостоятельное
 * поле, потому что владелец про VPN спрашивает первым делом.
 * ЧЕСТНАЯ ФОРМУЛИРОВКА: это НЕ детектор, а расхождение «где часы» ↔ «откуда выход».
 * Ложное срабатывание возможно (человек реально в отпуске за границей) — поэтому
 * поле называется «похоже», а не «включён».
 */
export function vpnSuspicion(d = {}) {
  const country = String(d.exit_country || '')
  if (!country) return '' // не измерили — молчим, а не гадаем
  const tz = String(d.tz || '')
  const ruTz = tz.indexOf('Europe/') === 0 || tz.indexOf('Asia/') === 0
  if (country !== 'RU' && ruTz) return `похоже на VPN: выход через ${country}`
  return `выход через ${country}`
}

/**
 * Полная справка. `failure` — то, чем закончилась последняя попытка входа
 * (см. useAccessKey.lastFailure): вид отказа, HTTP-статус, число попыток и
 * СКОЛЬКО МИЛЛИСЕКУНД ПРОШЛО ОТ НАЖАТИЯ «СТАРТ» до отказа. Последнее владелец
 * просил отдельно: «висело 40 секунд» и «отвалилось мгновенно» — разные болезни.
 *
 * Общий потолок держит Promise.race: пробы не успели — отдаём то, что есть,
 * с пометкой budget-exceeded. Заявка уходит в любом случае.
 */
export async function collectDiagnostics(failure = null, opts = {}) {
  const env = collectEnvironment()
  const fail = {
    fail_kind: safe(() => String(failure && failure.kind ? failure.kind : ''), ''),
    fail_detail: safe(() => String(failure && failure.message ? failure.message : '').slice(0, 200), ''),
    fail_http: safe(() => (failure && failure.http ? failure.http : ''), ''),
    attempts: safe(() => (failure && failure.attempts ? failure.attempts : ''), ''),
    ms_to_fail: safe(() => (failure && failure.ms ? failure.ms : ''), ''),
  }

  let probes
  try {
    probes = await Promise.race([
      collectProbes(opts),
      new Promise((r) => setTimeout(() => r({ budget: 'exceeded' }), DIAG_BUDGET_MS)),
    ])
  } catch {
    probes = { budget: 'error' }
  }

  const d = { ...env, ...fail, ...probes }
  const v = verdict(d)
  return { ...d, verdict: v.code, verdict_title: v.title, verdict_advice: v.advice, vpn: vpnSuspicion(d) }
}
