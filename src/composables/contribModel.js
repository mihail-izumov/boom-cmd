// Чистая модель экрана «Вклад в план» (второе состояние раздела «Драйверы роста»).
// Без Vue/DOM — тестируется отдельно (по образцу driversModel.js / monthLayout.js).
// Источник — верхнеуровневые payload.driver_contrib + payload.driver_contrib_items.
//
// ГЛАВНОЕ ПРАВИЛО РАЗДЕЛА: фронт НЕ СЧИТАЕТ бизнес-величины. plan / base / capacity /
// got / covered_pct / gap приходят посчитанными из контура данных и печатаются как есть.
// Конвенции 70/30 (D-50) здесь нет и быть не должно: коэффициент живёт в
// tools/build_driver_share.py, поэтому его пересмотр решением владельца не требует
// правки ни фронта, ни Apps Script. Всё, что модель вычисляет, — это ШИРИНЫ СЕГМЕНТОВ
// (доли уже готовых чисел) и СУММЫ ПО СЕТИ, которые задание разрешает явно (§5).
//
// Якорь экрана — ПЛАН месяца. Цель (month_goal, D-34) здесь не участвует вообще:
// драйверы обеспечивают план, план обеспечивает цель.

import { DRIVER_PARK_ORDER } from '../i18n/drivers.js'

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null)
const pos = (v) => Math.max(0, num(v) ?? 0)

// Строка валидна, если у неё есть парк и ПЛАН: без плана раскладывать нечего.
// capacity == null — штатное «данных для разложения пока нет» (парк без метода).
export function isUsable(r) {
  return !!(r && r.park && num(r.plan) && num(r.capacity))
}

export function contribRows(data) {
  const rows = data && Array.isArray(data.driver_contrib) ? data.driver_contrib : []
  return rows.filter((r) => r && r.park)
}

export function contribItems(data) {
  const rows = data && Array.isArray(data.driver_contrib_items) ? data.driver_contrib_items : []
  return rows.filter((r) => r && r.code)
}

// Экран доступен, только если есть хотя бы одна пригодная строка. Иначе переключатель
// не показываем вовсе и остаёмся на списке драйверов (обратная совместимость §4 ТЗ).
export const hasContrib = (data) => contribRows(data).some(isUsable)

// Строка конкретного парка (v1 — один месяц, пикера нет).
export const parkContrib = (data, park) =>
  contribRows(data).find((r) => r.park === park) || null

// ── «Данные от ДД.ММ.ГГГГ» ──────────────────────────────────────────────────
// Берётся ИЗ КОЛОНКИ asof, ничего не вычисляем и не подставляем «сегодня».
// На «Всей сети» asof парков может разойтись — берём МИНИМАЛЬНУЮ (решение владельца
// 31.07): это дата, на которую закрыты ВСЕ парки. Максимальная обещала бы свежесть,
// которой у части слагаемых нет.
export function asofOf(data, park) {
  if (park) {
    const r = parkContrib(data, park)
    return (r && r.asof) || ''
  }
  const all = contribRows(data).filter(isUsable).map((r) => r.asof).filter(Boolean)
  return all.length ? all.reduce((a, b) => (a < b ? a : b)) : ''
}

// ── Суммы по сети ───────────────────────────────────────────────────────────
// ЕДИНСТВЕННОЕ место, где фронт складывает: §5 задания разрешает это явно
// («карточки 1 и 2 на суммах парков»). Складываем ГОТОВЫЕ base и capacity, а НЕ
// «Σплан × 70 %»: арифметически то же самое, но коэффициент не переезжает в код.
// covered_pct у сети своего значения в данных не имеет — считаем из сумм.
export function networkContrib(data) {
  const rows = contribRows(data).filter(isUsable)
  if (!rows.length) return null
  const sum = (k) => rows.reduce((a, r) => a + pos(r[k]), 0)
  const plan = sum('plan')
  const base = sum('base')
  const capacity = sum('capacity')
  // got отрицательным быть не должен, но метод «прирост к прошлому месяцу» его
  // допускает (парк просел). В сумму такой парк входит нулём, иначе он молча
  // съедал бы вклад соседей — а карточка отвечает на «сколько уже принесли».
  const got = rows.reduce((a, r) => a + Math.max(0, num(r.got) ?? 0), 0)
  return {
    park: null,
    plan, base, capacity, got,
    covered_pct: capacity ? (got / capacity) * 100 : 0,
    gap: capacity - got,
  }
}

