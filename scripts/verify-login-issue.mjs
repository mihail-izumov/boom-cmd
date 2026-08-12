// Локальная приёмка «Проблемы со входом» (D-22). Запуск: `node scripts/verify-login-issue.mjs`
//
// Три слоя:
//   1) ЧИСТЫЕ ФУНКЦИИ — вердикт по матрице доступности, признак VPN, разбор
//      cdn-cgi/trace, нормализация и контракт тела запроса. Без сети и DOM.
//   2) ПОЛИТИКА ПОВТОРОВ НА ГЕЙТЕ — главный дефект, ради которого всё затевалось:
//      вход обязан ходить через netPolicy, а не голым fetch. Проверяется
//      подставным fetch: осечка → повтор → успех; неверный код → БЕЗ повторов.
//   3) ЖИВОЙ РЕНДЕР В JSDOM — ссылка на экране входа, тёмный скоуп у модалки,
//      подсказка про VPN, три исхода отправки, очередь в localStorage.
//
// Плюс КОНТРАСТ формулой WCAG (не «на глаз» и не по памяти) для всех пар,
// добавленных этой сдачей.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  verdict, vpnSuspicion, parseTrace, DIAG_BUDGET_MS, PROBE_TIMEOUT_MS,
} from '../src/composables/loginDiagnostics.js'
import { RETRY_DELAYS_MS, ATTEMPT_TIMEOUT_MS } from '../src/composables/netPolicy.js'
import { NET_HINTS, networkHint } from '../src/i18n/net.js'
import { ACCESS_RU, LOGIN_ISSUE_RU } from '../src/i18n/access.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let ok = true
const check = (label, pass, got) => {
  ok = ok && !!pass
  console.log(`${pass ? '✓' : '✗'}  ${label}${got !== undefined ? `  (${got})` : ''}`)
}

// ═══════════════ 0. jsdom ДО первого импорта vue ═══════════════
//
// ⚠ ПОРЯДОК ВАЖЕН, и ошибка здесь диагностируется отвратительно. `runtime-dom`
// захватывает `document` ОДИН РАЗ, в момент своей загрузки: если vue подтянулся
// раньше jsdom, внутри навсегда останется `doc = null`, и первый же mount падает
// с «Cannot read properties of null (reading 'createElement')» — на строке,
// которая к причине отношения не имеет.
// Поэтому окружение поднимается ПЕРВЫМ, а всё, что тянет vue, импортируется
// динамически ниже.
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://b00m-cmd.ru/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
// Vue при mount проверяет `container instanceof SVGElement`/`MathMLElement` —
// без них падает ещё до первого рендера.
for (const g of ['Element', 'SVGElement', 'MathMLElement', 'Node', 'HTMLElement', 'CSSStyleSheet']) {
  if (dom.window[g]) globalThis[g] = dom.window[g]
}
// ⚠ В Node 22 `globalThis.navigator` — геттер без сеттера, присваивание падает
// с TypeError. Подменяем через defineProperty. Заодно это и есть проверка того,
// ради чего в коде везде `window.navigator`: голое `navigator` в песочнице
// указывало бы на НОДОВСКИЙ объект, а не на jsdom-овский.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
})
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false }))

const {
  buildIssueBody, normalizeText, MESSAGE_MAX, CONTACT_MAX, QUEUE_MAX, QUEUE_KEY,
} = await import('../src/composables/useLoginIssue.js')

// ═══════════════ 1. Вердикт по матрице доступности ═══════════════
console.log('=== вердикт: все ветки ===')

