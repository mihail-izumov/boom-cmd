// Приёмка раздела «Драйверы роста» (без реальных чисел). Гоняет чистую модель
// driversModel на выдуманном daily.mock.json и проверяет §0.1: парк → только
// драйверы с периодом в нём; парки = 3 СПб без MARI; канон статусов (разработка —
// синий --info); джойн по code; сортировка; отсутствие «внутренней кухни»; контраст.
// Запуск: node scripts/verify-drivers.mjs
import { readFileSync } from 'node:fs'
import * as m from '../src/composables/driversModel.js'
import * as i from '../src/i18n/drivers.js'

const mock = JSON.parse(readFileSync(new URL('../src/data/daily.mock.json', import.meta.url), 'utf8'))
let pass = 0, fail = 0
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp)
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`}`)
  ok ? pass++ : fail++
}

eq('mock.drivers = 7', mock.drivers.length, 7)
eq('mock.driver_periods = 7 (mari убран)', mock.driver_periods.length, 7)
eq('в mock нет ни одного park=mari', mock.driver_periods.every((p) => p.park !== 'mari'), true)

const joined = m.joinDrivers(mock.drivers, mock.driver_periods)
eq('joined = 7', joined.length, 7)
eq('DRV-03 периодов = 3 (ohta/piterland/iyun)', joined.find((d) => d.code === 'DRV-03').periods.length, 3)

// ── §0.1 п.2: парки раздела = ровно три СПб, без mari, не из данных ──
eq('parkOptions = [ohta,piterland,iyun] (фикс, без mari)', m.parkOptions(), ['ohta', 'piterland', 'iyun'])

// ── §0.1 п.1/п.4: выбран парк → ТОЛЬКО драйверы с периодом; незапущенные лишь в сети ──
eq('park=ohta → только с периодом в Охте', m.visibleDrivers(joined, 'ohta', 'all').map((d) => d.code), ['DRV-01', 'DRV-03', 'DRV-06'])
eq('park=iyun → только DRV-03', m.visibleDrivers(joined, 'iyun', 'all').map((d) => d.code), ['DRV-03'])
eq('backlog НЕ виден под парком (не утекает)', m.matches(joined.find((d) => d.code === 'DRV-05'), 'ohta', 'all'), false)
eq('готов НЕ виден под парком', m.matches(joined.find((d) => d.code === 'DRV-02'), 'ohta', 'all'), false)
eq('backlog виден во «Всей сети»', m.matches(joined.find((d) => d.code === 'DRV-05'), 'all', 'all'), true)

// ── счётчики парков: только с периодом (без «утечки») ──
const pc = m.parkCounts(joined, m.parkOptions())
eq('parkCounts.all = 7', pc.all, 7)
eq('parkCounts.ohta = 3 (01,03,06)', pc.ohta, 3)
eq('parkCounts.piterland = 3 (01,03,07)', pc.piterland, 3)
eq('parkCounts.iyun = 1 (03)', pc.iyun, 1)

// ── §0.1 п.3: канон 6 статусов, «черновик» вне словаря, разработка = синий --info ──
eq('STATUS_ORDER = канон 6 без черновика', i.STATUS_ORDER, ['идёт', 'пауза', 'готов', 'разработка', 'backlog', 'закрыт'])
eq('разработка → синий токен --info', i.STATUS_STYLE['разработка'].token, 'var(--info)')
eq('«черновик» не в словаре стиля', i.STATUS_STYLE['черновик'], undefined)
const sc = m.statusCounts(joined)
eq('statusCounts [all,идёт,готов,разработка,backlog,пауза,закрыт]',
  [sc.all, sc['идёт'], sc['готов'], sc['разработка'], sc['backlog'], sc['пауза'], sc['закрыт']], [7, 2, 1, 1, 1, 1, 1])
eq('фильтр status=разработка → [DRV-04]', m.visibleDrivers(joined, 'all', 'разработка').map((d) => d.code), ['DRV-04'])

// ── сортировка по статусу (идёт→пауза→готов→разработка→backlog→закрыт), внутри по коду ──
eq('сортировка', m.visibleDrivers(joined, 'all', 'all').map((d) => d.code),
  ['DRV-01', 'DRV-03', 'DRV-06', 'DRV-02', 'DRV-04', 'DRV-05', 'DRV-07'])

// ── метрика/кухня не протекли в mock ──
const leaked = ['metric', 'measure_status', 'ready_pct', 'gaps', 'conflicts_open', 'decided_by', 'source', 'docs_count', 'first_start']
eq('в drivers мока нет «внутренней кухни»', mock.drivers.every((d) => leaked.every((k) => !(k in d))), true)

// ── робастность: неизвестный статус не теряется (в хвост, лейбл с большой буквы) ──
const synth = m.joinDrivers([{ code: 'X', status: 'внезапный' }], [])
eq('неизвестный статус в statusOptions (хвост)', m.statusOptions(synth), ['внезапный'])
eq('statusLabel неизвестного — с большой буквы', i.statusLabel('внезапный'), 'Внезапный')

// ── WCAG-контраст текста (--text #1C1B18) на color-mix заливках бейджей ──
const TOK = { '--positive': '#2F9E54', '--warning': '#FFC833', '--info': '#2563EB', '--st-backlog': '#8A8880', '--st-todo': '#6F6D66', '--text-muted': '#6F6D66' }
const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
const mix = (h, p) => rgb(h).map((c) => Math.round(c * p / 100 + 255 * (100 - p) / 100))
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const Lum = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2])
const cr = (a, b) => { const x = Lum(a), y = Lum(b), h = Math.max(x, y), l = Math.min(x, y); return (h + 0.05) / (l + 0.05) }
const TEXT = rgb('#1C1B18')
let minCR = 99
for (const [, s] of Object.entries(i.STATUS_STYLE)) {
  const tok = s.token.replace('var(', '').replace(')', '')
  minCR = Math.min(minCR, cr(TEXT, mix(TOK[tok], s.mix)))
}
eq('контраст бейджей ≥ 4.5:1', Number(minCR.toFixed(2)) >= 4.5, true)

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'}: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
