<script setup>
import { computed } from 'vue'
import {
  recalcRatio,
  weightedRatio,
  growthVsPrev,
  fieldCompleteness,
  pairCompleteness,
  sumOverCommonMonths,
  monthlySeries,
  monthlyWeightedSeries,
} from '../../../composables/analyticsAggregate.js'
import {
  formatInt, formatPct, formatGrowth,
} from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MonthlyTrend from '../MonthlyTrend.vue'
import Layer3Stub from '../Layer3Stub.vue'

// Вкладка «Игроки» (players).
// Слой 1: Σvisitors_total (по общим месяцам) + рост + доля новых.
// Слой 2: всего/новые/повторные с долями, capture_rate (взвеш.), тренд.
// Слой 3: stub.
//
// ВАЖНО (баг 2): все три величины — Σvisitors, Σnew, производные
// (повторные, доли) — считаются ТОЛЬКО по парк-месяцам, где не-null ОБА
// поля (visitors_total + new_visitors). Так производные совпадают с
// recalcRatio (доля новых) и со Сводным экраном, а бейдж «N из M мес»
// явно показывает покрытие. См. analyticsAggregate.sumOverCommonMonths.

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const rows = computed(() => props.data.players || [])
const ctx = computed(() => props.ctx)

const PAIR = ['visitors_total', 'new_visitors']

// Симметричные суммы по общим месяцам — единственная точка истины
// для всех видимых чисел на вкладке.
const paired = computed(() =>
  sumOverCommonMonths({ rows: rows.value, ctx: ctx.value, fields: PAIR }),
)
const sumVisitors = computed(() => paired.value.sums.visitors_total)
const sumNew = computed(() => paired.value.sums.new_visitors)
const returningTotal = computed(() => {
  // Симметрия снимает «отрицательные повторные» как симптом — Math.max
  // больше не нужен.
  if (sumVisitors.value === null || sumNew.value === null) return null
  return sumVisitors.value - sumNew.value
})
const shareNew = computed(() => {
  const v = sumVisitors.value
  const n = sumNew.value
  return v && n !== null ? (n / v) * 100 : null
})
const shareReturning = computed(() => {
  const v = sumVisitors.value
  const r = returningTotal.value
  return v && r !== null ? (r / v) * 100 : null
})

// Доля новых отдельно через recalcRatio — для проверки сходимости со
// Сводным экраном. Должна совпадать с shareNew побитово (на общих
// месяцах sumOverCommonMonths и recalcRatio считают одно и то же).
const newShare = computed(() => recalcRatio({
  rows: rows.value, ctx: ctx.value, num: 'new_visitors', den: 'visitors_total',
}))

const growth = computed(() => growthVsPrev({
  rows: rows.value, data: props.data, ctx: ctx.value, field: 'visitors_total',
}))

// Бейдж — на ПАРУ полей: «есть оба, иначе пропуск».
const cPair = computed(() => pairCompleteness({
  rows: rows.value, ctx: ctx.value, fields: PAIR,
}))

const capture = computed(() => weightedRatio({
  rows: rows.value, ctx: ctx.value, valueField: 'capture_rate_pct', weightField: 'visitors_total',
}))
const cCapture = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'capture_rate_pct' }))

const series = computed(() => monthlySeries({ rows: rows.value, ctx: ctx.value, field: 'visitors_total' }))
const captureSeries = computed(() => monthlyWeightedSeries({
  rows: rows.value, ctx: ctx.value, valueField: 'capture_rate_pct', weightField: 'visitors_total',
}))
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Layer 1 -->
    <MetricCard
      title="Посетителей за период"
      :value="formatInt(sumVisitors)"
      :completeness="cPair"
      emphasis
    >
      <p class="text-[0.875rem]">
        <span class="text-[var(--text-muted)]">из них новых:</span>
        <span class="ml-1 text-[var(--text)]">{{ formatInt(sumNew) }}</span>
        <span class="ml-1 text-[var(--text-muted)]">·</span>
        <span class="ml-1 text-[var(--text)]">{{ formatPct(newShare.value, 0) }}</span>
      </p>
      <p v-if="growth !== null" class="text-[0.875rem]">
        <span class="text-[var(--text-muted)]">рост к прошлому периоду:</span>
        <span
          class="ml-1 font-medium"
          :class="growth > 0 ? 'text-[var(--positive)]' : growth < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-secondary)]'"
        >{{ formatGrowth(growth) }}</span>
      </p>
      <p v-else class="text-[0.875rem] text-[var(--text-muted)]">
        рост к прошлому периоду: — (нужны два полных периода)
      </p>
    </MetricCard>

    <MetricCard
      title="Всего / новые / повторные"
      :completeness="cPair"
    >
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Всего</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatInt(sumVisitors) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Новые</span>
          <span class="text-[0.9375rem] text-[var(--text)]">
            {{ formatInt(sumNew) }}
            <span class="ml-1 text-[var(--text-muted)]">· {{ formatPct(shareNew, 0) }}</span>
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Повторные</span>
          <span class="text-[0.9375rem] text-[var(--text)]">
            {{ formatInt(returningTotal) }}
            <span class="ml-1 text-[var(--text-muted)]">· {{ formatPct(shareReturning, 0) }}</span>
          </span>
        </div>
      </div>
    </MetricCard>

    <MetricCard
      title="Capture rate (от трафика ТЦ)"
      :value="`≈ ${formatPct(capture.value, 2)}`"
      sub="взвешено по визитам. Источник трафика ТЦ — внешний, помесячная оговорка по контракту §3."
      :completeness="cCapture"
    >
      <MonthlyTrend :series="captureSeries" variant="line" :height="80" :format="(v) => formatPct(v, 2)" />
    </MetricCard>

    <MetricCard title="Помесячный тренд посетителей">
      <MonthlyTrend :series="series" variant="bar" :format="formatInt" />
    </MetricCard>

    <Layer3Stub />
  </div>
</template>
