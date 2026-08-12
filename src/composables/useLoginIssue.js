import { ref } from 'vue'
import {
  RETRY_DELAYS_MS, isRetriableStatus, failure, fetchWithTimeout, transportFailure, runWithRetries,
} from './netPolicy.js'
import { collectDiagnostics } from './loginDiagnostics.js'

// Заявка «Проблемы со входом» (D-22) → отдельный Apps Script `boom-support`.
//
// ── ПОЧЕМУ ОТДЕЛЬНЫЙ ЭНДПОЙНТ, А НЕ ВЕТКА В БОЕВОМ boom-daily ──
// Заявку подаёт человек, который ВОЙТИ НЕ СМОГ. Значит принимающая ветка обязана
// работать БЕЗ ключа доступа — а `doPost` дневного слоя начинается с
// `reportKeyOk_` и имеет доступ к дневной таблице. Публичный вход без ключа в
// том же скрипте означал бы, что незащищённая ветка живёт вплотную к боевым
// данным; вдобавок правка boom-daily требует ручной посадки полного файла
// владельцем (регламент §5 CHANGELOG). Изолированный скрипт снимает оба риска:
// у него нет ни ключей, ни доступа к дневной таблице — только лист приёма.
//
// ── ЧЕСТНОЕ ОГРАНИЧЕНИЕ ──
// `boom-support` живёт на том же `script.google.com`, что и источник данных.
// Если Google недоступен целиком (ровно частый случай VPN/ДПИ), заявка тоже не
// уйдёт с первой попытки. Поэтому здесь ОЧЕРЕДЬ: не отправленная заявка ложится
// в localStorage и уходит при следующем запуске приложения — том самом, когда
// человек уже вошёл. Это единственный способ получить жалобу именно от тех,
// у кого связи не было; без очереди мы бы систематически теряли самые важные
// случаи и видели только лёгкие.
//
// Очередь ЖИВЁТ В localStorage сознательно, вопреки общему правилу «фраза
// доступа только в памяти»: тут нет ни ключа, ни персональных данных — только
// техническая справка и текст жалобы, и её ценность в том, чтобы пережить
// перезагрузку. Сама фраза доступа сюда не попадает ни при каких условиях.

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_SUPPORT_API) ||
  ''

export const MESSAGE_MAX = 1000
export const CONTACT_MAX = 120
// Больше пяти не храним: очередь — страховка от потери жалобы, а не архив.
// Переполнение вытесняет САМЫЕ СТАРЫЕ: свежая заявка описывает актуальный сбой.
export const QUEUE_MAX = 5
export const QUEUE_KEY = 'boom-cmd:login-issue-queue'

const isDev =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

/** Обрезка по краям + жёсткий потолок длины. ЧИСТАЯ функция — проверяется приёмкой. */
export function normalizeText(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max)
}

/**
 * Тело запроса. Отдельной функцией — по образцу buildConnectBody: приёмке нужно
 * проверять КОНТРАКТ, а не перехватывать fetch внутри компонента.
 *
 * `hp` — honeypot. Поле есть в разметке, спрятано от людей и заполняется только
 * ботами; бэк на непустом `hp` отвечает `ok:true` и молча выбрасывает запрос.
 * Нужен, потому что эндпойнт публичный по построению: ключа у него нет и быть
 * не может, а значит единственная защита от мусора — форма запроса.
 */
export function buildIssueBody({ message, contact, diag, source = 'login' }) {
  return {
    action: 'login_issue',
    message: normalizeText(message, MESSAGE_MAX),
    contact: normalizeText(contact, CONTACT_MAX),
    hp: '',
    source,
    diag: diag || {},
  }
}

/** ⚠ localStorage только через window.* — голое обращение уходит в catch МОЛЧА. */
function readQueue() {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function writeQueue(arr) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(arr.slice(-QUEUE_MAX)))
    return true
  } catch {
    // Приватный режим Safari или переполненное хранилище. Заявку мы уже не
    // спасём, но и падать нельзя: человек и так на экране, который его не пускает.
    return false
  }
}

