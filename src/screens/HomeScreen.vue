<script setup>
import { computed, ref } from 'vue'
import { ChartColumnBig, ExternalLink, Folder, Gauge, Info, Layers, Newspaper, Target } from 'lucide-vue-next'
import HomeWidget from '../components/home/HomeWidget.vue'
import InstallPwaBanner from '../components/home/InstallPwaBanner.vue'
import { useDaily } from '../composables/useDaily.js'
import { computeNetwork } from '../composables/dailyModel.js'
import { PARKS, PARKS_BY_ID } from '../data/parks.js'
import { setActive, setSubView } from '../composables/useAppNav.js'
import { mlnRub, mlnSigned, pctDelta, pct1, monthCap, readCounters, L } from '../i18n/home.js'
import { L as LS } from '../i18n/summary.js'

// Home — командная дека. Два ВИДЖЕТА (два столбца): «Контроль Дня» (План/Факт %,
// серая стрелка тренда, Накопленный хвост млн со знаком) и «Цели и планы» (Прогноз
// выручки млн, Текущий темп %). Над ними — «<Месяц Год>: <парки>» (какие парки в
// данных). Ниже — карта-сетка из трёх серых плиток. Внизу — графитовая ссылка b00m.fun.
// Данные — сетевой агрегат computeNetwork из daily-пейлоада. Пока грузится — переливы
// (bc-skeleton) вместо значений; имена парков — с фолбэком на справочник parks.js.

const NM_DAILY = 'Контроль\nДня'
const NM_GOALS = 'Цели и\nпланы'
const SUMMARY_TILE = LS.home_tile

const { data, loading } = useDaily()
const sets = computed(() => data.value?.sets || {})
const parkIdsWithDaily = computed(() =>
  PARKS.map((p) => p.id).filter((id) => Object.values(sets.value).some((s) => s.park === id)),
)
const net = computed(() => computeNetwork(sets.value, parkIdsWithDaily.value))
const t = computed(() => net.value.totals)
const ready = computed(() => net.value.cards.length > 0)

const parkNames = computed(() =>
  net.value.cards.map((c) => c.parkName || PARKS_BY_ID[c.park]?.name).filter(Boolean),
)
const monthLabel = computed(() => (t.value.month ? monthCap(t.value.month) : ''))
const counters = computed(() => readCounters(data.value)) // v3.1: чекапы/сигналы (система)

const planFact = computed(() => (ready.value ? pct1(t.value.onPlanAvg) : '—'))
const planFactTrend = computed(() => (ready.value ? t.value.trendPlanFact || null : null))
const tail = computed(() => (ready.value ? mlnSigned(-t.value.tailCumSum) : '—'))
const pace = computed(() => (ready.value ? pctDelta(t.value.landDev) : '—'))
const forecastTrend = computed(() => (ready.value ? t.value.trendForecast || null : null))
const forecastSub = computed(() => (ready.value ? mlnRub(t.value.landing) : '—'))

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

function goDaily() { setSubView('daily') }
function goSummary() { setSubView('summary') }
function goGoals() { setSubView('goals') }
function goAnalytics() { setActive('analytics') }
function goProjects() { setActive('projects') }
function goMaterials() { setActive('materials') }
</script>

<template>
  <section class="flex flex-col px-4 pb-6 pt-0">
    <!-- v3.1: полоса-счётчик (система): всего чекапов · всего сигналов.
         Тап → «Контроль Дня» (заглушка — своей страницы чекапов/сигналов пока нет,
         бэклог: boom-cmd-data/tasks/ЗАДАНИЕ-фронт-экран-Чекапы-Сигналы.md). -->
    <button
      type="button"
      aria-label="Открыть Контроль Дня"
      class="mb-3 flex w-full items-stretch overflow-hidden rounded-2xl bg-[var(--surface)] shadow-sm transition-opacity active:opacity-90"
      @click="goDaily"
    >
      <div class="flex flex-1 flex-col items-center py-2.5">
        <span v-if="loading" class="bc-skeleton h-[22px] w-10 rounded"></span>
        <span v-else class="text-[1.25rem] font-bold leading-none text-[var(--text)]">{{ counters.checkups ?? '—' }}</span>
        <span class="mt-1 text-[0.6875rem] text-[var(--text-muted)]">{{ L.checkups }}</span>
      </div>
      <div class="my-2 w-px bg-[var(--line)]"></div>
      <div class="flex flex-1 flex-col items-center py-2.5">
        <span v-if="loading" class="bc-skeleton h-[22px] w-10 rounded"></span>
        <span v-else class="text-[1.25rem] font-bold leading-none text-[var(--text)]">{{ counters.signals ?? '—' }}</span>
        <span class="mt-1 text-[0.6875rem] text-[var(--text-muted)]">{{ L.signals }}</span>
      </div>
    </button>

    <!-- <Месяц Год>: парки в данных. Пока грузится — переливы. -->
    <div v-if="loading || (ready && parkNames.length)" class="mb-3 flex flex-nowrap items-center justify-center gap-[7px]">
      <template v-if="loading">
        <span class="bc-skeleton h-[15px] w-[78px] shrink-0 rounded"></span>
        <span class="bc-skeleton h-[22px] w-[74px] shrink-0 rounded-full"></span>
        <span class="bc-skeleton h-[22px] w-[74px] shrink-0 rounded-full"></span>
      </template>
      <template v-else>
        <span class="shrink-0 text-[0.75rem] font-bold text-[var(--text-secondary)]">{{ monthLabel }}:</span>
        <span
          v-for="p in parkNames"
          :key="p"
          class="shrink-0 whitespace-nowrap rounded-full border border-[var(--line)] px-[9px] py-[3px] text-[0.6875rem] font-semibold text-[var(--text-muted)]"
        >{{ p }}</span>
      </template>
    </div>

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
      </div>
    </Transition>

    <!-- карта-сетка: плитки-приложения. «Сводки» — первая (вход в сетевые сводки
         дня/недели/месяца). Сетка на 4 колонки: на узких экранах (SE, 375px)
         колонка ~80px, иконка 60px + подпись в одну строку помещаются. -->
    <div class="mt-3.5 rounded-[22px] bg-[var(--surface)] px-2.5 pb-3.5 pt-[18px] shadow-sm">
      <div class="grid grid-cols-4 gap-1">
        <button type="button" data-test="tile-summary" class="flex min-w-0 flex-col items-center gap-2.5" @click="goSummary">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><Newspaper class="h-[28px] w-[28px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="max-w-full truncate text-[0.75rem] font-medium text-[var(--text)]">{{ SUMMARY_TILE }}</span>
        </button>
        <button type="button" class="flex min-w-0 flex-col items-center gap-2.5" @click="goAnalytics">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><ChartColumnBig class="h-[28px] w-[28px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="max-w-full truncate text-[0.75rem] font-medium text-[var(--text)]">Аналитика</span>
        </button>
        <button type="button" class="flex min-w-0 flex-col items-center gap-2.5" @click="goProjects">
          <span class="flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><Layers class="h-[28px] w-[28px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="max-w-full truncate text-[0.75rem] font-medium text-[var(--text)]">Проекты</span>
        </button>
        <button type="button" class="flex min-w-0 flex-col items-center gap-2.5" @click="goMaterials">
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
