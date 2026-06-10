import { ref } from 'vue'

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

const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_PROJECTS_API) ||
  ''

// Срок жизни сессии. Поменять тут (напр. 30 * 60 * 1000 = 30 минут).
const SESSION_TTL_MS = 60 * 60 * 1000

const authed = ref(false) // пускать в оболочку
const ready = ref(false) // стартовая инициализация завершена
const checking = ref(false) // идёт проверка фразы
const keyError = ref(false) // неверная фраза при сабмите
const netError = ref(null) // нет связи при проверке
const notice = ref(null) // нейтральное «сессия завершена / доступ изменился»

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

// Проверка фразы против эндпоинта. Возвращает 'ok' | 'unauthorized' | 'neterror'.
async function check(phrase) {
  const res = await fetch(`${API}?key=${encodeURIComponent(phrase)}`)
  if (!res.ok) return 'neterror'
  const data = await res.json()
  if (data && data.error === 'unauthorized') return 'unauthorized'
  return 'ok'
}

// Стартовая инициализация (из App.vue). Без источника — гейт неактивен.
// С источником — после полной загрузки память пуста → всегда экран входа.
function init() {
  if (!API) {
    authed.value = true
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
  notice.value = null
  if (!API) {
    authed.value = true
    return
  }
  checking.value = true
  try {
    const r = await check(v)
    if (r === 'ok') {
      memKey = v
      memTs = Date.now()
      authed.value = true
    } else if (r === 'unauthorized') {
      keyError.value = true
    } else {
      netError.value = 'Нет связи с источником данных'
    }
  } catch {
    netError.value = 'Нет связи с источником данных'
  } finally {
    checking.value = false
  }
}

// Сброс на экран входа. reason: 'expired' | 'unauthorized' | undefined.
function logout(reason) {
  memKey = ''
  memTs = 0
  authed.value = false
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
    ready,
    checking,
    keyError,
    netError,
    notice,
    init,
    submitKey,
    logout,
    getKey,
  }
}
