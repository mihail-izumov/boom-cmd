// reviews.js — «Журнал разборов» («Разбор полёта», D-19). ЧИСТЫЙ JS: на верхнем
// уровне нет vue/DOM (импортируется в Node/verify).
//
// Контракт: payload.reviews[] — ВЕРХНЕУРОВНЕВЫЙ массив (по образцу net_summary),
// строка вкладки `reviews` дневной таблицы: { date: 'yyyy-MM-dd', title?: string }.
// Слой ТОЛЬКО рендерит payload: порядок в нём не гарантирован — сортируем на
// фронте (по образцу dailySignals). Битые записи (без валидной даты) и не-объекты
// отбрасываем — рендер не роняем (правило §7 контракта).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Валидные записи, отсортированные ПО УБЫВАНИЮ даты (свежие сверху — так журнал
// и показывается; отдельного reverse на экране нет).
export function sortReviews(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r) => r && typeof r === 'object' && DATE_RE.test(String(r.date || '')))
    .slice()
    .sort((a, b) => (String(a.date) > String(b.date) ? -1 : String(a.date) < String(b.date) ? 1 : 0))
}

// Счётчик для полосы Главной: число ВАЛИДНЫХ записей журнала (строкой, как
// checkups/signals из stats); ключа reviews в payload нет → null → «—».
export function reviewCount(raw) {
  if (!Array.isArray(raw)) return null
  return String(sortReviews(raw).length)
}
