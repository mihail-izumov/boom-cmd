import { ref } from 'vue'
import { useAccessKey } from './useAccessKey.js'
import {
  postSignalRead, loadOutbox, saveOutbox, findItem, enqueueRead, dropItem,
  resolveItem, isPermanentError, backoffMs,
  loadReadStore, saveReadStore, markState,
  loadScoreEcho, saveScoreEcho, setScoreEcho, echoScore,
} from './dailySignals.js'

// Отметка «Прочитал» + оценка пользы «Сигнала Дня». ЕДИНСТВЕННАЯ пишущая операция
// фронта — POST signal_read в inbox-канал (VITE_REPORT_API). read-only не нарушаем.
//
// ЧТО ИЗМЕНИЛОСЬ (2026-08-04). Раньше это был одноразовый выстрел: упал — намерение
// потеряно, `postError` жил в памяти компонента и не переживал перезагрузку. Плюс
// ответ бэка не читался: поля `read`/`score` выбрасывались, и «оценка не записалась»
// было неотличимо от успеха. Теперь:
//   • намерение лежит в очереди на устройстве, пока бэк его не подтвердит;
//   • ответ бэка разбирается — недоехавшая половина досылается отдельно;
//   • состояние ОБЩЕЕ на модуль (не на экземпляр компонента): кнопок теперь много —
//     свежий сигнал и каждая строка ленты, — и все они смотрят в одну очередь.
//
// Ключ доступа в очередь НЕ кладём (константа §4: фраза живёт только в памяти вкладки).
// Протух — отправка откладывается, приложение уводит на экран входа; после повторного
// ввода фразы очередь уходит сама.

const API =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_REPORT_API) || ''
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

// Очередь и «подтверждено в этой сессии» — на уровень модуля, один экземпляр на всё
// приложение. queue.value пересоздаётся целиком, чтобы vue видел изменение.
const queue = ref(loadOutbox())
const confirmed = ref({}) // 'park:date' → true, подтверждено бэком в этой сессии
// Эхо ЗАПИСАННОЙ оценки: 'park:date' → целое 0–10. Переживает перезагрузку (лежит
// на устройстве) и живёт до тех пор, пока проекция бэка не привезёт то же значение.
const echo = ref(loadScoreEcho())
const flushing = ref(false)

const keyOf = (park, date) => `${park}:${date}`
function persistQueue(next) {
  queue.value = next
  saveOutbox(next)
}

// Подтверждение бэком — ЕДИНСТВЕННЫЙ момент, когда прочтение фиксируется на
// устройстве. Раньше локальный статус 'read' писался в момент нажатия, ещё до ответа:
// упавший запрос оставлял человека с «Прочитано ✓» на экране и пустотой в контуре B.
// `score` — значение, про которое бэк сказал 'added'|'updated', иначе null. Эхо
// пишем только тогда: «Ваша оценка: 7» на экране обязано означать записано, а не
// отправлено. null сюда приходит и в штатном случае (отметили без оценки) — прежнее
// эхо в этом случае НЕ трём: read-only повтор не отменяет ранее записанную оценку.
function confirm_(park, date, score = null) {
  confirmed.value = { ...confirmed.value, [keyOf(park, date)]: true }
  const store = loadReadStore()
  markState(store, park, date, 'read')
  saveReadStore(store)
  if (score === null || score === undefined) return
  echo.value = setScoreEcho(echo.value, park, date, score)
  saveScoreEcho(echo.value)
}

let timer = null
function scheduleFlush(ms) {
  if (typeof setTimeout === 'undefined') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; flush() }, ms)
}

