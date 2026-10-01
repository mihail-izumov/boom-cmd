import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// Номер сборки ТВ-экранов (/media/loyalty, /media/kassa). Один и тот же —
// вшит в страницы (__MEDIA_BUILD__) и лежит рядом файлом media/build.json.
// Панель раз в минуту сверяет свой номер с файлом и, если вышла новая
// сборка, сама перезагружается на ближайшей заставке (media/shared/
// screens.js). Так в парках всегда открыта последняя версия.
const MEDIA_BUILD = String(Date.now())
function mediaBuildPlugin() {
  return {
    name: 'media-build',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'media/build.json', source: JSON.stringify({ build: MEDIA_BUILD }) + '\n' })
    },
  }
}

// Плагин: заменяет плейсхолдер __BUILD_ID__ в собранном sw.js
// на уникальную метку времени каждого билда (TZ-3.3 §5).
// Каждый билд → свой CACHE_NAME → старые кэши вычищаются на activate.
//
// Берёт outDir из resolved-конфига, чтобы корректно работать как с
// дефолтным `dist`, так и с `--outDir /tmp/...`.
function swBuildIdPlugin() {
  let outDir = 'dist'
  let root = process.cwd()
  return {
    name: 'sw-build-id',
    apply: 'build',
    configResolved(config) {
      outDir = config.build?.outDir || 'dist'
      root = config.root || process.cwd()
    },
    closeBundle() {
      const swPath = isAbsolute(outDir)
        ? resolve(outDir, 'sw.js')
        : resolve(root, outDir, 'sw.js')
      if (!existsSync(swPath)) {
        this.warn?.(`sw.js not found at ${swPath}, skip BUILD_ID injection`)
        return
      }
      const src = readFileSync(swPath, 'utf8')
      const buildId = String(Date.now())
      // Заменяем только реальную строку-литерал плейсхолдера; комментарий-
      // подсказку «__BUILD_ID__» в шапке файла трогать не обязательно
      // (на работу не влияет), но единый replace по всем вхождениям проще
      // и нагляднее — тогда `grep __BUILD_ID__ dist/sw.js` должен дать 0.
      const out = src.replace(/__BUILD_ID__/g, buildId)
      writeFileSync(swPath, out)
      // eslint-disable-next-line no-console
      console.log(`[sw] BUILD_ID = ${buildId} (${swPath})`)
    },
  }
}

export default defineConfig({
  plugins: [vue(), swBuildIdPlugin(), mediaBuildPlugin()],
  base: '/',   // ← корень собственного домена b00m-cmd.ru (CNAME в public/CNAME)

  // Метка сборки ДЛЯ ПРИЛОЖЕНИЯ (D-22). Отдельное имя, не `__BUILD_ID__`:
  // тот плейсхолдер живёт в public/sw.js и подменяется ПОСЛЕ сборки плагином
  // выше (public копируется мимо трансформаций, define до него не достаёт).
  // Одно имя на два разных механизма гарантированно закончилось бы тем, что
  // кто-то починил один и сломал второй.
  //
  // Зачем вообще. В диагностике отказа входа надо отличать «человек на свежей
  // версии» от «у него в PWA лежит сборка двухнедельной давности»: у
  // установленного приложения это не теоретический случай.
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    __MEDIA_BUILD__: JSON.stringify(MEDIA_BUILD),
  },

  // MPA: два независимых входа.
  //   app   — Vue-приложение «Мастерплан» (/)
  //   turbo — носитель для ТВ-панелей у кассы (/media/turbo/), DRV-10
  //   loyalty — ТВ-экран «Твоя карта» для постоянных гостей (/media/loyalty/)
  //   kassa — ТВ-экран у кассы «Пополни карту» (/media/kassa/)
  //
  // Почему вход, а не файл в public/: только внутри сборки работает подстановка
  // import.meta.env, через которую URL Apps Script приходит из repo Variable.
  // Положив страницу в public/, пришлось бы зашить URL текстом в публичный
  // репозиторий — прямое нарушение §4 констант.
  //
  // Путь входа обязан быть <root>/media/turbo/index.html: Vite раскладывает
  // выход относительно root, и из src/media/... получилось бы dist/src/media/...
  // Код с приложением не делится — общих импортов нет намеренно.
  build: {
    rollupOptions: {
      input: {
        app: resolve(root, 'index.html'),
        turbo: resolve(root, 'media/turbo/index.html'),
        // ТВ-экран «Твоя карта» (/media/loyalty/) — статичный, без API
        loyalty: resolve(root, 'media/loyalty/index.html'),
        // ТВ-экран у кассы «Пополни карту» (/media/kassa/) — статичный, без API;
        // данные kassa.data.json вкомпилированы в бандл
        kassa: resolve(root, 'media/kassa/index.html'),
      },
    },
  },
})
