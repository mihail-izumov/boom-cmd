// i18n под-страницы «Цели и планы» (лаунчер ссылок). UI по-русски.

const MONTH_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

// 'YYYY-MM' → «Июль 2026» (с заглавной) — заголовок аккордеона месяца.
export function monthTitle(ym) {
  if (typeof ym !== 'string') return ''
  const [y, m] = ym.split('-')
  const mi = Number(m)
  if (!Number.isFinite(mi) || mi < 1 || mi > 12) return ym
  const w = MONTH_NOM[mi - 1]
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${y}`
}

export const L = {
  home_banner: 'Цели и планы',
  title: 'Цели и планы',
  empty_network: 'Для «Вся сеть» пока нет материалов',
  empty_park: 'По этому парку пока нет материалов',
  empty_hint_network: 'Парковые материалы смотрите по конкретному парку в фильтре сверху.',
  empty_hint_park: 'Выберите другой парк или «Вся сеть» в фильтре сверху.',
  error: 'Не удалось загрузить «Цели и планы»',
  retry: 'Повторить',
  open_new_tab: 'Открыть в новом окне',
}
