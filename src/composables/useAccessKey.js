import { ref } from 'vue'

// Гейт доступа на ВЕСЬ вход (Фаза 4). Одна общая фраза (без логинов/ролей, §8),
// хранится только в localStorage. На старте приложения фраза проверяется против
// gated Apps Script; пока не введена/неверна — показываем экран входа вместо
// оболочки. Источник истины проверки — тот же эндпоинт, что отдаёт проекты
// (бэкенд не меняем): unauthorized → фраза неверна.
//
// Модульные ref-ы → синглтон на сессию: и App.vue (экран входа), и useProjects
// (бросить на логин при unauthorized) видят одно состояние.

const STORAGE_KEY = 'boom-cmd:access-key'
const API =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_PROJECTS_API) ||
  ''

const authed = ref(false) // пускать в оболочку
const ready = ref(false) // стартовая проверка завершена (чтобы не мигать формой)
const checking = ref(false) // идёт проверка фразы (старт или сабмит)
const keyError = ref(false) // последняя попытка — неверная фраза
const netError = ref(null) // проблема связи при проверке

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}
function write(v) {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    /* приватный режим — игнор */
  }
}
function clear() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}

// Проверка фразы против эндпоинта. Возвращает 'ok' | 'unauthorized' | 'neterror'.
async function check(phrase) {
  const url = `${API}?key=${encodeURIComponent(phrase)}`
  const res = await fetch(url) // redirect:'follow' по умолчанию (Apps Script 302)
  if (!res.ok) return 'neterror'
  const data = await res.json()
  if (data && data.error === 'unauthorized') return 'unauthorized'
  return 'ok'
}

// Стартовая инициализация: вызывается один раз из App.vue.
async function init() {
  // Нет источника: гейт неактивен. В dev — мок без фразы; в prod без URL
  // useProjects сам покажет «источник не настроен».
  if (!API) {
    authed.value = true
    ready.value = true
    return
  }
  const stored = read()
  if (!stored) {
    authed.value = false
    ready.value = true
    return
  }
  checking.value = true
  try {
    const r = await check(stored)
    if (r === 'ok') authed.value = true
    else if (r === 'unauthorized') {
      clear()
      authed.value = false
    } else {
      // нет связи — не выкидываем на логин, пускаем по сохранённой фразе;
      // данные не загрузятся, useProjects покажет ошибку с «Повторить».
      authed.value = true
    }
  } catch {
    authed.value = true
  } finally {
    checking.value = false
    ready.value = true
  }
}

// Сабмит фразы с экрана входа.
async function submitKey(phrase) {
  const v = String(phrase ?? '').trim()
  if (!v) return
  keyError.value = false
  netError.value = null
  // Нет источника (dev-мок): просто пускаем.
  if (!API) {
    authed.value = true
    return
  }
  checking.value = true
  try {
    const r = await check(v)
    if (r === 'ok') {
      write(v)
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

// Сброс на логин (вызывается useProjects при unauthorized в рантайме).
function logout() {
  clear()
  authed.value = false
  keyError.value = true
}

export function useAccessKey() {
  return { authed, ready, checking, keyError, netError, init, submitKey, logout, getKey: read }
}