// Отправка ПОСЛЕДОВАТЕЛЬНАЯ, не параллельная: бэк держит ScriptLock, параллельные
// запросы всё равно встанут в очередь на его стороне — но уже с риском отвалиться
// по таймауту лока и получить искусственный busy.
// force=true — не ждать бэкофф. Возврат связи и возврат вкладки из фона это ровно
// тот сигнал, ради которого бэкофф и отменяют: обстоятельства изменились.
async function flush({ fetchImpl, force = false } = {}) {
  if (flushing.value) return
  if (!queue.value.length) return
  const { getKey, logout } = useAccessKey()

  if (!API) {
    if (!isDev) return // prod без URL — отправлять некуда, элементы ждут
    // DEV-заглушка. Раньше она молча «успешно отмечала» — любая preview-сборка с
    // DEV=true съедала отметки, и об этом никто не узнавал. Теперь громко в консоль.
    if (typeof console !== 'undefined') {
      console.info('[signal_read] DEV без VITE_REPORT_API: отправка имитируется, в контур B ничего не уходит')
    }
    queue.value.forEach((i) => confirm_(i.park, i.signal_date))
    persistQueue([])
    return
  }

  const key = getKey()
  if (!key) {
    // Ключ протух. Не бросаем исключение — элемент уже в очереди и никуда не денется;
    // приводим к тому же паттерну, что useDaily.js (там это единственно верный ответ).
    logout()
    return
  }

  flushing.value = true
  try {
    const now = Date.now()
    for (const item of queue.value.slice()) {
      if (item.dead) continue
      if (!force && item.attempts > 0 && now < item.next_try) continue
      try {
        const res = await postSignalRead({
          api: API, key, park: item.park, signalDate: item.signal_date,
          score: item.score, fetchImpl,
        })
        // Эхо — только по слову бэка о ЗАПИСИ оценки. 'failed'/'rejected'/null сюда
        // не проходят: это состояние долга, а не подтверждения.
        const written = res.score === 'added' || res.score === 'updated' ? item.score : null
        confirm_(item.park, item.signal_date, written)
        const verdict = resolveItem(item, res)
        const patch = (extra) => persistQueue(queue.value.map((i) => (
          i.park === item.park && i.signal_date === item.signal_date ? { ...i, ...extra } : i)))
        if (verdict.action === 'done') {
          persistQueue(dropItem(queue.value, item.park, item.signal_date))
        } else if (verdict.action === 'dead') {
          patch({ dead: true, read_ok: true, last_error: verdict.error })
        } else {
          // Прочтение доехало, оценка нет — досылаем только её.
          patch({
            read_ok: true, attempts: item.attempts + 1, last_error: verdict.error,
            next_try: Date.now() + backoffMs(item.attempts + 1),
          })
        }
      } catch (e) {
        const msg = e?.message || 'не удалось отправить'
        // Постоянная ошибка — тело запроса не станет валиднее само, повторять вечно
        // бессмысленно. Показываем человеку и снимаем с активной отправки.
        const dead = isPermanentError(msg)
        persistQueue(queue.value.map((i) => (i.park === item.park && i.signal_date === item.signal_date
          ? { ...i, attempts: i.attempts + 1, last_error: msg, dead, next_try: Date.now() + backoffMs(i.attempts + 1) } : i)))
        if (typeof console !== 'undefined') console.warn('signal_read failed:', msg)
        if (!dead) break // сеть отвалилась — остальные элементы не мучаем
      }
    }
  } finally {
    flushing.value = false
  }
  const alive = queue.value.filter((i) => !i.dead)
  if (alive.length) scheduleFlush(backoffMs(Math.min(...alive.map((i) => i.attempts)) + 1))
}

// Подписки на «связь появилась» и «вкладку вернули из фона» — ставим один раз.
let wired = false
function wire() {
  if (wired || typeof window === 'undefined') return
  wired = true
  window.addEventListener('online', () => flush({ force: true }))
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') flush({ force: true })
    })
  }
  if (queue.value.length) scheduleFlush(0) // недосланное с прошлого захода
}

export function useSignalRead() {
  wire()

  // Состояние пары (парк, дата сигнала) для UI. Три состояния кнопки вместо двух —
  // без «отправляется» нельзя одновременно выполнить два требования: гасить кнопку
  // сразу (чтобы нажатие не потерялось) и не врать «✓» до подтверждения бэка.
  //   'idle'       — не отмечено;
  //   'sending'    — лежит в очереди, ответа нет;
  //   'retry'      — попытка не прошла (связь), ждём следующую; человек об этом знает;
  //   'score-debt' — прочтение записано, оценка не сохранилась, досылаем;
  //   'failed'     — повторять бессмысленно, показать человеку;
  //   'done'       — подтверждено бэком.
  //
  // 'retry' отделён от 'sending' намеренно (NET-61 §2.2). Раньше сорвавшаяся отправка
  // выглядела ровно как идущая: кнопка гасла и молчала, а очередь тихо ждала бэкофф.
  // Молчание на этом экране уже один раз вышло боком — «я думала, что не проходит».
  function statusOf(park, date) {
    const item = findItem(queue.value, park, date)
    if (item && item.dead) return 'failed'
    if (item && item.read_ok) return 'score-debt'
    if (item) return item.attempts > 0 ? 'retry' : 'sending'
    return confirmed.value[keyOf(park, date)] ? 'done' : 'idle'
  }
  function errorOf(park, date) {
    const item = findItem(queue.value, park, date)
    return item && item.dead ? item.last_error || 'не удалось отправить' : ''
  }
  // Последняя ПОДТВЕРЖДЁННАЯ бэком оценка пары на этом устройстве, либо null.
  // Карточка показывает её, пока проекция не привезёт своё значение, — иначе после
  // отправки на экране не меняется ничего до следующей загрузки payload.
  function echoScoreOf(park, date) {
    return echoScore(echo.value, park, date)
  }

  // Постановка в очередь — СИНХРОННАЯ. Пользователь не ждёт сеть: намерение
  // зафиксировано на устройстве в момент нажатия, дальше дело очереди.
  // score === undefined → «не трогать оценку» (нажали «Прочитано», модалка впереди).
  function enqueue({ park, signal_date, score }) {
    if (!park || !signal_date) return false
    persistQueue(enqueueRead(queue.value, { park, signal_date, score }))
    // Задержка даёт оценке из модалки догнать прочтение и уехать ОДНИМ запросом:
    // обычный путь (оценил сразу) укладывается в неё, путь «закрыл модалку» —
    // уходит прочтением, а оценка досылается потом.
    scheduleFlush(2000)
    return true
  }

  // Перечитать очередь с устройства и сбросить подтверждения текущей сессии.
  // Нужно, когда состояние на диске изменилось мимо этого модуля: другая вкладка,
  // ручная чистка хранилища, приёмочный прогон между сценариями.
  function reloadOutbox() {
    queue.value = loadOutbox()
    confirmed.value = {}
    echo.value = loadScoreEcho()
  }

  return { queue, statusOf, errorOf, echoScoreOf, enqueue, flush, flushing, reloadOutbox }
}
