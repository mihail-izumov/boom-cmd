// Приёмка «Что было в парке сегодня» — комментарий управляющей к «Сигналу Дня»
// (NET-235, D-188). Запуск: `node scripts/verify-signal-comment.mjs`
//
// Три слоя:
//   1) ЧИСТЫЕ ФУНКЦИИ (src/composables/signalComments.js) — нормализация и обрезка текста,
//      контракт тела запроса, разбор ответа и отказов, журнал «последние три», подписи.
//   2) ЖИВОЙ РЕНДЕР В JSDOM — поле в карточке «Сигнал Дня», порядок блоков, кнопка,
//      успех / сеть / отказ бэка, независимость от отметки и оценки, черновик.
//   3) КОНТРАСТ формулой WCAG и сторожа вёрстки под 375 px (jsdom не считает раскладку,
//      поэтому ширина проверяется по классам; глазами — скриншотом в отчёте).

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  COMMENT_MAX, COMMENT_LOG_MAX, COMMENT_COUNTER_FROM, normalizeComment, clipComment, canSendComment,
  buildSignalCommentBody, postSignalComment, sentEntry, sentLabel, pushCommentLog, commentsFor, commentKey,
} from '../src/composables/signalComments.js'
import { computeDaily } from '../src/composables/dailyModel.js'
import { L } from '../src/i18n/daily.js'
import { NET_HINTS } from '../src/i18n/net.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

let ok = true
let pass = 0
let fail = 0
const check = (label, cond, got) => {
  ok = ok && !!cond
  if (cond) pass++; else fail++
  console.log(`${cond ? '✓' : '✗'}  ${label}${got !== undefined ? `  (${got})` : ''}`)
}

// ═══════════════ 1. Чистые функции ═══════════════
console.log('=== текст: нормализация, обрезка, «можно отправить» ===')
check('края обрезаны, середина и переносы целы', normalizeComment('  раз\r\nдва  \n') === 'раз\nдва')
check('null/undefined → пусто', normalizeComment(null) === '' && normalizeComment(undefined) === '')
check('пустое поле — нельзя', canSendComment('') === false)
check('одни пробелы и переносы — нельзя', canSendComment('  \n\t ') === false)
check('текст есть — можно', canSendComment('очередь') === true)
check('текст есть, но идёт отправка — нельзя (двойное нажатие)', canSendComment('очередь', true) === false)
check('лимит совпадает со скриптом (1000)', COMMENT_MAX === 1000)
check('1500 знаков → 1000', clipComment('я'.repeat(1500)).length === 1000)
const emoji = 'б'.repeat(999) + '😀' + 'хвост'
check('разрез на эмодзи: половинки суррогатной пары нет',
  clipComment(emoji).length === 999 && !/[\uD800-\uDBFF]$/.test(clipComment(emoji)))

console.log('\n=== тело запроса: новый вид signal_comment, signal_read не тронут ===')
const body = buildSignalCommentBody('K', 'ohta', '2026-10-15', '  Праздник в ТЦ  ')
check('ровно шесть полей по заданию §А.5',
  JSON.stringify(Object.keys(body)) === JSON.stringify(['key', 'action', 'park', 'signal_date', 'comment', 'source']),
  Object.keys(body).join(','))
check('action = signal_comment, type не шлём (это не signal_read)', body.action === 'signal_comment' && !('type' in body))
check('source = front, score нет', body.source === 'front' && !('score' in body))
check('comment уходит обрезанным по краям', body.comment === 'Праздник в ТЦ')
check('длинный текст уходит не длиннее 1000', buildSignalCommentBody('K', 'ohta', '2026-10-15', 'ж'.repeat(1200)).comment.length === 1000)

