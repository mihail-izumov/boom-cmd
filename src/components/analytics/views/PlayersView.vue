<script setup>
import { computed } from 'vue'
import {
  sumField,
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

// Вкладка «Игроки» (players). Решение владельца 12.06 — Вариант B:
//   new_visitors — самодостаточная метрика, показывается ОТДЕЛЬНОЙ карточкой
//   c sumField(new_visitors) и собственным fieldCompleteness; всё парное
//   (всего, повторные, обе доли) — только из sumOverCommonMonths и его
//   pairCompleteness. Деление новых на «всего» из других месяцев запрещено.
//
// Карточки PlayersView:
//   Слой 1 (emphasis): «Посетителей за период» — пара (Σvisitors, sub
//     «из них новых X · Y%» только когда пара непуста).
//   Слой 2 «Новых за период» — standalone, своя полнота.
//   Слой 2 «Структура: всего · новые · повторные» — пара, 3 строки + 2 доли.
//   Слой 2 «Capture rate» — weighted, как было.
//   Слой 2 «Помесячный тренд» — visitors_total, как было.
//   Слой 3 — заглушка.

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const rows = computed(() => props.data.players || [])
const ctx = computed(() => props.ctx)

const PAIR = ['visitors_total', 'new_visitors']

// === Пара (visitors+new) — единственный источник для всего парного ===
const paired = computed(() =>
  sumOverCommonMonths({ rows: rows.value, ctx: ctx.value, fields: PAIR }),
)
const sumVisitors = computed(() => paired.value.sums.visitors_total)
const sumNewPair = computed(() => paired.value.sums.new_visitors)
const returningTotal = computed(() => {
  if (sumVisitors.value === null || sumNewPair.value === null) return null
  return sumVisitors.value - sumNewPair.value
})
const shareNew = computed(() => {
  const v = sumVisitors.value
  const n = sumNewPair.value
  return v && n !== null ? (n / v) * 100 : null
})
const shareReturning = computed(() => {
  const v = sumVisitors.value
  const r = returningTotal.value
  return v && r !== null ? (r / v) * 100 : null
})
const cPair = computed(() => pairCompleteness({
  rows: rows.value, ctx: ctx.value, fields: PAIR,
}))

// === Standalone «Новых» — независимая метрика ===
// sumField(new_visitors) считает по месяцам, где есть new_visitors, не
// зависит от полноты visitors_total. Так у Питерленда-2026 на коротких
// окнах standalone закроет дыру, когда пара пуста (см. приёмку).
const sumNewStandalone = computed(() =>
  sumField({ rows: rows.value, ctx: ctx.value, field: 'new_visitors' }),
)
const cNewStandalone = computed(() =>
  fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'new_visitors' }),
)

// === Прочее ===
// Доля новых отдельно через recalcRatio — для сверки с сводным экраном.
// Должна совпадать с shareNew побитово.
const newShareCheck = computed(() => recalcRatio({
  rows: rows.value, ctx: ctx.value, num: 'new_visitors', den: 'visitors_total',
}))

const growth = computed(() => growthVsPrev({
  rows: rows.value, data: props.data, ctx: ctx.value, field: 'visitors_total',
}))

const capture = computed(() => weightedRatio({
  rows: rows.value, ctx: ctx.value, valueField: 'capture_rate_pct', weightField: 'visitors_total',
}))
const cCapture = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'capture_rate_pct' }))

const series = computed(() => monthlySeries({ rows: rows.value, ctx: ctx.value, field: 'visitors_total' }))
const captureSeries = computed(() => monthlyWeightedSeries({
  rows: rows.value, ctx: ctx.value, valueField: 'capture_rate_pct', weightField: 'visitors_total',
}))

// Условие отображения sub-строки «из них новых …» в L1: только когда пара
// непуста (иначе показывать % было бы делением на чужие месяцы).
const pairHasData = computed(() => sumVisitors.value !== null && sumNewPair.value !== null)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Layer 1: пара (всего за период) -->
    <MetricCard
      title="Посетителей за период"
      :value="formatInt(sumVisitors)"
      :completeness="cPair"
      emphasis
    >
      <p v-if="pairHasData" class="text-[0.875rem]">
        <span class="text-[var(--text-muted)]">из них новых:</span>
        <span class="ml-1 text-[var(--text)]">{{ formatInt(sumNewPair) }}</span>
        <span class="ml-1 text-[var(--text-muted)]">·</span>
        <span class="ml-1 text-[var(--text)]">{{ formatPct(newShareCheck.value, 0) }}</span>
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

    <!-- Layer 2: «Новых за период» — STANDALONE, не зависит от пары.
         Бейдж — fieldCompleteness(new_visitors), отдельный от парного. -->
    <MetricCard
      title="Новых за период"
      :value="formatInt(sumNewStandalone.value)"
      :completeness="cNewStandalone"
      sub="самостоятельная метрика — независимая полнота от «всего»"
    />

    <!-- Layer 2: парная структура. Бейдж — pairCompleteness; всё внутри
         считается на общих месяцах. Это та самая «пара», от которой
         standalone-новых сознательно отделён выше. -->
    <MetricCard
      title="Всего · новые · повторные (по общим месяцам)"
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
            {{ formatInt(sumNewPair) }}
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
