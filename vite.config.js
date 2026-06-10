import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'

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
  plugins: [vue(), swBuildIdPlugin()],
  base: '/boom-cmd/',   // ← синхронизировано с именем репозитория
})