console.log('\n=== разбор ответа и отказов ===')
const resp = (status, obj, bad = false) => async () => ({
  ok: status >= 200 && status < 300, status, json: async () => { if (bad) throw new Error('html'); return obj },
})
{
  const r = await postSignalComment({ api: 'x', key: 'K', park: 'ohta', signalDate: '2026-10-15', comment: 'т',
    fetchImpl: resp(200, { ok: true, commented_msk: '2026-10-16 14:32:05', truncated: false }) })
  check('успех → время бэка', r.msk === '2026-10-16 14:32:05' && r.truncated === false)
  const catchOf = async (fetchImpl) => {
    try { await postSignalComment({ api: 'x', key: 'K', park: 'ohta', signalDate: '2026-10-15', comment: 'т', fetchImpl }); return null } catch (e) { return e }
  }
  const e1 = await catchOf(resp(200, { ok: false, error: 'bad date' }))
  check('старый скрипт (bad date) → ошибка, НЕ повторяемая', !!e1 && e1.message === 'bad date' && e1.retriable === false)
  const e2 = await catchOf(async () => { throw new TypeError('Failed to fetch') })
  check('сеть отвалилась → ошибка транспорта (повторяемая — для подсказки про VPN)', !!e2 && e2.retriable === true)
  const e3 = await catchOf(resp(503, {}))
  check('5xx → повторяемая', !!e3 && e3.retriable === true)
  const e4 = await catchOf(resp(200, null, true))
  check('вместо JSON страница → повторяемая', !!e4 && e4.retriable === true)
  const e5 = await catchOf(resp(200, { ok: false, error: 'empty comment' }))
  check('пустой комментарий на бэке → отказ с его словами', !!e5 && e5.message === 'empty comment')
}

console.log('\n=== журнал «последние три» и подпись «Отправлено ЧЧ:ММ» ===')
{
  const now = new Date(2026, 9, 16, 15, 0, 0)
  const e = sentEntry('  Очередь  ', '2026-10-16 14:32:05', now)
  check('время — из ответа бэка, не с часов телефона', e.time === '14:32' && e.day === '2026-10-16')
  check('текст записи = то, что ушло', e.text === 'Очередь')
  check('сегодня → «Отправлено 14:32»', sentLabel(e, now, 'Отправлено') === 'Отправлено 14:32')
  check('вчера → с датой, чтобы время не читалось сегодняшним',
    sentLabel({ ...e, day: '2026-10-15' }, now, 'Отправлено') === 'Отправлено 15.10, 14:32')
  const devFallback = sentEntry('т', '', now)
  check('бэк без времени (dev) → часы устройства', devFallback.time === '15:00' && devFallback.day === '2026-10-16')
  let map = {}
  for (let i = 1; i <= 5; i++) map = pushCommentLog(map, 'ohta', '2026-10-15', { ...e, text: `№${i}`, ts: i })
  const list = commentsFor(map, 'ohta', '2026-10-15')
  check(`хранится не больше ${COMMENT_LOG_MAX}, новые сверху`, list.map((x) => x.text).join(',') === '№5,№4,№3', list.map((x) => x.text).join(','))
  check('другой сигнал — свой журнал', commentsFor(map, 'ohta', '2026-10-14').length === 0)
  check('другой парк — свой журнал', commentsFor(map, 'iyun', '2026-10-15').length === 0)
  check('ключ пары = park:date', commentKey('ohta', '2026-10-15') === 'ohta:2026-10-15')
}

// ═══════════════ 2. jsdom ═══════════════
// ⚠ jsdom поднимается ДО первого импорта vue (runtime-dom ловит document один раз).
console.log('\n=== jsdom: сборка тестового бандла ===')
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://b00m-cmd.ru/', pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
// `Document` и `ShadowRoot` нужны v-model на <textarea>: в beforeUpdate Vue проверяет
// `rootNode instanceof Document` — без глобали падает на первом же вводе текста.
for (const g of ['Element', 'SVGElement', 'MathMLElement', 'Node', 'HTMLElement', 'Document', 'ShadowRoot']) {
  if (dom.window[g]) globalThis[g] = dom.window[g]
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)