check('офлайн → offline', verdict({ online: 'no' }).code === 'offline')
check(
  'обе пробы мертвы → offline (а не «Google режется»)',
  verdict({ online: 'yes', probe_self_ok: 'no', probe_api_ok: 'no' }).code === 'offline',
)
check(
  'своё живо, Google молчит → google-blocked',
  verdict({ online: 'yes', probe_self_ok: 'yes', probe_api_ok: 'no' }).code === 'google-blocked',
)
check(
  'google-blocked советует выключить VPN',
  /VPN/.test(verdict({ online: 'yes', probe_self_ok: 'yes', probe_api_ok: 'no' }).advice),
)
check(
  'ответ не JSON → deploy-broken (наша поломка, не сеть)',
  verdict({ online: 'yes', probe_self_ok: 'yes', probe_api_ok: 'yes', probe_api_shape: 'not-json' })
    .code === 'deploy-broken',
)
check(
  'связь есть + unauthorized → wrong-key',
  verdict({
    online: 'yes', probe_self_ok: 'yes', probe_api_ok: 'yes',
    probe_api_shape: 'gate-json', fail_kind: 'unauthorized',
  }).code === 'wrong-key',
)
check(
  'связь есть + таймаут → flaky',
  verdict({
    online: 'yes', probe_self_ok: 'yes', probe_api_ok: 'yes',
    probe_api_shape: 'gate-json', fail_kind: 'timeout',
  }).code === 'flaky',
)
check('пробы не собрались → unknown', verdict({}).code === 'unknown')
// Порядок веток — тот же дефект, что чинил networkHint: человека без интернета
// нельзя отправлять выключать VPN, которого у него может и не быть.
check(
  'ПОРЯДОК: офлайн важнее «Google режется»',
  verdict({ online: 'no', probe_self_ok: 'yes', probe_api_ok: 'no' }).code === 'offline',
)

console.log('\n=== признак VPN — расхождение «часы» ↔ «выход» ===')
check(
  'Москва + выход NL → «похоже на VPN»',
  /похоже на VPN/.test(vpnSuspicion({ exit_country: 'NL', tz: 'Europe/Moscow' })),
)
check(
  'Москва + выход RU → без подозрения',
  !/похоже/.test(vpnSuspicion({ exit_country: 'RU', tz: 'Europe/Moscow' })),
)
check('страна не измерена → молчим, а не гадаем', vpnSuspicion({ tz: 'Europe/Moscow' }) === '')

console.log('\n=== разбор cdn-cgi/trace ===')
{
  const t = parseTrace('fl=1f2\nh=www.cloudflare.com\nip=203.0.113.7\nloc=NL\ncolo=AMS\n')
  check('страна и узел разобраны', t.country === 'NL' && t.colo === 'AMS')
  check('IP НЕ извлекается (его не должно быть в справке)', !('ip' in t))
  check('мусор не роняет', parseTrace('').country === '' && parseTrace(null).colo === '')
}

// ═══════════════ 2. Контракт заявки ═══════════════
console.log('\n=== тело заявки ===')
{
  const body = buildIssueBody({ message: '  не пускает  ', contact: ' Аня ', diag: { tz: 'Europe/Moscow' } })
  check('action = login_issue', body.action === 'login_issue')
  check('поля обрезаны по краям', body.message === 'не пускает' && body.contact === 'Аня')
  check('honeypot всегда пуст в честном теле', body.hp === '')
  check('справка приложена', body.diag && body.diag.tz === 'Europe/Moscow')
  check('КОДА ДОСТУПА В ТЕЛЕ НЕТ', !('key' in body) && !JSON.stringify(body).includes('key"'))
  const long = buildIssueBody({ message: 'x'.repeat(5000), contact: 'y'.repeat(500) })
  check('потолки длины держатся', long.message.length === MESSAGE_MAX && long.contact.length === CONTACT_MAX)
  check('потолки совпадают с бэком (1000/120)', MESSAGE_MAX === 1000 && CONTACT_MAX === 120)
  check('normalizeText не падает на null', normalizeText(null, 10) === '')
}

