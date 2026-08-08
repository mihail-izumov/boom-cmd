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
// NET-33: контракт расширен, mock обязан идти ВПЕРЕДИ боевого поля (BOUNDARY).
eq('у каждого драйвера мока есть scope и scope_parks',
  mock.drivers.every((d) => 'scope' in d && Array.isArray(d.scope_parks) && Array.isArray(d.parks)), true)
eq('scope=сеть развёрнут в ТРИ действующих парка, MARI не входит',
  mock.drivers.filter((d) => d.scope === 'сеть').every((d) => d.scope_parks.join(';') === 'ohta;piterland;iyun'), true)
eq('parks ⊆ scope_parks у всех (работать вне охвата нельзя)',
  mock.drivers.every((d) => d.parks.every((p) => d.scope_parks.includes(p))), true)
eq('у каждого периода есть event', mock.driver_periods.every((p) => !!p.event), true)

const joined = m.joinDrivers(mock.drivers, mock.driver_periods)
eq('joined = 7', joined.length, 7)
eq('DRV-03 периодов = 3 (ohta/piterland/iyun)', joined.find((d) => d.code === 'DRV-03').periods.length, 3)

// ── §0.1 п.2: парки раздела = ровно три СПб, без mari, не из данных ──
eq('parkOptions = [ohta,piterland,iyun] (фикс, без mari)', m.parkOptions(), ['ohta', 'piterland', 'iyun'])

// ── NET-33 (07.08): фильтр по парку — по ОХВАТУ, не по периодам ──────────────
// ⚠ ПРАВИЛО ЗАМЕНИЛО §0.1 п.1/п.4 («выбран парк → только драйверы с периодом в нём,
// незапущенные видны лишь во Всей сети»). Прежнее правило и было дефектом: у
// незапущенного драйвера периодов нет, значит парка нет ниоткуда, значит на вопрос
// «что мне ещё предстоит в этом парке» раздел отвечал молчанием. Шесть карточек из
// тринадцати не показывались НИ У ОДНОГО парка.
const D = (c) => joined.find((d) => d.code === c)
eq('park=ohta → все применимые к Охте (6, DRV-07 со scope=piterland не попал)',
  m.visibleDrivers(joined, 'ohta', 'all').map((d) => d.code),
  ['DRV-01', 'DRV-03', 'DRV-06', 'DRV-02', 'DRV-04', 'DRV-05'])
eq('park=iyun → применимые к Июню', m.visibleDrivers(joined, 'iyun', 'all').map((d) => d.code),
  ['DRV-01', 'DRV-03', 'DRV-04', 'DRV-05'])
eq('backlog виден под парком, если парк в охвате (это и чинили)', m.matches(D('DRV-05'), 'ohta', 'all'), true)
eq('готов виден под парком, если парк в охвате', m.matches(D('DRV-02'), 'ohta', 'all'), true)
eq('но охват НЕ резиновый: DRV-06 (scope=ohta) под Июнем не виден', m.matches(D('DRV-06'), 'iyun', 'all'), false)
eq('backlog виден во «Всей сети»', m.matches(D('DRV-05'), 'all', 'all'), true)

// ── две группы внутри парка: работает ≠ применим (§2.3) ──
const gOhta = m.splitByRun(m.visibleDrivers(joined, 'ohta', 'all'), 'ohta')
eq('Охта: работают (парк в parks)', gOhta.running.map((d) => d.code), ['DRV-01', 'DRV-03', 'DRV-06'])
eq('Охта: применимы, не включены', gOhta.applicable.map((d) => d.code), ['DRV-02', 'DRV-04', 'DRV-05'])
const gIyun = m.splitByRun(m.visibleDrivers(joined, 'iyun', 'all'), 'iyun')
eq('Июнь: работает один', gIyun.running.map((d) => d.code), ['DRV-03'])
eq('Июнь: применимы трое — это ответ «что предстоит», а не ошибка',
  gIyun.applicable.map((d) => d.code), ['DRV-01', 'DRV-04', 'DRV-05'])
eq('сумма групп = список парка (никто не потерялся)',
  gOhta.running.length + gOhta.applicable.length, m.visibleDrivers(joined, 'ohta', 'all').length)
eq('«работает» берётся из parks, а не из статуса: DRV-06 на паузе, но включён',
  m.runsIn(D('DRV-06'), 'ohta'), true)

// ── охват vs запуск: разные множества, не путать ──
eq('DRV-01: работает в двух, применим в трёх', [m.parkList(D('DRV-01')), m.scopeParks(D('DRV-01'))],
  [['ohta', 'piterland'], ['ohta', 'piterland', 'iyun']])
eq('DRV-04 не запущен нигде, но применим везде', [m.parkList(D('DRV-04')), m.scopeParks(D('DRV-04'))],
  [[], ['ohta', 'piterland', 'iyun']])
eq('строка «a;b» тоже читается (страховка от ручной правки листа)', m.toKeys('ohta; piterland'), ['ohta', 'piterland'])
eq('пусто → пустой массив, не null и не «—»', [m.toKeys(''), m.toKeys(null), m.toKeys(undefined)], [[], [], []])

// ── обратная совместимость: боевой payload ДО v3.17 (полей нет вовсе) ──
// Фронт выкатывается раньше скрипта (BOUNDARY), поэтому эта ветка — боевая, не край.
const oldPayload = m.joinDrivers(
  [{ code: 'DRV-01', status: 'идёт' }, { code: 'DRV-09', status: 'backlog' }],
  [{ code: 'DRV-01', park: 'ohta', start: '2026-04-01', accuracy: 'день' }],
)
eq('без scope_parks парк берётся из периодов (раздел работает как до правки)',
  m.visibleDrivers(oldPayload, 'ohta', 'all').map((d) => d.code), ['DRV-01'])
eq('без parks «работает» тоже выводится из периодов', m.runsIn(oldPayload[0], 'ohta'), true)
eq('незапущенный без охвата под парком не появляется', m.matches(oldPayload[1], 'ohta', 'all'), false)

// ── счётчики парков: по охвату, ровно то же правило, что у matches ──
const pc = m.parkCounts(joined, m.parkOptions())
eq('parkCounts.all = 7', pc.all, 7)
eq('parkCounts.ohta = 6 (все, кроме DRV-07)', pc.ohta, 6)
eq('parkCounts.piterland = 5', pc.piterland, 5)
eq('parkCounts.iyun = 4', pc.iyun, 4)
for (const id of m.parkOptions()) {
  eq(`чип «${id}» и список отвечают одинаково`, pc[id], m.visibleDrivers(joined, id, 'all').length)
}

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
