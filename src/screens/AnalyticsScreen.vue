<script setup>
import { computed, ref } from 'vue'
import { useAnalytics } from '../composables/useAnalytics.js'
import { useParkContext } from '../composables/useParkContext.js'
import { computeContext } from '../composables/analyticsAggregate.js'
import { PERIODS, PERIOD_LABEL, monthLabel } from '../i18n/analytics.js'

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
// Парк-фильтр — глобальный через ParkFilterPill в шапке (uses useParkContext).
//
// Local state (таб + период) НЕ персистится. keep-alive держит экран живым
// между переключениями вкладок App-уровня (AppShell), так что выбор сохраняется.

const { data, loading, error, reload } = useAnalytics()
const { current: parkCtx } = useParkContext()

const period = ref('q') // 'month' | 'q' | 'year' — стартуем с 3 месяцев (типовой обзор)
const tab = ref('home')

const periodMonths = computed(() => {
  const p = PERIODS.find((x) => x.id === period.value)
  return p ? p.months : 3
})

const ctx = computed(() =>
  computeContext(data.value, { park: parkCtx.value, periodMonths: periodMonths.value }),
)

// Бейдж периода / парка / даты обновления — над контентом.
const headBadge = computed(() => {
  const parts = [PERIOD_LABEL[period.value] || '—']
  const ax = ctx.value.axis
  if (ax.length > 0) parts.push(`${monthLabel(ax[0])} – ${monthLabel(ax[ax.length - 1])}`)
  return parts.join(' · ')
})

const updatedLabel = computed(() => {
  const u = data.value?.updated
  if (!u || typeof u !== 'string') return null
  // 'YYYY-MM-DD...' → берём дату.
  const m = u.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `данные от ${m[3]}.${m[2]}.${m[1]}`
})

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

// Есть ли какие-то строки вообще для выбранного scope?
const hasAnyData = computed(() => {
  return ctx.value.axis.length > 0
})
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
      <PeriodSegmented v-model="period" class="bc-fade-in" />
      <SectionTabs v-model="tab" class="bc-fade-in" />

      <div class="bc-fade-in flex items-center justify-between gap-3 px-1">
        <p class="text-[0.75rem] text-[var(--text-muted)]">{{ headBadge }}</p>
        <p v-if="updatedLabel" class="text-[0.75rem] text-[var(--text-muted)]">{{ updatedLabel }}</p>
      </div>

      <component :is="ActiveView" class="bc-fade-in" :data="data" :ctx="ctx" @open-domain="openDomain" />
    </template>
  </section>
</template>
