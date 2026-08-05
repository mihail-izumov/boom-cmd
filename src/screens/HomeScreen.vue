<script setup>
import { computed, ref } from 'vue'
// Map импортируем под псевдонимом: голое имя Map затенило бы глобальный
// конструктор Map в области модуля.
import { ExternalLink, Folder, Gauge, Info, Map as MapIcon, Rocket, Target } from 'lucide-vue-next'
import HomeWidget from '../components/home/HomeWidget.vue'
import MonthProgressCard from '../components/home/MonthProgressCard.vue'
import InstallPwaBanner from '../components/home/InstallPwaBanner.vue'
import { useDaily } from '../composables/useDaily.js'
import { computeNetwork } from '../composables/dailyModel.js'
import { PARKS, PARKS_BY_ID } from '../data/parks.js'
import { setSubView } from '../composables/useAppNav.js'
import { mlnRub, mlnSigned, pctDelta, pct1, readCounters, checkupsWord, signalsWord, reviewsWord, L } from '../i18n/home.js'
import { reviewCount } from '../composables/reviews.js'

// Home — командная дека. Сверху полоса счётчиков, под ней ДЕКА МЕСЯЦА (D-34:
// свайп «Вся сеть → парки», рубли и дни), затем два ВИДЖЕТА (два столбца):
// «Контроль Дня» (План/Факт %, стрелка тренда, Разрыв млн со знаком) и «Цели и
// планы» (Прогноз/План %, Прогноз выручки млн). Ниже — карта-сетка плиток, внизу
// графитовая ссылка b00m.fun. Данные — сетевой агрегат computeNetwork из
// daily-пейлоада; пока грузится — переливы (bc-skeleton) вместо значений.
// Строка пилюль «<Месяц>: <парки>» снята — см. комментарий у деки в шаблоне.

const NM_DAILY = 'Контроль\nДня'
const NM_GOALS = 'Цели и\nпланы'

// error/reload (05.08): раньше экран брал только data и loading, и любая осечка
// запроса выглядела как «данных нет» — прочерки во всех виджетах сразу, без единого
// намёка, что запрос упал. Остальные экраны дневного слоя (DailyScreen, Сводки,
// Разборы, Драйверы) состояние ошибки показывали, Главная — единственная — нет.
const { data, loading, error, reload } = useDaily()
const sets = computed(() => data.value?.sets || {})
const parkIdsWithDaily = computed(() =>
  PARKS.map((p) => p.id).filter((id) => Object.values(sets.value).some((s) => s.park === id)),
)
const net = computed(() => computeNetwork(sets.value, parkIdsWithDaily.value))
const t = computed(() => net.value.totals)
const ready = computed(() => net.value.cards.length > 0)

// Список имён парков и подпись месяца сняты вместе со строкой пилюль (D-34):
// месяц теперь в шапке деки, имена парков — в заголовках её слайдов.
const counters = computed(() => readCounters(data.value)) // v3.1: чекапы/сигналы (система)
// D-19: счётчик разборов — из журнала payload.reviews (длина массива), а не из
// stats: журнал грузится во фронт целиком, отдельного счётчика на бэке не нужно.
const reviews = computed(() => reviewCount(data.value && data.value.reviews))

const planFact = computed(() => (ready.value ? pct1(t.value.onPlanAvg) : '—'))
const planFactTrend = computed(() => (ready.value ? t.value.trendPlanFact || null : null))
const tail = computed(() => (ready.value ? mlnSigned(-t.value.tailCumSum) : '—'))
const pace = computed(() => (ready.value ? pctDelta(t.value.landDev) : '—'))
const forecastTrend = computed(() => (ready.value ? t.value.trendForecast || null : null))
const forecastSub = computed(() => (ready.value ? mlnRub(t.value.landing) : '—'))