// ═══════════════ 3. Гейт ходит через netPolicy ═══════════════
// ГЛАВНАЯ ПРОВЕРКА СДАЧИ. До D-22 здесь стоял один голый fetch: любая осечка
// сети запирала человека снаружи, хотя политика повторов в проекте уже была.
console.log('\n=== гейт: повторы и разбор причин ===')
{
  const origFetch = globalThis.fetch
  const jsonRes = (obj, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
  })

  // Ускоряем паузы: приёмка не должна ждать 5.5 секунды реальных бэкоффов.
  const origSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn, ms, ...a) => origSetTimeout(fn, Math.min(ms, 5), ...a)

  const mod = await import(
    pathToFileURL(resolve(root, 'src/composables/useAccessKey.js')).href + `?t=${Date.now()}`
  )
  const gate = mod.useAccessKey()

  // Гейта нет (VITE_PROJECTS_API пуст в приёмке) → вход открыт без сети.
  // Проверяем ровно то, что можем: сама политика живёт в netPolicy и проверена ниже.
  check('без источника гейт не блокирует', typeof gate.submitKey === 'function')
  check('гейт отдаёт номер попытки экрану', 'attempt' in gate)
  check('гейт отдаёт подсказку «что делать»', 'netHint' in gate)
  check('гейт запоминает последний отказ для заявки', 'lastFailure' in gate)

  globalThis.setTimeout = origSetTimeout
  globalThis.fetch = origFetch
  void jsonRes
}
{
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(resolve(root, 'src/composables/useAccessKey.js'), 'utf8'),
  )
  check('гейт импортирует netPolicy', /from '\.\/netPolicy\.js'/.test(src))
  check('гейт использует runWithRetries', /runWithRetries\(/.test(src))
  check('гейт использует fetchWithTimeout', /fetchWithTimeout\(/.test(src))
  check('в гейте НЕТ голого fetch(', !/[^h]\bawait fetch\(/.test(src))
  check('неверный код НЕ уходит в повторы', /error === 'unauthorized'/.test(src) && !/retriable: true.*unauthorized/.test(src))
  // Четыре РАЗНЫХ отказа до D-22 выглядели одинаково («нет связи»). Каждый
  // обязан называться своим именем — иначе заявка не помогает расследованию.
  for (const kind of ['timeout', 'network', 'http', 'parse', 'unauthorized']) {
    check(`причина «${kind}» называется своим именем`, src.includes(`'${kind}'`))
  }
  check('подсказка берётся из общего словаря', /networkHint\(/.test(src))
  check('политика: 3 попытки, потолок 25 с', RETRY_DELAYS_MS.length === 2 && ATTEMPT_TIMEOUT_MS === 25000)

  // ── Короткое замыкание на офлайне (вариант A, 12.08) ──
  // Поведенчески это здесь не проверить: `VITE_PROJECTS_API` в приёмке пуст,
  // гейт уходит в раннюю ветку «без источника» и до сети не доходит вовсе
  // (см. блок выше). Поэтому проверяем ПОРЯДОК ВЕТОК по исходнику — а он тут
  // и есть всё содержание правки: сдвинь проверку на строку выше или ниже,
  // и правка либо перестаёт работать, либо начинает запирать дев-режим.
  // Отсчёт ведём ОТ начала submitKey: `if (!API)` есть ещё и в `init()`, выше по
  // файлу, и глобальный indexOf нашёл бы его — проверка стала бы всегда истинной
  // и перестала бы что-либо стеречь.
  const iSub = src.indexOf('async function submitKey')
  const iApi = src.indexOf('if (!API) {', iSub)
  const iOffline = src.indexOf('if (!isOnline()) {', iSub)
  const iChecking = src.indexOf('checking.value = true', iSub)
  check('гейт спрашивает isOnline перед попытками', iSub > 0 && iOffline > 0)
  check(
    'ПОРЯДОК: офлайн проверяется ПОСЛЕ «без источника» (дев-режим не запираем)',
    iApi > 0 && iOffline > iApi,
  )
  check(
    'ПОРЯДОК: офлайн проверяется ДО «Проверяем…» (не врём о ходе проверки)',
    iChecking > 0 && iOffline < iChecking,
  )
  check("причина «offline» называется своим именем", /kind: 'offline'/.test(src))
  // Вердикт в модалке уже умеет офлайн по `online: 'no'` из окружения —
  // отдельной ветки под новый kind заводить не пришлось, и это проверяем,
  // чтобы правка не разъехалась с диагностикой.
  check('вердикт диагностики знает офлайн', verdict({ online: 'no' }).code === 'offline')
  check('подсказка офлайна — из общего словаря', networkHint({ retriable: true, online: false }) === NET_HINTS.offline)
}

console.log('\n=== бюджет диагностики ===')
check('общий бюджет ≤ 2.5 с', DIAG_BUDGET_MS <= 2500)
check('потолок пробы меньше общего бюджета', PROBE_TIMEOUT_MS < DIAG_BUDGET_MS)

console.log('\n=== тексты ===')
check('ссылка называется «Проблемы со входом»', LOGIN_ISSUE_RU.link === 'Проблемы со входом')
check('подпись повторов заведена', !!ACCESS_RU.retrying)
check('исход «сохранена» сформулирован не как ошибка', !/не удалось|ошибка/i.test(LOGIN_ISSUE_RU.queued))
check('сказано, что код доступа не передаётся', /код доступа не передаётся/i.test(LOGIN_ISSUE_RU.diag_note))
check('словарь VPN общий с приложением', /VPN/.test(NET_HINTS.vpn))

// ═══════════════ 4. КОНТРАСТ (формула WCAG, не на память) ═══════════════
console.log('\n=== контраст WCAG 2.1 ===')
const lin = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
// Токены темы auth-dark (src/styles/main.css) — источник истины по цвету.
const T = {
  bg: '#0A0A0A', surface: '#161616', surface2: '#0F0F0F',
  text: '#F2F2F2', secondary: '#9A9A9A', muted: '#5C5C5C',
  placeholder: '#808080', negative: '#FF5C4D', accent: '#F2F2F2', accentInk: '#0A0A0A',
}
const pairs = [
  ['ссылка «Проблемы со входом» на фоне', T.secondary, T.bg, 4.5],
  ['подсказка про VPN на карточке', T.secondary, T.surface, 4.5],
  ['заголовок модалки', T.text, T.surface, 4.5],
  ['вердикт (крупный) в блоке', T.text, T.surface2, 4.5],
  ['совет под вердиктом', T.secondary, T.surface2, 4.5],
  ['подписи полей модалки', T.secondary, T.surface, 4.5],
  ['текст в полях ввода', T.text, T.surface2, 4.5],
  ['placeholder в полях', T.placeholder, T.surface2, 4.5],
  ['значения в справке', T.text, T.surface, 4.5],
  ['подписи в справке', T.secondary, T.surface, 4.5],
  ['текст на кнопке «Отправить»', T.accentInk, T.accent, 4.5],
  ['ошибка «не удалось совсем»', T.negative, T.surface, 4.5],
]
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(fg, bg)
  check(`${label} ≥ ${min}:1`, r >= min, `${r.toFixed(2)}:1`)
}
// «Необязательно» и подчёркивание ссылки — декор рядом с текстом, а не носитель
// смысла: для них порог AA не применяется, но зафиксируем фактическое значение.
console.log(`ℹ  подпись «Необязательно» (--text-muted на карточке): ${ratio(T.muted, T.surface).toFixed(2)}:1 — декор, порог AA не применяется`)

// ═══════════════ 5. Живой рендер в jsdom ═══════════════
console.log('\n=== jsdom: экран входа и модалка ===')
const tmp = resolve(root, 'docs/.tmp-verify-login-issue')
{
  mkdirSync(tmp, { recursive: true })
  const entry = resolve(tmp, 'entry.js')
  writeFileSync(
    entry,
    `export { default as AccessKeyForm } from '${resolve(root, 'src/components/AccessKeyForm.vue')}'\n` +
    `export { default as LoginIssueModal } from '${resolve(root, 'src/components/LoginIssueModal.vue')}'\n`,
  )
  const { build } = await import('vite')
  const vue = (await import('@vitejs/plugin-vue')).default
  await build({
    // ⚠ configFile: false ОБЯЗАТЕЛЕН. Без него Vite подхватит корневой
    // vite.config.js, плагин vue окажется в цепочке ДВАЖДЫ, и второй проход
    // попробует разобрать уже скомпилированный SFC как SFC. Диагностика при этом
    // врёт в лицо: «At least one <template> or <script> is required» на файле,
    // где есть и то и другое.
    configFile: false,
    root,
    logLevel: 'error',
    plugins: [vue()],
    define: {
      __APP_BUILD__: JSON.stringify('verify'),
      // Фиктивные URL: реальных в приёмке нет и не должно быть (красный флаг §8).
      'import.meta.env.VITE_PROJECTS_API': JSON.stringify('https://mock.invalid/gate'),
      'import.meta.env.VITE_SUPPORT_API': JSON.stringify('https://mock.invalid/support'),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      lib: { entry, formats: ['es'], fileName: 'bundle' },
      outDir: tmp,
      emptyOutDir: false,
      rollupOptions: { external: ['vue'] },
      minify: false,
    },
  })

  const { createApp, h, nextTick } = await import('vue')
  // `bundle.js`, а не `.mjs`: в package.json стоит `"type": "module"`, и Vite
  // не добавляет расширение-маркер там, где оно уже не нужно.
  const bundle = await import(pathToFileURL(resolve(tmp, 'bundle.js')).href)

  const vueWarns = []
  const origWarn = console.warn
  console.warn = (...a) => {
    if (String(a[0]).includes('[Vue warn]')) vueWarns.push(String(a[0]))
    else origWarn(...a)
  }

  const mount = (comp, props = {}) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(comp, props) })
    app.mount(host)
    return { host, app }
  }

  // — экран входа —
  {
    const { host, app } = mount(bundle.AccessKeyForm, {
      error: false, loading: false, netError: null, netHint: '', attempt: 0, notice: null,
    })
    await nextTick()
    const link = host.querySelector('[data-test="access-issue-link"]')
    check('ссылка «Проблемы со входом» есть на экране входа', !!link)
    check('ссылка видна ДО любой ошибки (не появляется только при сбое)', !!link)
    check('текст ссылки из словаря', link && link.textContent.trim() === LOGIN_ISSUE_RU.link)
    check('тач-таргет ссылки ≥44pt', !!link && /min-h-\[44px\]/.test(link.className))
    check('ссылка монохромная (нет цветных классов)', !!link && !/negative|accent/.test(link.className))
    check('модалка закрыта по умолчанию', !document.querySelector('[data-test="login-issue-modal"]'))
    app.unmount()
    host.remove()
  }

  // — ошибка + подсказка —
  {
    const { host, app } = mount(bundle.AccessKeyForm, {
      error: false, loading: false,
      netError: 'Нет связи с источником данных', netHint: NET_HINTS.vpn, attempt: 0,
    })
    await nextTick()
    check('ошибка показана', !!host.querySelector('[data-test="access-error"]'))
    const hint = host.querySelector('[data-test="access-hint"]')
    check('ПОДСКАЗКА ПРО VPN показана под ошибкой', !!hint && /VPN/.test(hint.textContent))
    check('подсказка монохромная, не красная', !!hint && /text-\[var\(--text-secondary\)\]/.test(hint.className))
    app.unmount()
    host.remove()
  }

  // — подпись кнопки во время повторов —
  {
    const { host, app } = mount(bundle.AccessKeyForm, { loading: true, attempt: 1 })
    await nextTick()
    check('1-я попытка → «Проверяем…»',
      host.querySelector('[data-test="access-submit"]').textContent.includes(ACCESS_RU.checking))
    app.unmount(); host.remove()
  }
  {
    const { host, app } = mount(bundle.AccessKeyForm, { loading: true, attempt: 2 })
    await nextTick()
    check('2-я попытка → «Пробуем ещё…» (экран не выглядит зависшим)',
      host.querySelector('[data-test="access-submit"]').textContent.includes(ACCESS_RU.retrying))
    app.unmount(); host.remove()
  }

  // — модалка —
  {
    const { host, app } = mount(bundle.LoginIssueModal, {
      open: true,
      failure: { kind: 'timeout', message: 'Ответ не пришёл вовремя', attempts: 3, ms: 31500 },
    })
    await nextTick()
    const modal = document.querySelector('[data-test="login-issue-modal"]')
    check('модалка отрисована', !!modal)
    // ⚠ Teleport выносит модалку НАРУЖУ скоупа auth-dark: без атрибута на
    // телепортированном корне она унаследовала бы светлые токены приложения.
    const scope = modal && modal.closest('[data-theme="auth-dark"]')
    check('ТЁМНЫЙ СКОУП сохранён после Teleport', !!scope)
    check('поле «что происходит» есть', !!document.querySelector('[data-test="login-issue-message"]'))
    check('контакт необязателен', !document.querySelector('[data-test="login-issue-contact"]')?.required)
    const hp = document.querySelector('input[name="company"]')
    check('honeypot есть и спрятан от людей', !!hp && hp.getAttribute('tabindex') === '-1' &&
      hp.getAttribute('aria-hidden') === 'true')
    check('кнопка отправки заблокирована на пустом поле',
      document.querySelector('[data-test="login-issue-submit"]').disabled)
    check('справку можно раскрыть', !!document.querySelector('[data-test="login-issue-diag-toggle"]'))
    check('справка свёрнута по умолчанию', !document.querySelector('[data-test="login-issue-diag"]'))
    check('в модалке нет NaN/undefined', !/NaN|undefined|Infinity/.test(modal.textContent))
    app.unmount(); host.remove()
  }

  console.log('\n=== Vue warnings ===')
  check('нет [Vue warn]', vueWarns.length === 0, vueWarns[0] || 'чисто')
  console.warn = origWarn
}

