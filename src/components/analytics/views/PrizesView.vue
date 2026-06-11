<script setup>
import { computed } from 'vue'
import {
  sumField,
  recalcPayoutTarget,
  recalcRatioCross,
  fieldCompleteness,
  monthlySeries,
} from '../../../composables/analyticsAggregate.js'
import {
  formatRub, formatRubCompact, formatInt, formatPct,
} from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MonthlyTrend from '../MonthlyTrend.vue'
import Layer3Stub from '../Layer3Stub.vue'

// Вкладка «Призотека» (prizes).
// Слой 1: Prize payout % (payout_target_pct по периоду, цель 20–25%) + payout от игровой выручки (кросс).
// Слой 2: Призов выдано, себестоимость, прибыльность = 100 − payout_target.
// Слой 3: stub.

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const rows = computed(() => props.data.prizes || [])
const econ = computed(() => props.data.game_econ || [])
const ctx = computed(() => props.ctx)

const payoutTarget = computed(() => recalcPayoutTarget({ rows: rows.value, ctx: ctx.value }))
const cPayoutTarget = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'payout_target_pct' }))

const payoutShare = computed(() => recalcRatioCross({
  rowsNum: rows.value, rowsDen: econ.value, ctx: ctx.value,
  num: 'prize_cost', den: 'game_revenue',
}))
const cPayoutShare = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'prize_cost' }))

const given = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'prizes_given' }))
const cost = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'prize_cost' }))
const cGiven = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'prizes_given' }))
const cCost = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'prize_cost' }))

const profitability = computed(() => {
  if (payoutTarget.value.value === null) return null
  return 100 - payoutTarget.value.value
})

const series = computed(() => monthlySeries({ rows: rows.value, ctx: ctx.value, field: 'prize_cost' }))
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Layer 1 -->
    <MetricCard
      title="Prize payout (цель 20–25 %)"
      :value="formatPct(payoutTarget.value)"
      sub="Σ себестоимость / Σ расч. выручка (по payout_target_pct месяца)"
      :completeness="cPayoutTarget"
      emphasis
    />

    <MetricCard
      title="Доля выручки в призы (payout от игровой)"
      :value="formatPct(payoutShare.value, 2)"
      sub="Σ себестоимость / Σ игровая выручка"
      :completeness="cPayoutShare"
      emphasis
    />

    <MetricCard
      title="Призов выдано"
      :value="formatInt(given.value)"
      :completeness="cGiven"
    />

    <MetricCard
      title="Себестоимость выданных призов"
      :value="formatRub(cost.value)"
      :completeness="cCost"
    />

    <MetricCard
      title="Прибыльность магазина"
      :value="formatPct(profitability)"
      sub="100 − payout_target (по периоду)"
    />

    <MetricCard title="Помесячный тренд себестоимости">
      <MonthlyTrend :series="series" variant="bar" :format="formatRubCompact" />
    </MetricCard>

    <Layer3Stub />
  </div>
</template>
