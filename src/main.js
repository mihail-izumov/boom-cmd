import { createApp } from 'vue'
import './styles/main.css'
import App from './App.vue'

createApp(App).mount('#app')

// PWA service worker — регистрируем ТОЛЬКО на production-сборке
// (TZ-3.3 §5, решение владельца). На dev SW не нужен: HMR не должен
// биться с кэшированием. Кнопка hard-reload на Главной работает на
// задеплоенной сборке (где SW есть).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js')
      .catch(() => {})
  })
}
