/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Роли начертаний (D-21). @font-face — в src/styles/main.css, файлы — в public/fonts.
      // Фолбэки обязательны: font-display:swap показывает их, пока грузится брендовый.
      fontFamily: {
        // голос бренда: крупные действия — РАНСКЕЙЛ, СТАРТ, ключевые кнопки
        brand: ['"Ranscale Display"', '"Helvetica Neue Condensed"', 'Impact', 'sans-serif'],
        // ярлыки приборов: подписи блоков и категорий — ДОСТУП
        label: ['"Ranscale Label"', '"Helvetica Neue Condensed"', 'sans-serif'],
        // данные и ввод: поля, placeholder'ы, логины, коды, цифры
        mono: ['"Ranscale Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