// D-34: дека месяца в рублях и днях (факт → прогноз → план → цель). Экран 1 —
// вся сеть, дальше по экрану на парк. Числа — из того же сетевого агрегата,
// отдельного запроса нет. Цель по сети = null, если она задана не у всех парков
// (см. computeNetwork): половинчатую сумму на шкалу не пускаем.
//
// Один парк в данных → сетевой слайд не заводим: «Вся сеть» и этот парк были бы
// двумя одинаковыми экранами.
const monthSlides = computed(() => {
  if (!ready.value) return []
  // Порядок парков — от ближнего к выполнению плана к дальнему: свайп идёт от
  // благополучного к проблемному, последний экран = кому нужно внимание.
  // Мера близости — ПРОГНОЗ/ПЛАН (придём ли), а не факт/план (сколько уже есть):
  // вопрос «выполнит ли парк план» решается проекцией на конец месяца.
  // Плана нет → парк в конец (сравнивать не с чем, но и прятать нельзя).
  const rank = (c) => (c.target ? c.landing / c.target : -Infinity)
  const parks = [...net.value.cards]
    .sort((a, b) => rank(b) - rank(a))
    .map((c) => ({
      key: c.park,
      title: c.parkName || PARKS_BY_ID[c.park]?.name || c.park,
      // month — свой у каждого слайда: остаток дней считается по календарю
      // ИМЕННО его месяца (у отстающего парка последний месяц может отличаться).
      month: c.month,
      fact: c.earned, plan: c.target, forecast: c.landing, goal: c.goal,
      daysDone: c.daysDone, daysTotal: c.daysTotal,
    }))
  if (parks.length < 2) return parks
  return [{
    key: 'network', title: 'Вся сеть', month: t.value.month,
    fact: t.value.earned, plan: t.value.target, forecast: t.value.landing, goal: t.value.goal,
    daysDone: t.value.daysDone, daysTotal: t.value.daysTotal,
  }, ...parks]
})

const infoOpen = ref(false)

// Живые интерпретации для «Как читать виджеты» (реальные числа, разные формулировки).
const planFactInfo = computed(() => {
  if (!ready.value || t.value.onPlanAvg == null) return ''
  const v = t.value.onPlanAvg
  if (v > 1.001) return `Сейчас ${planFact.value} — опережаем план на сегодня.`
  if (v < 0.999) return `Сейчас ${planFact.value} — отстаём от плана на сегодня.`
  return `Сейчас ${planFact.value} — идём ровно по плану.`
})
const paceInfo = computed(() => {
  if (!ready.value || t.value.landDev == null) return ''
  const d = t.value.landDev
  if (d < -0.001) return `Сейчас ${pace.value} — по прогнозу придём на ${pct1(Math.abs(d))} ниже цели.`
  if (d > 0.001) return `Сейчас ${pace.value} — по прогнозу придём на ${pct1(d)} выше цели.`
  return `Сейчас ${pace.value} — по прогнозу выйдем ровно к цели.`
})

// Входы с Главной — теперь ТОЛЬКО под-страницы (setSubView). Ревизия 30.07
// (владелец): плитки «Тренды» и «Прогресс» убраны, вместе с ними ушли goSummary /
// goAnalytics и импорт setActive — эти разделы живут вкладками таб-бара, плитки их
// лишь дублировали. Доступ к ним не потерян.
function goDaily() { setSubView('daily') }
function goReviews() { setSubView('reviews') } // D-19: журнал разборов, вход только отсюда
function goGoals() { setSubView('goals') }
function goMaterials() { setSubView('materials') }
function goDrivers() { setSubView('drivers') } // 30.07: драйверы роста, вход только отсюда
// goProjects снят вместе с плиткой «Задачи» (30.07): вход в раздел — вкладка таб-бара.
</script>

