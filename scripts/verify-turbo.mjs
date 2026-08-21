/**
 * verify-turbo.mjs — приёмка носителя /media/turbo/ (DRV-10).
 *
 * Проверяет СОБРАННЫЙ бандл, а не исходник: именно он поедет на панель.
 * Сценарии гоняются в jsdom с подставленным fetch — так ловятся ошибки,
 * которые глазами в песочнице не видно (сдвиг часов панели, «весь день»
 * без границ, парк на паузе).
 *
 * Запуск:  node scripts/verify-turbo.mjs
 * Сам собирает во временный каталог, свой мусор убирает.
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// По умолчанию — временная папка в репо (в .gitignore, как у прочих verify-*).
// VERIFY_OUT нужен для сред, где удаление внутри рабочего дерева запрещено.
const OUT = process.env.VERIFY_OUT || resolve(ROOT, '.tmp-verify-turbo')
const API = 'https://example.invalid/exec'

let failed = 0
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) failed++
}

// ── сборка ──────────────────────────────────────────────────────────────────
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })
console.log('Сборка носителя…')
execSync(`npm run build -- --outDir ${OUT} --emptyOutDir`, {
  cwd: ROOT,
  stdio: 'pipe',
  env: { ...process.env, VITE_TURBO_API: API },
})

const html = readFileSync(resolve(OUT, 'media/turbo/index.html'), 'utf8')
const bundleName = readdirSync(resolve(OUT, 'assets')).find(
  (f) => f.startsWith('turbo-') && f.endsWith('.js'),
)
if (!bundleName) {
  console.error('✗ бандл носителя не собрался')
  process.exit(1)
}
// Бандл — ES-модуль и начинается с импорта modulepreload-полифила. Для eval в
// jsdom импорт срезаем: полифил влияет только на предзагрузку чанков, а чанк
// у носителя один. Остальной код исполняется ровно тот, что поедет на панель.
const bundle = readFileSync(resolve(OUT, 'assets', bundleName), 'utf8')
  .replace(/import\s*["'][^"']+["'];?/g, '')

// ── эталонный ответ источника ───────────────────────────────────────────────
const base = {
  version: 'test',
  park: 'ohta',
  park_ru: 'Охта Молл',
  turbo_status: 'active',
  open: '10:00',
  close: '22:00',
  is_tuesday: false,
  today: [],
  parks: [
    { park: 'ohta', park_ru: 'Охта Молл' },
    { park: 'iyun', park_ru: 'ТЦ Июнь' },
  ],
  machines: [
    { category: 'race', label_ru: 'гонки', icon: '🏎️', count: 28 },
    { category: 'music', label_ru: 'танцы', icon: '🎵', count: 4 },
    { category: 'ghost', label_ru: 'пусто', icon: '👻', count: 0 },
  ],
  packages: [
    { games: 25, price: 750, badge_ru: 'МАКСИМУМ ФАНА', badge_kind: 'best', sort: 3, url: 'https://b00m.fun' },
    { games: 10, price: 350, badge_ru: 'ПОПРОБОВАТЬ', badge_kind: 'try', sort: 1, url: 'https://b00m.fun' },
    { games: 15, price: 500, sort: 2, url: 'https://b00m.fun' },
  ],
  winners: [],
  copy: {},
  settings: { refresh_sec: 300 },
}

async function run(query, payload) {
  const dom = new JSDOM(html, {
    url: `https://b00m-cmd.ru/media/turbo/${query}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })
  window.eval(bundle)
  // load() асинхронна: даём микро- и макрозадачам отработать
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  const $ = (id) => window.document.getElementById(id)
  return {
    cls: $('timer').className,
    state: $('t-state').textContent,
    stateHtml: $('t-state').innerHTML,
    label: $('t-label').textContent,
    num: $('t-num').textContent,
    note: $('t-note').textContent,
    apps: $('apps').innerHTML,
    packs: $('packs-body').innerHTML,
    steps: $('steps-title').textContent,
    brandPark: $('brand-park').textContent,
    brandSep: $('brand-sep').style.display,
    brandIcon: !!$('brand-park').closest('.head').querySelector('.brand-icon path'),
    parksHidden: $('parks').hidden,
    stampStale: $('stamp').className.includes('stale'),
    stampWhen: $('stamp-when').textContent,
    stampVer: $('stamp-ver').textContent,
    qr: $('packs-body').ownerDocument.querySelector('.sub .qr .qr-img path')?.getAttribute('d') || '',
    qrLabel: $('packs-body').ownerDocument.querySelector('.sub .qr .qr-img')?.getAttribute('aria-label') || '',
    subHead: $('packs-body').ownerDocument.querySelector('.sub h3').textContent,
    // С v3.0 победители недели живут в плитке подписки и подменяют это
    // приглашение — тогда узла #sub-note на странице нет вовсе.
    subNote: $('sub-note')?.textContent ?? '',
    subHtml: $('sub-note')?.innerHTML ?? '',
    winners: $('steps-body').innerHTML,
    bday: $('bdaytile')?.textContent ?? '',
    stageW: $('stage')?.style.width ?? '',
    stageTransform: $('stage')?.style.transform ?? '',
    hintText: $('hint').textContent,
    parkErr: $('parkerr').className.includes('on'),
    parkErrAsked: $('parkerr-asked').textContent,
    skeletons: $('packs-body').ownerDocument.querySelectorAll('.bc-skeleton').length,
    window,
  }
}

// server_time задаёт «сейчас» на панели: страница правит свои часы по нему,
// поэтому сценарии детерминированы независимо от часов машины, где идёт прогон.
const at = (iso) => iso

console.log('\n── Машина состояний ──')

// 1. Идут турбо-часы
{
  const r = await run('?park=ohta', {
    ...base,
    server_time: at('2026-08-06T11:00:00+03:00'),
    today: [{ from: '10:00', to: '12:00', all_day: false }],
  })
  ok('now: зелёная рамка', r.cls.includes('now'), r.cls)
  ok('now: подпись «До 12:00»', r.state === 'До 12:00', r.state)
  ok('now: отсчёт час', r.num.startsWith('0:59') || r.num.startsWith('1:00'), r.num)
}

// 2. Окно сегодня, ещё впереди
{
  const r = await run('?park=ohta', {
    ...base,
    server_time: at('2026-08-06T11:00:00+03:00'),
    today: [{ from: '16:00', to: '18:00', all_day: false }],
  })
  ok('today: жёлтый акцент', r.cls.includes('today'), r.cls)
  ok('today: «Сегодня с 16:00»', r.state === 'Сегодня с 16:00', r.state)
}

// 3. Турбо-вторник: границы «весь день» берутся из часов работы парка
{
  const r = await run('?park=ohta', {
    ...base,
    server_time: at('2026-08-04T15:00:00+03:00'),
    is_tuesday: true,
    today: [{ from: '', to: '', all_day: true }],
  })
  ok('tue: состояние как now', r.cls.includes('now'), r.cls)
  // Вид меняется, СОСТОЯНИЕ — нет: класс `tue` добавляется к `now`, а не
  // заменяет его. Иначе это была бы правка машины состояний под цвет.
  ok('tue: жёлтый вид добавлен, а не подменил состояние',
     r.cls.includes('tue') && r.cls.includes('now'), r.cls)
  ok('tue: подпись «Турбо-вторник» пережила скелетон', r.label === 'Турбо-вторник', r.label)
  ok('tue: «Играй весь день»', r.state === 'Играй весь день', r.state)
  ok('tue: отсчёт до закрытия парка (7 ч)', r.num.startsWith('6:59') || r.num.startsWith('7:00'), r.num)
}

// 4. Окон нет
{
  const r = await run('?park=ohta', {
    ...base,
    server_time: at('2026-08-06T11:00:00+03:00'),
    today: [],
  })
  ok('none: нейтральное состояние', r.cls.includes('none'), r.cls)
  // Сверяем разметку, а не текст: в состоянии `none` заголовок переносится
  // через <br>, и textContent склеивает слова без пробела.
  ok('none: показывает состояние, а не призыв',
     r.stateHtml === 'Когда следующие<br>турбо-часы?', r.stateHtml)
}

// 5. Парк на паузе (Питерленд, PIT-21) — пустой календарь показывать нельзя
{
  const r = await run('?park=piterland', {
    ...base,
    park: 'piterland',
    turbo_status: 'paused',
    server_time: at('2026-08-06T11:00:00+03:00'),
    today: [],
  })
  ok('paused: состояние soon', r.cls.includes('soon'), r.cls)
  ok('paused: «Турбо-часы скоро»', r.state === 'Турбо-часы скоро', r.state)
  ok('paused: отсчёт скрыт', r.num === '' || r.num === '0:00:00', JSON.stringify(r.num))
  ok('paused: QR всё равно ведёт на свой парк',
     r.qrLabel === 'QR: https://b00m.fun/turbo?park=piterland&src=tv', r.qrLabel)
}

// 6. Сегодня окон нет, но известно ближайшее → большой отсчёт
{
  const r = await run('?park=ohta', {
    ...base,
    server_time: at('2026-08-08T14:00:00+03:00'),
    today: [],
    next_window: { date: '2026-08-10', dow: 1, from: '10:00', to: '12:00', all_day: false, days_ahead: 2 },
  })
  ok('next: жёлтый акцент', r.cls.includes('today'), r.cls)
  ok('next: подпись «До турбо-часов»', r.label === 'До турбо-часов', r.label)
  ok('next: назван день и час', r.state === 'В понедельник с 10:00', r.state)
  ok('next: отсчёт в днях', /^1 д (19:59|20:00)$/.test(r.num), r.num)
}

// 7. Ближайшее окно неизвестно (источник его не отдаёт) → не выдумываем
{
  const r = await run('?park=ohta', {
    ...base,
    server_time: at('2026-08-08T14:00:00+03:00'),
    today: [],
    next_window: null,
  })
  ok('нет next_window → состояние none, а не выдуманное время', r.cls.includes('none'), r.cls)
  ok('none: уводит к подписке', r.note === 'Расписание — у подписчиков', r.note)
}

console.log('\n── Блоки ──')
{
  const r = await run('?park=ohta&tv=1', {
    ...base,
    server_time: at('2026-08-06T11:00:00+03:00'),
    today: [{ from: '10:00', to: '12:00', all_day: false }],
    winners: [{ week: '2026-W33', display_name: 'Александр К.', prize_ru: '15 турбо-игр' }],
  })
  ok('аппараты: нулевая категория не рисуется', !r.apps.includes('пусто'))
  ok('аппараты: счётчик 28', r.apps.includes('>28<'))
  ok('иконки категорий — картинки, а не эмодзи',
     /<img class="ico" src="[^"]*race[^"]*\.webp"/.test(r.apps), r.apps.slice(0,90))

  ok('пакеты: отсортированы по sort', r.packs.indexOf('>10<') < r.packs.indexOf('>25<'))
  ok('пакеты: ₽/игра посчитан', r.packs.includes('35 ₽ за игру') && r.packs.includes('30 ₽ за игру'))
  ok('пакеты: best подсвечен', r.packs.includes('pack best'))
  // Количество и цена разведены формой, а не только размером: число отдельным
  // узлом, единица «игр» отдельным, цена — в тёмной плашке. Проверка держит
  // это решение: без неё правка вернула бы «10 игр 350 ₽» одним начертанием,
  // которое от очереди не различить (разбор владельца 20.08).
  ok('пакеты: количество — отдельное число с единицей',
     /<span class="qty"><b>10<\/b><span class="u">игр<\/span><\/span>/.test(r.packs), r.packs.slice(0, 120))
  ok('пакеты: цена в плашке, отдельным узлом', /<div class="rub">350 ₽<\/div>/.test(r.packs))
  ok('победители недели переехали в плитку подписки', r.steps === 'Победители недели', r.steps)
  ok('победители: имя и приз отрисованы',
     r.winners.includes('Александр К.') && r.winners.includes('15 турбо-игр'))
  ok('?park= скрывает переключатель парков', r.parksHidden === true)
  ok('?tv=1 включает режим панели', r.window.document.body.className.includes('tv'))
  ok('свежие данные — точка бейджа зелёная', !r.stampStale)
  ok('бейдж: время с явным поясом МСК', /^\d{2}\.\d{2} \d{2}:\d{2} МСК$/.test(r.stampWhen), r.stampWhen)
  ok('бейдж: версия носителя', /^v\d+\.\d+$/.test(r.stampVer), r.stampVer)
  ok('QR вшит в блок подписки', r.qr.length > 1000, `${r.qr.length} симв. пути`)
  // Длина пути ничего не доказывает: чужой QR такой же длинный. Сверяем адрес.
  ok('QR ведёт на парк, показанный на экране',
     r.qrLabel === 'QR: https://b00m.fun/turbo?park=ohta&src=tv', r.qrLabel)
  ok('QR помечен носителем (src=tv) — иначе не отличить экран от тейблтента',
     r.qrLabel.includes('src=tv'))
  ok('старый адрес /turbo/index из QR убран', !r.qrLabel.includes('/turbo/index'))
  ok('в блоке подписки нет кнопки (панель некликабельна)',
     !r.window.document.querySelector('.sub button'))
  ok('модалка email удалена', !r.window.document.getElementById('modal'))
  ok('после загрузки скелетонов не осталось', r.skeletons === 0, String(r.skeletons))
  ok('бейдж парка заполнен', r.brandPark === 'Охта Молл', r.brandPark)
  ok('разделитель // виден', r.brandSep !== 'none', JSON.stringify(r.brandSep))
  ok('иконка shark-eyes инлайном в шапке', r.brandIcon)
}

console.log('\n── Подписка без победителей ──')
{
  // Победителей нет → в плитке остаётся приглашение подписаться. Отдельный
  // прогон: в блоке выше они опубликованы и подменяют этот текст, там узла
  // #sub-note на странице нет вовсе.
  const r = await run('?park=ohta', {
    ...base, server_time: at('2026-08-08T14:00:00+03:00'), winners: [],
  })
  ok('без победителей — приглашение в подписку', r.steps === 'Узнавай первым', r.steps)
  ok('розыгрыш стоит в блоке с QR', r.subNote.includes('15 турбо-игр'), r.subNote)
  ok('«БЕСПЛАТНО» выделено бейджем', /<b class="gift">/.test(r.subHtml))
  ok('«турбо-игр» защищено от переноса по дефису', /<span class="nb">15 турбо-игр<\/span>/.test(r.subHtml))
  ok('перенос в бейдже задан разметкой, а не автопереносом', /class="free"/.test(r.subHtml))
}

console.log('\n── Блок «День рождения» (DRV-08) ──')
{
  const r = await run('?park=ohta', { ...base, server_time: at('2026-08-08T14:00:00+03:00') })
  // Цепочка выгоды целиком: без цены и бонуса «+50 игр» гостю ничего
  // не объясняет — на этом блок и переделывали (разбор владельца 20.08).
  ok('назван вход: от 6 человек', r.bday.includes('ОТ 6 ЧЕЛОВЕК'))
  ok('назван результат: 9 000 зарядов', r.bday.includes('9 000') && r.bday.includes('зарядов на карте'))
  ok('назван бонус', r.bday.includes('+3 000'))
  ok('названа цена', r.bday.includes('за 6 000 ₽'))
  ok('назван подарок', r.bday.includes('+50') && r.bday.includes('ТУРБО-ИГР'))
  ok('назван приз за тикеты', r.bday.includes('приз имениннику'))
  // «На следующий визит» было прямой ложью: по механике §7 подарок играется
  // уже на празднике, а остаток ждёт турбо-часов. Держим формулировку.
  ok('нет обещания «на следующий визит»', !r.bday.includes('на следующий визит'))
}

console.log('\n── Канва: ни полей, ни обрезки ──')
{
  // jsdom отдаёт нулевые размеры окна, поэтому проверяем не число, а сам
  // механизм: канва обязана получить ЯВНЫЙ размер и масштаб из JS. Пока это
  // так, логический размер повторяет пропорции панели, и полей не будет.
  // Комментарии вырезаем: шапка файла перечисляет снятые блоки по именам,
  // и без этого проверка ловила бы собственное объяснение — те же грабли,
  // что были с правилом про курсор мыши.
  const html2 = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  ok('в CSS нет старой резиновой канвы (max-width/100dvh)',
     !/\.page\{[^}]*max-width/.test(html2) && !/\.page\{[^}]*100dvh/.test(html2))
  // Имена функций минификатор переименовывает — проверяем по следам, которые
  // он оставить обязан: узлы канвы и переменная кегля пакетов.
  ok('канва — отдельный узел со своим масштабом',
     html.includes('id="stage"') && html.includes('id="viewport"') &&
     /\.stage\{[^}]*transform-origin/.test(html))
  ok('кегли пакетов производны от одной переменной',
     /--pk:\d+px/.test(html) && html.includes('calc(var(--pk)'))
  // Отсчёт обязан быть inline-block: его ширина = ширина текста, и только
  // тогда подгон кегля отличает «влезает» от «не влезает». У блока во всю
  // ширину родителя эти числа совпадают, и цикл ужимал цифры до пола —
  // на панели было ~47px вместо 120. Проверка держит именно это.
  ok('отсчёт меряется по ширине текста, а не по ширине плитки',
     /\.timer #t-num\{[^}]*display:inline-block/.test(html) &&
     bundle.includes('offsetWidth') && !/num\.scrollWidth/.test(bundle))
  ok('подгон пересчитывается после загрузки шрифта',
     bundle.includes('fonts.status') || bundle.includes('.status'))
  ok('связка «вторник» проведена до плитки внизу', bundle.includes('is-tue'))
  ok('снятые блоки не вернулись',
     !html2.includes('Как это работает') && !html2.includes('Купить в личном кабинете') &&
     !html2.includes('Обменяй тикеты в призотеке'))
}

console.log('\n── Бренд-блок без данных ──')
{
  const dom = new JSDOM(html, {
    url: 'https://b00m-cmd.ru/media/turbo/?park=ohta&mockError=1',
    runScripts: 'outside-only', pretendToBeVisual: true,
  })
  dom.window.fetch = async () => { throw new Error('offline') }
  dom.window.eval(bundle)
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  const d = dom.window.document
  // Источник молчит — парк неизвестен. Показать «БУМБАСТИК // » с висящим
  // разделителем или, хуже, чужой парк — значит соврать на экране в зале.
  ok('парк неизвестен → имя пустое', d.getElementById('brand-park').textContent === '')
  ok('парк неизвестен → разделитель скрыт', d.getElementById('brand-sep').style.display === 'none')
}

console.log('\n── Иконки категорий ──')
{
  // Категория, которой нет в CATEGORY_ICONS, обязана отрисоваться эмодзи из
  // таблицы, а не оставить пустой квадрат: новую категорию заводят в Google,
  // а картинку добавляют кодом — между этими двумя моментами проходит время.
  const r = await run('?park=ohta', {
    ...base, server_time: at('2026-08-08T14:00:00+03:00'),
    machines: [{ category: 'newthing', label_ru: 'новое', icon: '👻', count: 7 }],
  })
  ok('неизвестная категория рисуется эмодзи из таблицы', r.apps.includes('👻'))
  ok('под неизвестную категорию картинка не подставляется', !r.apps.includes('<img'))
  ok('счётчик неизвестной категории на месте', r.apps.includes('>7<'))

  // Картинки нарисованы уже как плитки — со своим скруглением и фоном. Любая
  // подложка под ними даёт вторую рамку вокруг первой, а overflow:hidden на
  // ней срезает угол счётчика. Проверка держит это решение: правка вернётся
  // сюда, если кто-то соберётся «вернуть аккуратные плитки».
  const css = html.slice(html.indexOf('.apps .app .box{'), html.indexOf('.apps .app .lbl'))
  ok('под иконками нет подложки и рамки',
    !/background|border:|box-shadow|border-radius/.test(css))
  ok('иконка не обрезается плиткой', !css.includes('overflow:hidden'))
}

console.log('\n── Указатель мыши в режиме ТВ ──')
{
  // Баг, из-за которого правка появилась: безусловное `cursor:none` на body
  // плюс исключения с `cursor:default` — курсор пропадал и находился только
  // над теми блоками, что попали в список исключений.
  // Комментарии вырезаем: правка объясняется в разметке и цитирует старое
  // правило, иначе проверка ловила бы собственное объяснение.
  const noComments = html.replace(/\/\*[\s\S]*?\*\//g, '')
  ok('нет безусловного скрытия курсора в режиме ТВ',
    !/body\.tv\{[^}]*cursor:\s*none/.test(noComments))
  ok('скрытие курсора перекрывает вложенные элементы',
    /body\.tv\.idle\s*,\s*body\.tv\.idle\s*\*\{cursor:none !important\}/.test(html))

  const r = await run('?park=ohta&tv=1', { ...base, server_time: at('2026-08-08T14:00:00+03:00') })
  const body = r.window.document.body
  ok('режим ТВ включён', body.classList.contains('tv'))
  ok('сразу после загрузки курсор виден', !body.classList.contains('idle'))

  // Ждём порог бездействия: 5 с в скрипте + запас. Тест намеренно живой, а не
  // на подменённых таймерах — ломается обычно как раз связка «класс/порог».
  await new Promise((res) => setTimeout(res, 5400))
  ok('через 5 с без мыши курсор прячется', body.classList.contains('idle'))

  r.window.dispatchEvent(new r.window.Event('mousemove'))
  ok('движение мыши возвращает курсор', !body.classList.contains('idle'))

  const r2 = await run('?park=ohta', { ...base, server_time: at('2026-08-08T14:00:00+03:00') })
  await new Promise((res) => setTimeout(res, 5400))
  ok('вне режима ТВ курсор не прячется никогда',
    !r2.window.document.body.classList.contains('idle'))
}

console.log('\n── Опечатка в адресе панели ──')
{
  // ?park=piterlend (через «е») — источник молча отдаёт первый парк.
  // Страница обязана это заметить: чужие цифры на экране хуже пустого экрана.
  const r = await run('?park=piterlend', {
    ...base, server_time: at('2026-08-08T14:00:00+03:00'),
    today: [{ from: '10:00', to: '12:00', all_day: false }],
  })
  ok('опечатка в ?park= перекрывает экран', r.parkErr)
  ok('в ошибке назван запрошенный код', r.parkErrAsked === '?park=piterlend', r.parkErrAsked)
  // Ключевое: QR берётся от ПОКАЗАННОГО парка, а не от того, что в URL панели.
  // Иначе экран показывал бы Охту, а код подписывал на Питерленд.
  ok('при опечатке QR совпадает с тем, что на экране, а не с ?park=',
     r.qrLabel === 'QR: https://b00m.fun/turbo?park=ohta&src=tv', r.qrLabel)
}
{
  const r = await run('?park=ohta', {
    ...base, server_time: at('2026-08-08T14:00:00+03:00'),
    today: [{ from: '10:00', to: '12:00', all_day: false }],
  })
  ok('корректный парк — плашки нет', !r.parkErr)
}

console.log('\n── Отказ источника ──')
{
  const dom = new JSDOM(html, {
    url: 'https://b00m-cmd.ru/media/turbo/?park=ohta&mockError=1',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  dom.window.fetch = async () => { throw new Error('offline') }
  dom.window.eval(bundle)
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  const d = dom.window.document
  ok('источник молчит → состояние none', d.getElementById('timer').className.includes('none'))
  ok('бейдж пометил данные несвежими', d.getElementById('stamp').className.includes('stale'))
  ok('нет данных → время не выдумывается', d.getElementById('stamp-when').textContent === '—')
  ok('страница не упала', d.querySelector('.turbo').textContent === 'ТУРБО')
  ok('состояние none: «Когда следующие / турбо-часы?» с переносом',
     d.getElementById('t-state').innerHTML === 'Когда следующие<br>турбо-часы?',
     d.getElementById('t-state').innerHTML)
  ok('состояние none: не зовёт нажимать кнопку',
     !d.getElementById('t-note').textContent.includes('Нажми'),
     d.getElementById('t-note').textContent)
}

console.log('\n── Гигиена сборки ──')
{
  ok('мок вырезан из прод-бандла', !bundle.includes('МАКСИМУМ ФАНА') && !bundle.includes('turbo.mock'))
  ok('носитель не тянет код приложения', !html.includes('/assets/app-'))
  ok('noindex на месте', html.includes('noindex'))
  ok('заголовок вкладки — «Турбо-игры // Бумбастик»',
     html.includes('<title>Турбо-игры // Бумбастик</title>'))
  ok('фавикон — общий с приложением', html.includes('href="/favicon.svg"'))
  ok('бейдж «Работает на Ранскеил» со ссылкой',
     html.includes('href="https://runscale.ru"') && html.includes('Работает на Ранскеил'))
  ok('старого написания через «й» на странице нет (D-23)', !/Ранскей/.test(html))
  // Высоту не фиксируем числом: она росла вместе с кеглем подвала. Держим
  // само требование — бейджи в одной группе и одной высоты.
  ok('служебные бейджи в одной группе равной высоты',
     html.includes('class="svc"') && /\.svc > \*\{height:\d+px\}/.test(html))
  ok('двоеточие отсчёта пульсирует', html.includes('bc-blink') && html.includes('.timer .bl'))
  // Проверяем по существу, а не по тексту комментария: старый фолбэк
  // перестраивал сетку в одну колонку — этой перестройки быть не должно.
  ok('заглушка для малых экранов вместо мобильного фолбэка',
     html.includes('class="toosmall"') && html.includes('Экран для ТВ-панели') &&
     !html.includes('"head" "hero"'))
  ok('пороги заглушки: узкое, низкое, портрет',
     html.includes('(max-width:899px), (max-height:559px), (orientation:portrait)'))
  // Обращение к гостю — на «ты» по всей странице (решение владельца 20.08).
  ok('вежливых форм в текстах для гостя нет',
     !/успевайте|Успейте|Подпишитесь|Возьми турбо-игры/.test(html))
  ok('бейдж «бесплатно» на лайме, новых цветов в палитре нет',
     html.includes('background:var(--lime);color:var(--dark)') && !html.includes('--coral'))
  ok('shimmer-загрузка портирована из приложения', html.includes('bc-shimmer') && html.includes('bc-skeleton'))
  ok('иконка перезагрузки в шапке плашки условий', html.includes('id="reload"'))
  ok('служебная плашка не белая (не спорит с QR)', !html.includes('background:var(--white);color:var(--dark);\n    border-radius:9px'))
  ok('блок QR — квадрат, а не растяжка', html.includes('aspect-ratio:1'))
  const sw = readFileSync(resolve(OUT, 'sw.js'), 'utf8')
  ok('/media/ исключён из service worker', sw.includes("BASE + 'media/'"))
  ok('аппшелл собран', existsSync(resolve(OUT, 'index.html')))
}

rmSync(OUT, { recursive: true, force: true })
console.log(failed ? `\n✗ ПРОВАЛЕНО ПРОВЕРОК: ${failed}` : '\n✓ Приёмка носителя пройдена')
process.exit(failed ? 1 : 0)
