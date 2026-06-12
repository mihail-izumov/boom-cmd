// i18n/хелперы раздела «Материалы».
// Отклонение от §5 PRODUCT-PRINCIPLES (данные EN, UI RU) согласовано явно
// (TZ-5 §2.1): лейблы type/status/directions приходят на русском и
// используются как есть — словарей перевода нет, только порядок групп,
// форматтеры и иконография.
//
// Решения владельца (обсуждение TZ-5.2 §9, принято):
//   • группировка витрины — по type (не по directions);
//   • детали — в модалке (как Проекты), сырые URL не показываем;
//   • PDF/Папки → новое окно; локальные изображения → просмотр внутри.

import { File, FileText, Folder, Image } from 'lucide-vue-next'

export const MATERIALS_PLURAL = ['материал', 'материала', 'материалов']

// Известные типы в порядке показа: визуальный контент сверху,
// незнакомые типы — после (по алфавиту), «Прочее» (пустой type) — в конце.
export const MATERIALS_TYPE_ORDER = ['Изображение', 'PDF', 'Папка']

export const OTHER_TYPE = 'Прочее'

// Заголовки групп — множественное число. Незнакомый тип идёт как есть.
const TYPE_GROUP_RU = {
  Изображение: 'Изображения',
  PDF: 'PDF',
  Папка: 'Папки',
  [OTHER_TYPE]: 'Прочее',
}
export function typeGroupLabel(type) {
  return TYPE_GROUP_RU[type] || String(type)
}

// Порядок ключей групп: известные по MATERIALS_TYPE_ORDER → новые из данных
// по алфавиту → «Прочее» последним.
export function orderTypeGroups(keys) {
  const known = []
  const unknown = []
  let hasOther = false
  for (const k of keys) {
    if (k === OTHER_TYPE) hasOther = true
    else if (MATERIALS_TYPE_ORDER.includes(k)) known.push(k)
    else unknown.push(k)
  }
  known.sort(
    (a, b) => MATERIALS_TYPE_ORDER.indexOf(a) - MATERIALS_TYPE_ORDER.indexOf(b),
  )
  unknown.sort((a, b) => a.localeCompare(b, 'ru'))
  return [...known, ...unknown, ...(hasOther ? [OTHER_TYPE] : [])]
}

// Иконка типа (lucide). Цвет задаёт компонент — всегда монохром (--text-muted).
export function typeIcon(type) {
  if (type === 'PDF') return FileText
  if (type === 'Папка') return Folder
  if (type === 'Изображение') return Image
  return File
}

// Первое непустое направление — для мета-строки карточки и поля модалки.
export function pickDirection(material) {
  const list = material?.directions
  if (!Array.isArray(list)) return ''
  return list.find((d) => String(d).trim()) || ''
}

// 'DD.MM.YYYY' → Date | null. Используется только для сортировки.
export function parseDateRu(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s ?? '').trim())
  if (!m) return null
  const d = new Date(+m[3], +m[2] - 1, +m[1])
  return Number.isNaN(d.getTime()) ? null : d
}

// Сортировка по last_updated desc; невалидные/пустые даты — в конец;
// при равенстве — стабильный исходный порядок.
export function sortByDateDesc(list) {
  return list
    .map((m, i) => ({ m, i, t: parseDateRu(m.last_updated)?.getTime() ?? null }))
    .sort((a, b) => {
      if (a.t === null && b.t === null) return a.i - b.i
      if (a.t === null) return 1
      if (b.t === null) return -1
      return b.t - a.t || a.i - b.i
    })
    .map((x) => x.m)
}

// Поля материала в модалке.
export const MATERIALS_FIELD_RU = {
  type: 'Тип',
  status: 'Статус',
  directions: 'Направления',
  updated: 'Обновлено',
  description: 'Описание',
}

// Локальное изображение → смотрим внутри PWA (ImageViewer);
// всё остальное со ссылкой → новое окно.
export function isLocalImage(material) {
  return (
    material?.type === 'Изображение' &&
    material?.external === false &&
    !!material?.href
  )
}
