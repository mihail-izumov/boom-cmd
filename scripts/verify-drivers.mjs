// Приёмка раздела «Драйверы роста» (без реальных чисел). Гоняет чистую модель
// driversModel на выдуманном daily.mock.json и проверяет: джойн по code,
// parkOptions (MARI из данных), счётчики парк/статус, фильтр, сортировку,
// отсутствие «внутренней кухни» в моке и WCAG-контраст заливок статус-бейджей.
// Запуск: node scripts/verify-drivers.mjs   (аналог scripts/verify-daily.mjs)
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
eq('mock.driver_periods = 8', mock.driver_periods.length, 8)

const joined = m.joinDrivers(mock.drivers, mock.driver_periods)
eq('joined = 7', joined.length, 7)
eq('DRV-03 периодов = 4 (вкл mari)', joined.find(d => d.code === 'DRV-03').periods.length, 4)
eq('готов/разработка/backlog — без периодов', joined.filter(d => ['готов','разработка','backlog'].includes(d.status)).every(d => d.periods.length === 0), true)
eq('parkOptions = [ohta,piterland,iyun,mari]', m.parkOptions(joined), ['ohta','piterland','iyun','mari'])

const sc = m.statusCounts(joined)
eq('statusCounts [all,идёт,готов,разработка,backlog,пауза,закрыт]',
  [sc.all, sc['идёт'], sc['готов'], sc['разработка'], sc['backlog'], sc['пауза'], sc['закрыт']], [7,2,1,1,1,1,1])

const pc = m.parkCounts(joined, m.parkOptions(joined))
eq('parkCounts.ohta = 6', pc.ohta, 6)
eq('parkCounts.mari = 4', pc.mari, 4)

eq('фильтр park=mari → 4', m.visibleDrivers(joined, 'mari', 'all').map(d => d.code), ['DRV-03','DRV-02','DRV-04','DRV-05'])
eq('backlog виден при park=ohta', m.matches(joined.find(d => d.code === 'DRV-05'), 'ohta', 'all'), true)
eq('закрыт DRV-07 не виден при park=ohta', m.matches(joined.find(d => d.code === 'DRV-07'), 'ohta', 'all'), false)
eq('фильтр status=закрыт → [DRV-07]', m.visibleDrivers(joined, 'all', 'закрыт').map(d => d.code), ['DRV-07'])
eq('сортировка', m.visibleDrivers(joined, 'all', 'all').map(d => d.code), ['DRV-01','DRV-03','DRV-06','DRV-02','DRV-04','DRV-05','DRV-07'])

const leaked = ['metric','measure_status','ready_pct','gaps','conflicts_open','decided_by','source','docs_count','first_start']
eq('в drivers мока нет «внутренней кухни»', mock.drivers.every(d => leaked.every(k => !(k in d))), true)

// ── робастность к словарю статусов контура B (баг «не все статусы») ──
// «черновик» (реальный статус прода) и любой неизвестный статус не должны теряться:
// попадают в statusOptions (известные по порядку, неизвестные в хвост) и в счётчики.
const synth = m.joinDrivers(
  [{ code: 'X1', status: 'черновик' }, { code: 'X2', status: 'внезапный_статус' }, { code: 'X3', status: 'идёт' }],
  [{ code: 'X3', park: 'ohta', start: '2026-07-01', end: '', accuracy: 'день' }],
)
eq('statusOptions: известные по порядку, неизвестный в хвосте', m.statusOptions(synth), ['идёт', 'черновик', 'внезапный_статус'])
const scS = m.statusCounts(synth)
eq('счётчики: черновик 1, неизвестный 1', [scS['черновик'], scS['внезапный_статус']], [1, 1])
eq('statusLabel неизвестного — с большой буквы', i.statusLabel('внезапный_статус'), 'Внезапный_статус')
eq('незапущенный (нет периодов) виден при любом парке', m.matches(synth.find(d => d.code === 'X1'), 'ohta', 'all'), true)
eq('запущенный по периодам фильтруется по парку', m.matches(synth.find(d => d.code === 'X3'), 'piterland', 'all'), false)

// WCAG-контраст текста (--text #1C1B18) на color-mix заливках бейджей.
const TOK = { '--positive':'#2F9E54','--warning':'#FFC833','--info':'#2563EB','--st-backlog':'#8A8880','--st-todo':'#6F6D66','--text-muted':'#6F6D66' }
const rgb = h => [1,3,5].map(k => parseInt(h.slice(k,k+2),16))
const mix = (h,p) => rgb(h).map((c,k) => Math.round(c*p/100 + 255*(100-p)/100))
const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4 }
const Lum = a => 0.2126*lin(a[0])+0.7152*lin(a[1])+0.0722*lin(a[2])
const cr = (a,b) => { const x=Lum(a),y=Lum(b),h=Math.max(x,y),l=Math.min(x,y); return (h+0.05)/(l+0.05) }
const TEXT = rgb('#1C1B18')
let minCR = 99
for (const [st, s] of Object.entries(i.STATUS_STYLE)) {
  const tok = s.token.replace('var(','').replace(')','')
  minCR = Math.min(minCR, cr(TEXT, mix(TOK[tok], s.mix)))
}
eq('контраст бейджей ≥ 4.5:1', Number(minCR.toFixed(2)) >= 4.5, true)

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'}: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