// ── Раскладка полосы «План месяца» ──────────────────────────────────────────
// Ширины — доли ГОТОВЫХ base/capacity от ГОТОВОГО plan. Правый сегмент забирает
// остаток до 100 %, чтобы полоса всегда была заполнена: base + capacity может не
// сойтись с plan на рубль-другой от округления, и щель на стыке читалась бы багом.
export function planLayout(r) {
  const plan = num(r && r.plan)
  if (!plan) return null
  const basePct = clamp((pos(r.base) / plan) * 100)
  return {
    basePct,
    capacityPct: 100 - basePct,
    // Подписи-проценты округляем от ДАННЫХ, а не от ширин: «70 %» — это доля базы
    // в плане, а не длина сегмента (они совпадают, но источник должен быть один).
    baseLabelPct: Math.round((pos(r.base) / plan) * 100),
    capacityLabelPct: Math.round((pos(r.capacity) / plan) * 100),
  }
}

// ── Раскладка полосы «Вклад драйверов» ──────────────────────────────────────
// 100 % шкалы = ёмкость драйверов. covered_pct > 100 НЕ зажимаем в 100 %: шкала
// растягивается до фактического вклада, ёмкость становится ПОРОГОМ внутри шкалы
// (DESIGN-STANDARD §7.1: порог — линия поперёк меры), а хвост за ней —
// «Сверх ёмкости». Молча упереться в 100 % значило бы соврать в другую сторону.
export function capacityLayout(r) {
  const cov = num(r && r.covered_pct)
  if (cov == null) return null
  const over = cov > 100
  if (!over) {
    const gotPct = clamp(cov)
    return { over: false, gotPct, shortPct: 100 - gotPct, thresholdPct: null }
  }
  const thresholdPct = clamp((100 / cov) * 100)
  return { over: true, gotPct: thresholdPct, shortPct: 0, overPct: 100 - thresholdPct, thresholdPct }
}

// ── Детализация «Из чего складывается» ──────────────────────────────────────
// Только на экране парка (на сети детализации нет — решение владельца 31.07).
// Сортировка по вкладу вниз.
//
// ШИРИНА МИНИ-ПОЛОСЫ = `pct_in`, то есть ровно то число, что напечатано справа.
// Раньше она считалась от МАКСИМАЛЬНОГО вклада, и верхняя строка всегда выходила
// заполненной на 100 % при подписи «45 %» — полоса и число говорили разное, читатель
// верит полосе. Это ошибка кодирования, а не косметика (DESIGN-STANDARD §7.1: одно
// средство — одна роль): длина обязана означать долю внутри вклада работающих, ту же
// величину, что и подпись. Теперь строки складываются в 100 % и видно, что́ сколько даёт.
export function itemsFor(data, park) {
  const rows = contribItems(data).filter((r) => r.park === park)
  const sorted = [...rows].sort(
    (a, b) => Math.abs(pos(b.rub)) - Math.abs(pos(a.rub)) || String(a.code).localeCompare(String(b.code)),
  )
  // Фолбэк на долю от максимума — только если контур данных не прислал pct_in:
  // пустая полоса при непустом рубле выглядела бы поломкой.
  const max = sorted.reduce((m, r) => Math.max(m, Math.abs(pos(r.rub))), 0) || 1
  return sorted.map((r) => ({
    code: r.code,
    // Короткий код для бейджа: «DRV-03» → «03» (как в песочнице и в DriverCard).
    short: String(r.code).split('-').pop(),
    name: r.name || '',
    rub: num(r.rub),
    pct_in: num(r.pct_in),
    bg: r.bg === true,
    barPct: num(r.pct_in) != null ? clamp(r.pct_in) : clamp((Math.abs(pos(r.rub)) / max) * 100),
  }))
}

// ── Строки карточки «Сила драйверов» (сколько своей ёмкости закрыл каждый парк) ──
// Идём по ФИКСИРОВАННОМУ порядку трёх действующих парков (как driversModel.parkOptions):
// парк без строки в driver_contrib показывается прочерком, а не исчезает — иначе
// «данных нет» не отличить от «парка нет».
export function parkRows(data) {
  return DRIVER_PARK_ORDER.map((id) => {
    const r = parkContrib(data, id)
    const ok = isUsable(r)
    return {
      park: id,
      has: ok,
      covered_pct: ok ? num(r.covered_pct) : null,
      barPct: ok ? clamp(Math.min(100, num(r.covered_pct) ?? 0)) : 0,
    }
  })
}

function clamp(v) {
  if (!isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}