// Временная сборка — в docs/ (папка в .gitignore): прерванный прогон не попадёт в коммит.
const tmp = resolve(root, 'docs/.tmp-verify-signal-comment')
try { rmSync(tmp, { recursive: true, force: true }) } catch { /* среда без удаления — перезапишется */ }
mkdirSync(tmp, { recursive: true })
writeFileSync(resolve(tmp, 'entry.js'), `
export { default as DailySignalCard } from '${root}/src/components/daily/DailySignalCard.vue'
export { default as SignalCommentBox } from '${root}/src/components/daily/SignalCommentBox.vue'
export { useAccessKey } from '${root}/src/composables/useAccessKey.js'
export { useSignalRead } from '${root}/src/composables/useSignalRead.js'
`)
const { build } = await import('vite')
const vuePlugin = (await import('@vitejs/plugin-vue')).default
await build({
  configFile: false, // ⚠ иначе корневой vite.config.js подключит plugin-vue второй раз
  root,
  logLevel: 'error',
  plugins: [vuePlugin()],
  define: {
    'import.meta.env.VITE_REPORT_API': JSON.stringify('https://mock.invalid/report'),
    'import.meta.env.VITE_PROJECTS_API': JSON.stringify('https://mock.invalid/gate'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: { entry: resolve(tmp, 'entry.js'), formats: ['es'], fileName: 'bundle' },
    outDir: tmp, emptyOutDir: false, minify: false,
    rollupOptions: { external: ['vue'] },
  },
})
console.log('✓  lib-сборка готова')

// Мок сети. GET — гейт «ок». POST — сценарий commentMode для комментариев и «всё
// записано» для отметок. Ответ комментария — ТОТ ЖЕ контракт, что отдаёт скрипт v3.23
// (эмулятор контура данных gas-emulator-comments.mjs проверяет его с той стороны).
let commentMode = 'ok' // 'ok' | 'neterror' | 'reject' | 'hang'
let release = null
const posts = []
globalThis.fetch = async (url, opts = {}) => {
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj })
  if ((opts.method || 'GET') !== 'POST') return json({})
  const sent = JSON.parse(String(opts.body || '{}'))
  posts.push(sent)
  if (sent.action === 'signal_comment') {
    if (commentMode === 'neterror') throw new TypeError('Failed to fetch')
    if (commentMode === 'reject') return json({ ok: false, error: 'bad date' })
    if (commentMode === 'hang') await new Promise((r) => { release = r })
    return json({ ok: true, commented_at: '2026-10-16T14:32:05+03:00', commented_msk: '2026-10-16 14:32:05', truncated: false, length: sent.comment.length })
  }
  return json({ ok: true, read: 'added', score: sent.score != null ? 'added' : null })
}
const vueWarns = []
const origWarn = console.warn
console.warn = (...a) => {
  const s = a.join(' ')
  if (s.includes('[Vue warn]')) vueWarns.push(s)
  else if (!s.startsWith('signal_comment failed') && !s.startsWith('signal_read failed')) origWarn(...a)
}

const bundle = await import(pathToFileURL(resolve(tmp, 'bundle.js')).href)
const { createApp, nextTick } = await import('vue')
const ak = bundle.useAccessKey()
await ak.submitKey('test-phrase')

const data = JSON.parse(readFileSync(resolve(root, 'src/data/daily.mock.json'), 'utf8'))
const mOhta = computeDaily(data.sets['ohta:2025-05'])
const latestDate = [...(mOhta.signals || data.sets['ohta:2025-05'].signals || [])]
  .map((s) => s.date).sort().pop()
const NOW = new Date(2025, 4, 16, 12, 0, 0)

function mount(comp, props) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(comp, props || {})
  app.config.warnHandler = (msg) => vueWarns.push(`[Vue warn] ${msg}`)
  app.mount(el)
  return { el, app }
}
const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); await nextTick() } }
async function typeIn(ta, value) {
  ta.value = value
  ta.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  await nextTick()
}
async function click(node) { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await settle() }
const q = (el, t) => el.querySelector(`[data-test="${t}"]`)
const commentPosts = () => posts.filter((p) => p.action === 'signal_comment')
const readPosts = () => posts.filter((p) => p.type === 'signal_read')

