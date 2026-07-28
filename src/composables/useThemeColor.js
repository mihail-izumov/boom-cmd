// Цвет системной шапки/статус-бара (meta[name="theme-color"]).
//
// D-21 v2: тёмная витрина — ТОЛЬКО экран входа (и сплэш, за него отвечает
// manifest). Внутри приложения тема светлая, значит статус-бар обязан вернуться
// к светлому — иначе тёмная полоса «залипнет» на всех экранах.
//
// Живёт в App.vue, а не в AccessKeyForm: если фраза уже подтверждена, форма входа
// вообще не монтируется, и вернуть цвет было бы некому. Управляем по состоянию
// гейта, а не по жизненному циклу компонента.

export const AUTH_THEME_COLOR = '#0A0A0A' // экран входа (--bg темы auth-dark)
export const APP_THEME_COLOR = '#F7F6F3' // приложение (--bg светлой темы)

export function setThemeColor(hex) {
  if (typeof document === 'undefined') return
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', hex)
}
