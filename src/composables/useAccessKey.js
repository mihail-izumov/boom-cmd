import { ref } from 'vue'
// Политика повторов — та же, что у «Отчёта Дня» и чтения дневного слоя.
import {
  RETRY_DELAYS_MS, isRetriableStatus, failure, fetchWithTimeout, transportFailure, runWithRetries,
} from './netPolicy.js'
import { networkHint, isOnline } from '../i18n/net.js'

// Гейт доступа на ВЕСЬ вход (Фаза 4). Одна общая фраза, без логинов/ролей (§8).
//
// Безопасность (по запросу владельца):
//   • Фраза НЕ сохраняется на диск — живёт только в памяти вкладки.
//     → любое полное открытие страницы (запуск, обычный и hard-reload,
//       повторное открытие после закрытия окна) требует ввести её заново.
//   • Абсолютный таймаут сессии SESSION_TTL_MS (по умолчанию 1 час): даже без
//     перезагрузки через час фраза спрашивается снова.
//   • Смена ACCESS_KEY на бэке → ближайший запрос вернёт unauthorized →
//     logout() выкидывает на экран входа.
// Это «мягкий» гейт (deterrence), не криптостойкая авторизация.
//
// ── ПОВТОРНЫЕ ПОПЫТКИ И РАЗБОР ПРИЧИН (D-22, 12.08.2026) ──
//
// ПОВОД. Пользователи регулярно жалуются, что после нажатия «СТАРТ» приложение
// не пускает и пишет «Нет связи с источником данных».
//
// ПРИЧИНА, найденная в коде. Здесь стоял ОДИН голый `fetch` — без потолка
// ожидания и без повторов. При этом ровно этот класс отказов уже разобран в
// `netPolicy.js` (05.08): «POST умирал по дороге к Google, в сети ТЦ; со
// второй-третьей попытки уходил», а в журнале выполнений Apps Script не было
// НИ ОДНОГО запроса. Политику тогда применили к `useReport` и `useDaily` —
// и не применили к ВХОДУ, то есть к самой первой сетевой операции, без которой
// не работает вообще ничего. Одна осечка сети = человек заперт снаружи.
//
// ВТОРОЙ ДЕФЕКТ, того же происхождения. Четыре РАЗНЫХ отказа выглядели одинаково
// («нет связи»), и различить их было нечем:
//   • запрос не дошёл / не ответил вовремя      → transport, лечится повтором и VPN;
//   • 5xx или квота Google                       → http, лечится повтором;
//   • вместо JSON пришла страница входа Google   → parse, лечится настройками
//     развёртывания web-app и повтором НЕ лечится вовсе;
//   • бэк осознанно ответил `unauthorized`       → код доступа неверный.
// Последний случай особенно вреден: `res.json()` на HTML бросает исключение,
// которое ловил внешний `catch` и писал ту же строку «Нет связи». Человеку с
// неверным кодом сообщали про связь, а человеку с оборванной связью — иногда
// про код. Теперь причина называется своим именем, а `lastFailure` уносит её
// в диагностику заявки (см. loginDiagnostics.js).
//
// ЧТО НЕ ПОВТОРЯЕМ: `unauthorized`. Это осознанный ответ бэка — от повтора
// код доступа не станет верным, а человек лишние шесть секунд смотрит на
// «Проверяем…» вместо того, чтобы исправить опечатку.

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_PROJECTS_API) ||
  ''

// Срок жизни сессии. Поменять тут (напр. 30 * 60 * 1000 = 30 минут).
const SESSION_TTL_MS = 60 * 60 * 1000

const authed = ref(false) // пускать в оболочку
const role = ref(null) // 'owner' | 'reporter' | null (D-12 §9, вариант A)
const ready = ref(false) // стартовая инициализация завершена
const checking = ref(false) // идёт проверка фразы
const keyError = ref(false) // неверная фраза при сабмите
const netError = ref(null) // нет связи при проверке
const notice = ref(null) // нейтральное «сессия завершена / доступ изменился»
// Подсказка «что делать» под ошибкой. Словарь общий с остальным приложением
// (i18n/net.js): «выключите VPN» показывается ТОЛЬКО при транспортной осечке —
// при неверном коде этот совет был бы прямой ложью.
const netHint = ref('')
// Номер текущей попытки (1..3). Экран обязан это показывать: молчать шесть
// секунд, пока идут повторы, нельзя — читается как зависание, и человек жмёт
// «СТАРТ» второй раз, порождая ещё одну гонку запросов.
const attempt = ref(0)

// Чем закончилась последняя неудачная попытка входа. Живёт после отказа, чтобы
// форма «Проблемы со входом» приложила её к заявке БЕЗ повторного запроса:
// повторять сломанный запрос ради диагностики — значит ждать ещё раз.
const lastFailure = ref(null)