console.log('\n=== jsdom: поле в карточке «Сигнал Дня» ===')
{
  localStorage.clear(); bundle.useSignalRead().reloadOutbox(); posts.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW })
  await settle()
  const card = q(el, 'signal-card')
  const box = q(card, 'signal-comment')
  check('поле живёт внутри карточки «Сигнал Дня»', !!box)
  check('дата сигнала в моке найдена', !!latestDate, latestDate)
  check('подпись «Что было в парке сегодня»', box.textContent.includes('Что было в парке сегодня'))
  const ta = q(box, 'signal-comment-input')
  check('многострочное поле (textarea)', ta && ta.tagName === 'TEXTAREA')
  check('подсказка внутри поля — дословно по заданию',
    ta.getAttribute('placeholder') === 'Праздник в ТЦ, очередь, поломка, о чём спрашивали гости, что сработало из сигнала')
  check('до 1000 знаков (maxlength)', ta.getAttribute('maxlength') === '1000')
  check('подпись связана с полем (label for → id)', box.querySelector('label').getAttribute('for') === ta.id)
  const btn = q(box, 'signal-comment-send')
  check('под полем — кнопка «Отправить»', btn && btn.textContent.trim() === 'Отправить' &&
    (ta.compareDocumentPosition(btn) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
  check('пустое поле — кнопка неактивна', btn.disabled === true)
  const headline = card.querySelector('p.font-semibold')
  const mark = q(card, 'signal-read')
  check('поле ПОД текстом сигнала', (headline.compareDocumentPosition(box) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
  check('и ПОД кнопкой «Прочитать и оценить» — первым действием остаётся она',
    (mark.compareDocumentPosition(box) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
  check('кнопка отметки на карточке по-прежнему одна', card.querySelectorAll('[data-test="signal-read"]').length === 1)
  check('поле одно — только у свежего сигнала, не в ленте «Ранее»', el.querySelectorAll('[data-test="signal-comment"]').length === 1)
  await typeIn(ta, '   \n  ')
  check('одни пробелы — кнопка неактивна', btn.disabled === true)
  await typeIn(ta, 'Праздник в ТЦ, очередь к кассе')
  check('текст есть — кнопка активна', btn.disabled === false)
  check('счётчик знаков у короткого текста не шумит', !q(box, 'signal-comment-counter'))
  await click(btn)
  const sent = commentPosts()
  check('ушёл ровно один запрос signal_comment', sent.length === 1, sent.length)
  check('тело: парк и ДАТА СИГНАЛА, как в signal_read',
    sent[0] && sent[0].park === 'ohta' && sent[0].signal_date === latestDate && sent[0].key === 'test-phrase')
  check('тело: comment и source', sent[0] && sent[0].comment === 'Праздник в ТЦ, очередь к кассе' && sent[0].source === 'front')
  check('комментарий НЕ породил отметку прочтения', readPosts().length === 0)
  check('после отправки поле очищено', ta.value === '')
  check('кнопка снова неактивна (поле пустое)', btn.disabled === true)
  const rows = el.querySelectorAll('[data-test="signal-comment-sent-row"]')
  check('под полем — «Отправлено …» по времени бэка (день не сегодняшний → с датой)', rows.length === 1 && q(rows[0], 'signal-comment-sent-at').textContent.trim() === 'Отправлено 16.10, 14:32',
    rows[0] && q(rows[0], 'signal-comment-sent-at').textContent.trim())
  check('и текст отправленного', rows[0] && q(rows[0], 'signal-comment-sent-text').textContent === 'Праздник в ТЦ, очередь к кассе')
  check('состояние кнопки отметки не изменилось (idle)', mark.getAttribute('data-state') === 'idle')
  app.unmount(); el.remove()
}

console.log('\n=== jsdom: несколько раз за день, «последние три» ===')
{
  localStorage.clear(); posts.length = 0
  const NOW_TODAY = new Date(2026, 9, 16, 15, 0, 0)
  const { el, app } = mount(bundle.SignalCommentBox, { park: 'ohta', signalDate: '2026-10-15', now: NOW_TODAY })
  await settle()
  const ta = q(el, 'signal-comment-input'), btn = q(el, 'signal-comment-send')
  for (const t of ['раз', 'два', 'три', 'четыре']) { await typeIn(ta, t); await click(btn) }
  check('четыре «Отправить» — четыре запроса (каждое — отдельная запись)', commentPosts().length === 4)
  const texts = [...el.querySelectorAll('[data-test="signal-comment-sent-text"]')].map((n) => n.textContent)
  check('показаны последние три, новые сверху', texts.join(',') === 'четыре,три,два', texts.join(','))
  check('за сегодня — без даты: «Отправлено 14:32»',
    q(el, 'signal-comment-sent-at').textContent.trim() === 'Отправлено 14:32')
  app.unmount(); el.remove()
  const again = mount(bundle.SignalCommentBox, { park: 'ohta', signalDate: '2026-10-15', now: NOW_TODAY })
  await settle()
  check('журнал переживает перезагрузку (устройство)', again.el.querySelectorAll('[data-test="signal-comment-sent-row"]').length === 3)
  again.app.unmount(); again.el.remove()
  const other = mount(bundle.SignalCommentBox, { park: 'ohta', signalDate: '2026-10-16', now: NOW_TODAY })
  await settle()
  check('у нового сигнала журнал пустой — «за этот сигнал»', other.el.querySelectorAll('[data-test="signal-comment-sent-row"]').length === 0)
  other.app.unmount(); other.el.remove()
}

console.log('\n=== jsdom: ошибка сети и отказ бэка — текст остаётся ===')
{
  localStorage.clear(); posts.length = 0
  const { el, app } = mount(bundle.SignalCommentBox, { park: 'iyun', signalDate: '2026-10-15', now: NOW })
  await settle()
  const ta = q(el, 'signal-comment-input'), btn = q(el, 'signal-comment-send')
  commentMode = 'neterror'
  await typeIn(ta, 'Сломался автомат с игрушками')
  await click(btn)
  check('сеть: текст остался в поле', ta.value === 'Сломался автомат с игрушками')
  check('сеть: «Не отправилось, попробуйте ещё раз»', q(el, 'signal-comment-error') &&
    q(el, 'signal-comment-error').textContent.includes('Не отправилось, попробуйте ещё раз'))
  check('сеть: подсказка про связь/VPN', !!q(el, 'signal-comment-hint') &&
    [NET_HINTS.vpn, NET_HINTS.offline].includes(q(el, 'signal-comment-hint').textContent.trim()))
  check('сеть: в журнал отправленного не попало', !q(el, 'signal-comment-sent'))
  check('сеть: кнопка снова активна — можно нажать ещё раз', btn.disabled === false)
  check('сеть: ошибка объявляется скринридеру (role=alert)', q(el, 'signal-comment-error').getAttribute('role') === 'alert')
  commentMode = 'reject'
  await click(btn)
  check('отказ бэка (старый скрипт): текст остался', ta.value === 'Сломался автомат с игрушками')
  check('отказ бэка: сообщение то же, подсказки про VPN нет', !!q(el, 'signal-comment-error') && !q(el, 'signal-comment-hint'))
  await typeIn(ta, 'Сломался автомат с игрушками, мастер приедет завтра')
  check('правка текста снимает плашку ошибки', !q(el, 'signal-comment-error'))
  commentMode = 'ok'
  await click(btn)
  check('повтор после связи — ушло, поле пустое, плашки нет', ta.value === '' && !q(el, 'signal-comment-error') &&
    commentPosts().length === 3)
  app.unmount(); el.remove()
}

console.log('\n=== jsdom: двойное нажатие и состояние «Отправляем…» ===')
{
  localStorage.clear(); posts.length = 0
  const { el, app } = mount(bundle.SignalCommentBox, { park: 'piterland', signalDate: '2026-10-15', now: NOW })
  await settle()
  const ta = q(el, 'signal-comment-input'), btn = q(el, 'signal-comment-send')
  commentMode = 'hang'
  await typeIn(ta, 'Очередь в кассу')
  await click(btn)
  check('пока идёт запрос — «Отправляем…» и кнопка неактивна', btn.textContent.trim() === 'Отправляем…' && btn.disabled === true)
  await click(btn); await click(btn)
  check('двойное нажатие не шлёт второй запрос', commentPosts().length === 1)
  release(); await settle()
  check('ответ пришёл — поле очищено', ta.value === '' && btn.textContent.trim() === 'Отправить')
  commentMode = 'ok'
  app.unmount(); el.remove()
}

console.log('\n=== jsdom: черновик, длинный текст, счётчик, протухшая фраза ===')
{
  localStorage.clear(); posts.length = 0
  const first = mount(bundle.SignalCommentBox, { park: 'ohta', signalDate: '2026-10-15', now: NOW })
  await settle()
  await typeIn(q(first.el, 'signal-comment-input'), 'Набирала и ушла')
  first.app.unmount(); first.el.remove()
  const second = mount(bundle.SignalCommentBox, { park: 'ohta', signalDate: '2026-10-15', now: NOW })
  await settle()
  const ta = q(second.el, 'signal-comment-input'), btn = q(second.el, 'signal-comment-send')
  check('черновик вернулся в поле', ta.value === 'Набирала и ушла')
  await typeIn(ta, 'щ'.repeat(950))
  check(`счётчик знаков появляется от ${COMMENT_COUNTER_FROM}`, q(second.el, 'signal-comment-counter') &&
    q(second.el, 'signal-comment-counter').textContent.trim() === '950 из 1000')
  await typeIn(ta, 'щ'.repeat(1200)) // программная вставка maxlength не соблюдает — страхуется тело
  await click(btn)
  check('в запрос ушло не больше 1000 знаков', commentPosts()[0] && commentPosts()[0].comment.length === 1000)
  second.app.unmount(); second.el.remove()
  const third = mount(bundle.SignalCommentBox, { park: 'ohta', signalDate: '2026-10-15', now: NOW })
  await settle()
  check('после успешной отправки черновик очищен', q(third.el, 'signal-comment-input').value === '')
  // Фраза протухла: запроса нет, черновик цел — после входа поле его вернёт.
  await typeIn(q(third.el, 'signal-comment-input'), 'Без фразы')
  ak.logout()
  posts.length = 0
  await click(q(third.el, 'signal-comment-send'))
  check('без фразы доступа запрос не уходит', commentPosts().length === 0)
  check('без фразы черновик сохранён на устройстве',
    JSON.parse(localStorage.getItem('bc:daily:signal_comment_draft') || '{}')['ohta:2026-10-15'] === 'Без фразы')
  third.app.unmount(); third.el.remove()
  await ak.submitKey('test-phrase')
}

console.log('\n=== jsdom: независимость от отметки и оценки ===')
{
  localStorage.clear(); bundle.useSignalRead().reloadOutbox(); posts.length = 0
  const { el, app } = mount(bundle.DailySignalCard, { m: mOhta, now: NOW })
  await settle()
  const ta = q(el, 'signal-comment-input'), btn = q(el, 'signal-comment-send')
  await typeIn(ta, 'До оценки'); await click(btn)
  check('до оценки — ушло', commentPosts().length === 1 && readPosts().length === 0)
  // Оценка: открыть шкалу, сдвинуть, отправить.
  await click(q(el, 'signal-read'))
  const sheet = document.body.querySelector('[data-test="signal-rate-sheet"]') || document.body.querySelector('[role="dialog"]')
  const slider = document.body.querySelector('[data-test="signal-rate-slider"]')
  check('шкала оценки открылась как раньше', !!sheet && !!slider)
  slider.value = '7'; slider.dispatchEvent(new dom.window.Event('input', { bubbles: true })); await nextTick()
  await click(document.body.querySelector('[data-test="signal-rate-submit"]'))
  await bundle.useSignalRead().flush({ force: true }); await settle()
  check('оценка ушла своим запросом signal_read (с score), без comment',
    readPosts().length === 1 && readPosts()[0].score === 7 && !('comment' in readPosts()[0]))
  await typeIn(ta, 'После оценки'); await click(btn)
  check('после оценки — ушло, ещё один signal_comment', commentPosts().length === 2)
  check('ни в одном теле комментария нет score/type', commentPosts().every((p) => !('score' in p) && !('type' in p)))
  app.unmount(); el.remove()
}

check('без [Vue warn]', vueWarns.length === 0, vueWarns.slice(0, 2).join(' | '))

// ═══════════════ 3. Контраст (WCAG) и вёрстка 375 px ═══════════════
console.log('\n=== контраст формулой WCAG (токены из main.css) ===')
const css = readFileSync(resolve(root, 'src/styles/main.css'), 'utf8')
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
const tok = (name) => (rootBlock.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`)) || [])[1]
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const mix = (a, b, p) => '#' + hex(a).map((x, i) => Math.round((x * p + hex(b)[i] * (1 - p)) * 255).toString(16).padStart(2, '0')).join('')
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
const T = { text: tok('text'), sec: tok('text-secondary'), muted: tok('text-muted'), ph: tok('placeholder'), surface: tok('surface'),
  ink: tok('ink-on-color'), neg: tok('negative'), pos: tok('positive'), warn: tok('warning') }
check('токены прочитаны из main.css', Object.values(T).every(Boolean), JSON.stringify(T))
// Самый тёмный тинт карточки — 12 % статуса на --surface (signalTint); считаем все три.
const tints = { ok: mix(T.pos, T.surface, 0.12), warn: mix(T.warn, T.surface, 0.12), focus: mix(T.neg, T.surface, 0.12) }
const minOver = (fg) => Math.min(...Object.values(tints).map((t) => ratio(fg, t)))
const r2 = (x) => x.toFixed(2)
check('подпись поля --text на любом тинте ≥ 4,5:1', minOver(T.text) >= 4.5, r2(minOver(T.text)))
check('кант поля --text-muted на любом тинте ≥ 3:1 (WCAG 1.4.11)', minOver(T.muted) >= 3, r2(minOver(T.muted)))
check('текст в поле --text на --surface ≥ 4,5:1', ratio(T.text, T.surface) >= 4.5, r2(ratio(T.text, T.surface)))
check('подсказка --placeholder на --surface ≥ 4,5:1', ratio(T.ph, T.surface) >= 4.5, r2(ratio(T.ph, T.surface)))
check('кнопка: белый текст на тёмной плашке ≥ 4,5:1', ratio(T.ink, T.text) >= 4.5, r2(ratio(T.ink, T.text)))
check('тёмная плашка кнопки отделяется от любого тинта ≥ 3:1', minOver(T.text) >= 3, r2(minOver(T.text)))
check('неактивная кнопка: --text-secondary на --surface ≥ 4,5:1', ratio(T.sec, T.surface) >= 4.5, r2(ratio(T.sec, T.surface)))
check('счётчик --text-secondary на любом тинте ≥ 4,5:1', minOver(T.sec) >= 4.5, r2(minOver(T.sec)))
const errBg = mix(T.neg, T.surface, 0.12)
check('плашка ошибки: --text ≥ 4,5:1', ratio(T.text, errBg) >= 4.5, r2(ratio(T.text, errBg)))
check('плашка ошибки: подсказка --text-secondary ≥ 4,5:1', ratio(T.sec, errBg) >= 4.5, r2(ratio(T.sec, errBg)))
check('отправленное: подпись --text-secondary на --surface ≥ 4,5:1', ratio(T.sec, T.surface) >= 4.5, r2(ratio(T.sec, T.surface)))

console.log('\n=== вёрстка под 375 px и HIG (по исходнику; глазами — скриншот в отчёте) ===')
const src = readFileSync(resolve(root, 'src/components/daily/SignalCommentBox.vue'), 'utf8')
const tpl = src.slice(src.indexOf('<template>'))
const code = src.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
check('поле во всю ширину (block w-full)', /const FIELD = '[^']*block w-full/.test(code))
check('кнопка во всю ширину (w-full)', /const BTN = '[^']*w-full/.test(code))
check('шрифт поля 16px — Safari на iPhone не приближает страницу при фокусе', /const FIELD = [\s\S]*?text-\[1rem\]/.test(code))
check('кнопка — тач-таргет ≥ 44pt', tpl.includes('min-height: 44px'))
check('ни одной фиксированной ширины в пикселях', !/\b(?:w|min-w|max-w)-\[\d+px\]/.test(code))
check('длинное слово/ссылка в отправленном переносится, а не распирает карточку', tpl.includes('[overflow-wrap:anywhere]') && tpl.includes('min-w-0'))
check('хардкода hex в компоненте нет', !/#[0-9A-Fa-f]{3,8}\b/.test(code))
check('браузерные объекты — только через window.*',
  !/(?<![.\w])(localStorage|sessionStorage|location)\./.test(readFileSync(resolve(root, 'src/composables/signalComments.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '')))
check('в компоненте нет приведения оценки и нет связи с очередью отметок',
  !/score/.test(code) && !/useSignalRead|enqueue/.test(code))

console.log(`\n${ok ? '✓ ВСЁ ЗЕЛЁНОЕ' : '✗ ЕСТЬ КРАСНОЕ'}: ${pass} ✓, ${fail} ✗`)
process.exit(ok ? 0 : 1)