export function queueSize() {
  return readQueue().length
}

/** Одна попытка: запрос → статус → JSON → контракт {ok:true}. */
async function attemptOnce(url, body) {
  let res
  try {
    // БЕЗ заголовка Content-Type — «простой» запрос без CORS-preflight:
    // Apps Script на OPTIONS не отвечает (тот же приём, что в useReport).
    res = await fetchWithTimeout(url, { method: 'POST', body, redirect: 'follow' })
  } catch (e) {
    throw transportFailure(e)
  }
  if (!res.ok) throw failure(`Источник недоступен (${res.status})`, isRetriableStatus(res.status))
  let json
  try {
    json = await res.json()
  } catch {
    throw failure('Ответ не разобран', true)
  }
  if (!json || json.ok !== true) throw failure(json?.error || 'Отказ бэка', false)
  return json
}

async function send(body) {
  return runWithRetries(() => attemptOnce(API, JSON.stringify(body)), {
    onRetry: (n, e) => {
      if (typeof console !== 'undefined') {
        console.warn(`login issue retry ${n}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
      }
    },
  })
}

/**
 * Досылка накопленных заявок. Вызывается из App.vue ПОСЛЕ успешного входа —
 * то есть в момент, когда связь заведомо есть. Тихая: человек уже внутри и
 * про свою вчерашнюю жалобу не вспоминает, дёргать его нечем.
 * Одна неудача останавливает разбор очереди целиком: если сеть снова легла,
 * долбить её оставшимися заявками бессмысленно.
 */
export async function flushQueue() {
  if (!API) return 0
  const queue = readQueue()
  if (!queue.length) return 0
  let sentCount = 0
  for (const item of queue) {
    try {
      await send({ ...item, source: 'queue' })
      sentCount++
    } catch {
      break
    }
  }
  writeQueue(queue.slice(sentCount))
  return sentCount
}

export function useLoginIssue() {
  const sending = ref(false)
  const sent = ref(false) // ушла прямо сейчас
  const queued = ref(false) // не ушла, но сохранена и уйдёт позже
  const sendError = ref(false) // не ушла и сохранить не удалось — единственный настоящий провал
  const diag = ref(null) // техническая справка, собранная при открытии модалки
  const collecting = ref(false)

  /**
   * Собрать справку. Вызывается при ОТКРЫТИИ модалки, а не при каждом отказе
   * входа: пробы — это сетевые запросы, и делать их фоном на каждую неудачную
   * попытку значит шуметь в сети, которая уже больна.
   */
  async function collect(failure) {
    collecting.value = true
    try {
      diag.value = await collectDiagnostics(failure)
    } catch {
      diag.value = null
    } finally {
      collecting.value = false
    }
    return diag.value
  }

  async function submit({ message, contact }) {
    if (sending.value) return false
    const text = normalizeText(message, MESSAGE_MAX)
    if (!text) return false
    sendError.value = false
    queued.value = false
    sending.value = true
    const body = buildIssueBody({ message: text, contact, diag: diag.value })
    try {
      if (!API) {
        if (isDev) {
          await new Promise((r) => setTimeout(r, 400))
          sent.value = true
          return true
        }
        throw new Error('Источник отправки не настроен')
      }
      await send(body)
      sent.value = true
      return true
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('login issue failed:', e)
      // ГЛАВНАЯ ВЕТКА, а не запасная: у человека, который жалуется на отсутствие
      // связи, отправка «здесь и сейчас» проваливается ЗАКОНОМЕРНО. Сохранённая
      // заявка — это успех с точки зрения задачи, и говорить о ней надо так же.
      const ok = writeQueue([...readQueue(), body])
      queued.value = ok
      sendError.value = !ok
      return ok
    } finally {
      sending.value = false
    }
  }

  function reset() {
    sent.value = false
    queued.value = false
    sendError.value = false
    diag.value = null
  }

  return { sending, sent, queued, sendError, diag, collecting, collect, submit, reset }
}
