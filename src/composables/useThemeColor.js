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

// ПОЛОТНО ПОД ПРИЛОЖЕНИЕМ (баг 19.08.2026, найден на устройстве).
//
// Тёмная витрина входа висела на корневом div компонента, а <html>/<body>
// оставались светлыми. При оттягивании экрана (rubber band) iOS показывает фон
// КОРНЯ документа, а не фон прокручиваемого блока, — из-под тёмного входа
// выезжала белая полоса. Тот же фон виден и в области safe-area.
//
// Красим НЕ цветом из JS, а тем же скоупным атрибутом, что и сам экран: значение
// тогда берётся из токенов в main.css, и второго списка hex, который однажды
// разойдётся с первым, не появляется. Внутрь приложения тема по-прежнему не
// протекает — атрибут снимается ровно в тот момент, когда гейт пройден.
export function setAuthCanvas(on) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (on) el.setAttribute('data-theme', 'auth-dark')
  else el.removeAttribute('data-theme')
}