<template>
  <section class="flex flex-col px-4 pb-6 pt-0">
    <!-- Загрузка не удалась. Виджеты ниже остаются на своих местах с прочерками —
         подменять весь экран нечем и незачем, — но человек теперь видит ПРИЧИНУ
         и может повторить, не перезапуская приложение. Цвет только фоном
         (color-mix от --negative), текст монохромный: контраст 14,4:1. -->
    <div
      v-if="error && !loading"
      data-test="home-load-error"
      role="alert"
      class="mb-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
      style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))"
    >
      <div class="min-w-0">
        <p class="text-[0.9375rem] font-medium leading-snug text-[var(--text)]">{{ L.load_error }}</p>
        <p class="mt-0.5 truncate text-[0.8125rem] leading-snug text-[var(--text-secondary)]">{{ error }}</p>
      </div>
      <button
        type="button"
        data-test="home-load-retry"
        class="shrink-0 rounded-full bg-[var(--surface)] px-4 text-[0.9375rem] font-medium text-[var(--text)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >{{ L.load_retry }}</button>
    </div>

    <!-- v3.1/D-19: полоса-счётчик (система): чекапы · сигналы · разборы.
         Чекапы/сигналы → «Контроль Дня» (заглушка — своей страницы пока нет,
         бэклог: boom-cmd-data/tasks/ЗАДАНИЕ-фронт-экран-Чекапы-Сигналы.md);
         разборы → журнал «Разбор полёта» (под-страница reviews, вход только отсюда). -->
    <div class="mb-3 flex w-full items-stretch overflow-hidden rounded-2xl bg-[var(--surface)] shadow-sm">
      <button
        type="button"
        aria-label="Открыть Контроль Дня"
        class="flex flex-1 flex-col items-center py-2.5 transition-opacity active:opacity-90"
        @click="goDaily"
      >
        <span v-if="loading" class="bc-skeleton h-[22px] w-10 rounded"></span>
        <span v-else class="text-[1.25rem] font-bold leading-none text-[var(--text)]">{{ counters.checkups ?? '—' }}</span>
        <span data-test="home-checkups-word" class="mt-1 text-[0.6875rem] text-[var(--text-muted)]">{{ checkupsWord(counters.checkups) }}</span>
      </button>
      <div class="my-2 w-px bg-[var(--line)]"></div>
      <button
        type="button"
        aria-label="Открыть Контроль Дня"
        class="flex flex-1 flex-col items-center py-2.5 transition-opacity active:opacity-90"
        @click="goDaily"
      >
        <span v-if="loading" class="bc-skeleton h-[22px] w-10 rounded"></span>
        <span v-else class="text-[1.25rem] font-bold leading-none text-[var(--text)]">{{ counters.signals ?? '—' }}</span>
        <span data-test="home-signals-word" class="mt-1 text-[0.6875rem] text-[var(--text-muted)]">{{ signalsWord(counters.signals) }}</span>
      </button>
      <div class="my-2 w-px bg-[var(--line)]"></div>
      <button
        type="button"
        data-test="home-reviews"
        aria-label="Открыть журнал разборов"
        class="flex flex-1 flex-col items-center py-2.5 transition-opacity active:opacity-90"
        @click="goReviews"
      >
        <span v-if="loading" class="bc-skeleton h-[22px] w-10 rounded"></span>
        <span v-else class="text-[1.25rem] font-bold leading-none text-[var(--text)]">{{ reviews ?? '—' }}</span>
        <span data-test="home-reviews-word" class="mt-1 text-[0.6875rem] text-[var(--text-muted)]">{{ reviewsWord(reviews) }}</span>
      </button>
    </div>

    <!-- D-34: дека месяца — рубли, дни и разрез по паркам. Над процентными
         виджетами: сначала абсолютная картина, потом детализация в процентах.
         Пилюли «<Месяц>: <парки>» СНЯТЫ — их работу делает заголовок слайда,
         причём честнее (пилюли перечисляли парки, а числа показывали сетевые). -->
    <MonthProgressCard
      class="mb-3"
      data-test="home-month-progress"
      :slides="monthSlides"
      :month="t.month || ''"
      :loading="loading"
    />

    <!-- два виджета -->
    <div class="flex gap-3">
      <HomeWidget
        class="flex-1"
        :icon="Gauge"
        :name="NM_DAILY"
        :metric-label="L.planfact"
        :value-main="planFact"
        :trend="planFactTrend"
        :sub-label="L.tail"
        :sub-value="tail"
        :loading="loading"
        @select="goDaily"
      />
      <HomeWidget
        class="flex-1"
        :icon="Target"
        :name="NM_GOALS"
        :metric-label="L.pace"
        :value-main="pace"
        :trend="forecastTrend"
        :sub-label="L.forecast"
        :sub-value="forecastSub"
        :loading="loading"
        @select="goGoals"
      />
    </div>

    <!-- как читать виджеты: инфо-блок + раскрывающееся пояснение -->
    <button
      type="button"
      class="mx-auto mt-2.5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-[var(--text-muted)] transition-colors active:bg-[var(--surface-2)]"
      :aria-expanded="infoOpen ? 'true' : 'false'"
      @click="infoOpen = !infoOpen"
    >
      <Info class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
      <span>Как читать виджеты</span>
    </button>
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="infoOpen"
        class="mt-1 rounded-2xl bg-[var(--surface)] p-4 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)] shadow-sm"
      >
        <p><b class="text-[var(--text)]">План/Факт</b> — сколько заработали к сегодняшнему дню от плана на прошедшие дни. 100% — идём ровно по плану, ниже — отстаём. Стрелка — тренд за последний день. {{ planFactInfo }}</p>
        <p class="mt-2"><b class="text-[var(--text)]">Прогноз/План</b> — если темп сохранится, насколько выручка месяца отклонится от цели. {{ paceInfo }}</p>
        <p class="mt-2"><b class="text-[var(--text)]">Вместе:</b> слева — где мы сейчас, справа — куда придём к концу месяца.</p>
        <p class="mt-2"><b class="text-[var(--text)]">Полоса месяца</b> — те же деньги, но в рублях. Верхняя тонкая линия — сколько дней месяца прошло, нижняя — сколько заработано. Деньги отстают от времени — не успеваем. <b class="text-[var(--text)]">План</b> — обязательство на месяц, <b class="text-[var(--text)]">цель</b> — амбиция сверху; они разные числа.</p>
      </div>
    </Transition>

    <!-- карта-сетка: плитки-приложения. Ревизия 30.07 (владелец): плитки «Тренды» и
         «Прогресс» убраны — они лишь дублировали вкладки таб-бара, доступ к разделам
         не потерян. Остались ТРИ входа, которых в таб-баре нет: «Драйверы» (первая),
         «Мастерплан», «Материалы». Сетка на 3 колонки: колонка стала шире (~130px
         на SE), подписи больше не обрезаются. -->
    <div class="mt-3.5 rounded-[22px] bg-[var(--surface)] px-2.5 pb-3.5 pt-[18px] shadow-sm">
      <div class="grid grid-cols-3 gap-1">
        <!-- «Драйверы» — первая: что подключено в парках, что готовится, что в очереди.
             Иконка — ракета (ускорители роста); Target/Gauge заняты виджетами. -->
        <button type="button" data-test="tile-drivers" class="flex min-w-0 flex-col items-center gap-2.5" @click="goDrivers">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><Rocket class="h-[28px] w-[28px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="max-w-full truncate text-[0.75rem] font-medium text-[var(--text)]">Драйверы</span>
        </button>
        <!-- 30.07: плитка «Задачи» заменена на «Мастерплан» → под-страница «Цели
             и планы». Иконка — карта: мастерплан читается как маршрут месяца,
             а мишень Target уже занята виджетом «Цели и планы». -->
        <button type="button" data-test="tile-masterplan" class="flex min-w-0 flex-col items-center gap-2.5" @click="goGoals">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><MapIcon class="h-[28px] w-[28px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="max-w-full truncate text-[0.75rem] font-medium text-[var(--text)]">Мастерплан</span>
        </button>
        <button type="button" data-test="tile-materials" class="flex min-w-0 flex-col items-center gap-2.5" @click="goMaterials">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><Folder class="h-[28px] w-[28px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="max-w-full truncate text-[0.75rem] font-medium text-[var(--text)]">Материалы</span>
        </button>
      </div>
    </div>

    <!-- графитовая ссылка -->
    <a
      href="https://b00m.fun"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-3.5 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[var(--graphite)] text-[var(--ink-on-color)] transition-opacity active:opacity-90"
    >
      <span class="text-[1rem] font-semibold">b00m.fun</span>
      <ExternalLink class="h-[18px] w-[18px]" :stroke-width="2" aria-hidden="true" />
    </a>

    <InstallPwaBanner />
  </section>
</template>