// Фраза — только в памяти модуля (ни localStorage, ни sessionStorage).
let memKey = ''
let memTs = 0

function keyValid() {
  return !!memKey && Date.now() - memTs <= SESSION_TTL_MS
}
function getKey() {
  if (!keyValid()) {
    memKey = ''
    return ''
  }
  return memKey
}

/**
 * Одна попытка целиком: запрос → статус → JSON. Бросает Error с полями
 * `retriable` (повторять ли) и `kind` (как назвать причину в диагностике).
 * Возвращает разобранное тело — решение по нему принимает вызывающий.
 */
async function attemptOnce(url) {
  let res
  try {
    // cache: 'no-store' — против промежуточных прокси в сетях ТЦ: закэшированный
    // ответ гейта означал бы вход по протухшему вердикту.
    res = await fetchWithTimeout(url, { redirect: 'follow', cache: 'no-store' })
  } catch (e) {
    const f = transportFailure(e)
    f.kind = e && e.name === 'AbortError' ? 'timeout' : 'network'
    throw f
  }
  if (!res.ok) {
    const f = failure(`Источник недоступен (${res.status})`, isRetriableStatus(res.status))
    f.kind = 'http'
    f.http = res.status
    throw f
  }
  try {
    return await res.json()
  } catch {
    // Так выглядит страница входа Google при сбое настроек развёртывания
    // web-app и обрыв на 302 к googleusercontent. Повтор оставляем: обрыв
    // редиректа лечится, слетевший деплой — нет, а различить их здесь нечем.
    const f = failure('Источник ответил не данными', true)
    f.kind = 'parse'
    f.http = res.status
    throw f
  }
}

// Стартовая инициализация (из App.vue). Без источника — гейт неактивен.
// С источником — после полной загрузки память пуста → всегда экран входа.
function init() {
  if (!API) {
    authed.value = true
    role.value = 'owner' // без гейта репортёрского режима нет
  } else {
    authed.value = false
  }
  ready.value = true
}

async function submitKey(phrase) {
  const v = String(phrase ?? '').trim()
  if (!v) return
  keyError.value = false
  netError.value = null
  netHint.value = ''
  notice.value = null
  lastFailure.value = null
  if (!API) {
    authed.value = true
    role.value = 'owner'
    return
  }
  checking.value = true
  attempt.value = 1
  // Часы от нажатия «СТАРТ» до исхода. Владелец просил это отдельным числом:
  // «висело сорок секунд» и «отвалилось мгновенно» — разные болезни, а на слух
  // обе описываются словами «не пускает».
  const t0 = Date.now()
  try {
    const data = await runWithRetries(() => attemptOnce(`${API}?key=${encodeURIComponent(v)}`), {
      onRetry: (n, e) => {
        attempt.value = n
        if (typeof console !== 'undefined') {
          console.warn(`access check retry ${n}/${RETRY_DELAYS_MS.length + 1}:`, e.message)
        }
      },
    })
    if (data && data.error === 'unauthorized') {
      keyError.value = true
      lastFailure.value = {
        kind: 'unauthorized',
        message: 'Неверный код доступа',
        http: 200,
        attempts: attempt.value,
        ms: Date.now() - t0,
      }
      return
    }
    memKey = v
    memTs = Date.now()
    role.value = data && data.role === 'reporter' ? 'reporter' : 'owner'
    authed.value = true
  } catch (e) {
    netError.value = 'Нет связи с источником данных'
    netHint.value = networkHint({ retriable: !!(e && e.retriable), online: isOnline() })
    lastFailure.value = {
      kind: (e && e.kind) || 'network',
      message: (e && e.message) || 'Неизвестный отказ',
      http: (e && e.http) || '',
      attempts: attempt.value,
      ms: Date.now() - t0,
    }
    if (typeof console !== 'undefined') console.warn('access check failed:', e)
  } finally {
    checking.value = false
    attempt.value = 0
  }
}

// Сброс на экран входа. reason: 'expired' | 'unauthorized' | undefined.
function logout(reason) {
  memKey = ''
  memTs = 0
  authed.value = false
  role.value = null
  if (reason === 'expired') notice.value = 'Время сессии истекло. Войдите снова.'
  else if (reason === 'unauthorized') notice.value = 'Доступ изменился. Войдите снова.'
}

// Фоновый страж таймаута: каждые 30с проверяет срок и выкидывает на вход.
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (authed.value && !keyValid()) {
      logout('expired')
    }
  }, 30000)
}

export function useAccessKey() {
  return {
    authed,
    role,
    ready,
    checking,
    keyError,
    netError,
    netHint,
    attempt,
    lastFailure,
    notice,
    init,
    submitKey,
    logout,
    getKey,
  }
}
