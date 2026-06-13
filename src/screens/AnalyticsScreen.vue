<script setup>
import { computed, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { useAnalytics } from '../composables/useAnalytics.js'
import { useParkContext } from '../composables/useParkContext.js'
import { useNavCaption } from '../composables/useNavCaption.js'
import { computeContext } from '../composables/analyticsAggregate.js'
import { PERIODS, monthLabel, monthShortCap } from '../i18n/analytics.js'

import PeriodSegmented from '../components/analytics/PeriodSegmented.vue'
import SectionTabs from '../components/analytics/SectionTabs.vue'

import HomeView from '../components/analytics/views/HomeView.vue'
import RevenueView from '../components/analytics/views/RevenueView.vue'
import PlayersView from '../components/analytics/views/PlayersView.vue'
import CardsView from '../components/analytics/views/CardsView.vue'
import GameEconView from '../components/analytics/views/GameEconView.vue'
import PrizesView from '../components/analytics/views/PrizesView.vue'
import ReviewsView from '../components/analytics/views/ReviewsView.vue'

// Экран «Аналитика». 4 состояния (loading/error/empty/data) + локальная
// навигация секции: переключатель периода + лента вкладок (home + 6 доменов).
// Парк-фильтр — глобальный через ParkFilterPill в шапке (useParkContext).
//
// «данные от …» уходит мелкой подписью НАД крупным заголовком «Аналитика»
// через useNavCaption — экран сам ставит её при активации и чистит при
// уходе. Период (диапазон месяцев) — отдельной строкой по центру под
// переключателем; слово «3 мес» / «12 мес» / имя месяца дублирует кнопку
// и потому в строке не пишется.

const { data, loading, error, reload } = useAnalytics()
const { current: parkCtx } = useParkContext()
const { setCaption, clearCaption } = useNavCaption()

const period = ref('q') // 'month' | 'q' | 'year' — стартуем с 3 месяцев
const tab = ref('home')

const periodMonths = computed(() => {
  const p = PERIODS.find((x) => x.id === period.value)
  return p ? p.months : 3
})

const ctx = computed(() =>
  computeContext(data.value, { park: parkCtx.value, periodMonths: periodMonths.value }),
)

// Подмена лейбла кнопки «Месяц» именем текущего месяца (например «Май»),
// чтобы кнопка всегда отражала актуальный период.
const periodLabels = computed(() => {
  const ax = ctx.value.axis
  const lastYm = ax.length ? ax[ax.length - 1] : null
  return { month: lastYm ? monthShortCap(lastYm) : 'Месяц' }
})

// Диапазон месяцев под переключателем («апр 2025 – июн 2025»).
const rangeLabel = computed(() => {
  const ax = ctx.value.axis
  if (!ax.length) return ''
  if (ax.length === 1) return monthLabel(ax[0])
  return `${monthLabel(ax[0])} – ${monthLabel(ax[ax.length - 1])}`
})

// Дата актуальности данных Аналитики — ФИКСИРОВАННАЯ, правится ВРУЧНУЮ
// владельцем при обновлении выгрузки (ревизия 13.06.2026). Раньше бралась
// из data.updated и подставлялась текущая дата автоматически — это баг.
// ↓↓↓ менять здесь при обновлении данных ↓↓↓
const DATA_AS_OF = '11.06.2026'
const updatedLabel = computed(() => `данные от ${DATA_AS_OF}`)

// Caption над H1 в шапке — только пока экран активен (keep-alive).
let isActive = false
function syncCaption() {
  if (isActive) setCaption(updatedLabel.value)
}
onMounted(() => { isActive = true; syncCaption() })
onActivated(() => { isActive = true; syncCaption() })
onDeactivated(() => { isActive = false; clearCaption() })
watch(updatedLabel, () => syncCaption())

// Контент по активной вкладке.
const ActiveView = computed(() => {
  switch (tab.value) {
    case 'revenue': return RevenueView
    case 'players': return PlayersView
    case 'cards': return CardsView
    case 'game_econ': return GameEconView
    case 'prizes': return PrizesView
    case 'reviews': return ReviewsView
    default: return HomeView
  }
})

function openDomain(id) {
  tab.value = id
}

const hasAnyData = computed(() => ctx.value.axis.length > 0)
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-1">
    <!-- loading -->
    <div
      v-if="loading"
      class="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Загрузка"
    >
      <div class="bc-skeleton h-11 rounded-full" />
      <div class="bc-skeleton h-11 rounded-full" />
      <div class="grid grid-cols-2 gap-2">
        <div v-for="i in 6" :key="i" class="bc-skeleton h-28 rounded-2xl" />
      </div>
      <p class="px-1 text-[0.875rem] text-[var(--text-muted)]">Загрузка…</p>
    </div>

    <!-- error -->
    <div
      v-else-if="error"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">Не удалось загрузить аналитику</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >Повторить</button>
    </div>

    <!-- empty: под выбранный scope нет данных -->
    <div
      v-else-if="!hasAnyData"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">Данных по выбранному парку нет</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">Выберите другой парк или «Вся сеть» в фильтре сверху.</p>
    </div>

    <!-- data -->
    <template v-else>
      <PeriodSegmented v-model="period" :labels="periodLabels" class="bc-fade-in" />
      <p
        v-if="rangeLabel"
        class="bc-fade-in -mt-1 px-1 text-center text-[0.75rem] text-[var(--text-muted)]"
      >{{ rangeLabel }}</p>

      <SectionTabs v-model="tab" class="bc-fade-in" />

      <component :is="ActiveView" class="bc-fade-in" :data="data" :ctx="ctx" @open-domain="openDomain" />
    </template>
  </section>
</template>