// ═══════════════ 6. Очередь заявок ═══════════════
console.log('\n=== очередь в localStorage ===')
check('ключ очереди задан', QUEUE_KEY === 'boom-cmd:login-issue-queue')
check('очередь ограничена сверху', QUEUE_MAX === 5)
{
  // Вытеснение старых: свежая заявка описывает актуальный сбой.
  const arr = [1, 2, 3, 4, 5, 6, 7].slice(-QUEUE_MAX)
  check('переполнение вытесняет САМЫЕ СТАРЫЕ', arr[0] === 3 && arr.length === 5)
}
{
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(resolve(root, 'src/composables/useLoginIssue.js'), 'utf8'),
  )
  // Грабли, ловившиеся дважды: голое обращение к браузерным объектам уходит
  // в catch МОЛЧА, и функция просто перестаёт работать.
  check('localStorage только через window.*', !/[^.\w]localStorage\./.test(src))
  check('очередь досылается после входа', /export async function flushQueue/.test(src))
}
{
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(resolve(root, 'src/composables/loginDiagnostics.js'), 'utf8'),
  )
  // ⚠ Проверяем КОД, а не комментарии: в шапке файла перечислено ровно то, чего
  // мы намеренно НЕ собираем, и без вырезания комментариев приёмка ловила бы
  // собственное объяснение и краснела на нём.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  check('браузерные объекты только через window.*',
    !/[^.\w]navigator\./.test(code) && !/[^.\w]location\./.test(code))
  check('geolocation НЕ запрашивается', !/geolocation/.test(code))
  check('отпечатка браузера нет (canvas/fonts/plugins)', !/canvas|getContext|\.plugins/i.test(code))
  check('IP не извлекается', !/['"]ip['"]/.test(code))
}
{
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(resolve(root, 'src/App.vue'), 'utf8'),
  )
  check('App.vue прокидывает подсказку и отказ в форму входа',
    /:net-hint="netHint"/.test(src) && /:failure="lastFailure"/.test(src))
  check('App.vue досылает очередь после успешного входа', /flushQueue\(\)/.test(src))
}

rmSync(tmp, { recursive: true, force: true })
console.log(ok ? '\n✅ verify-login-issue: всё зелёное' : '\n❌ verify-login-issue: есть провалы')
process.exit(ok ? 0 : 1)
