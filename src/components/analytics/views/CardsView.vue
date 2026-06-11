<script setup>
import { computed } from 'vue'
import {
  lastInPeriod,
  maxField,
  weightedRatioCross,
  fieldCompleteness,
  monthlyWeightedSeriesCross,
} from '../../../composables/analyticsAggregate.js'
import {
  formatRub, formatInt, formatPct,
} from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MonthlyTrend from '../MonthlyTrend.vue'
import MultiDateNotice from '../MultiDateNotice.vue'
import Layer3Stub from '../Layer3Stub.vue'

// Вкладка «Карты» (cards).
// Слой 1: % вернувшихся (взвеш.) + Непогашенные обязательства (очки/тикеты, последний месяц, разделено).
// Слой 2: avg_visits (взвеш.) · cards_in_system (последний) · outstanding_points (последний) · unredeemed_tickets (последний) · max_payment (max).
// Слой 3: stub.

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const cards = computed(() => props.data.cards || [])
const players = computed(() => props.data.players || [])
const ctx = computed(() => props.ctx)

const returning = computed(() => weightedRatioCross({
  rowsValue: cards.value, rowsWeight: players.value, ctx: ctx.value,
  valueField: 'returning_pct', weightField: 'visitors_total',
}))
const cReturning = computed(() => fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'returning_pct' }))
const returningSeries = computed(() => monthlyWeightedSeriesCross({
  rowsValue: cards.value, rowsWeight: players.value, ctx: ctx.value,
  valueField: 'returning_pct', weightField: 'visitors_total',
}))

const points = computed(() => lastInPeriod({ rows: cards.value, ctx: ctx.value, field: 'outstanding_points_rub' }))
const tickets = computed(() => lastInPeriod({ rows: cards.value, ctx: ctx.value, field: 'unredeemed_tickets_qty' }))
const cardsInSys = computed(() => lastInPeriod({ rows: cards.value, ctx: ctx.value, field: 'cards_in_system' }))
const cPoints = computed(() => fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'outstanding_points_rub' }))
const cTickets = computed(() => fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'unredeemed_tickets_qty' }))
const cCardsInSys = computed(() => fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'cards_in_system' }))

const avgVisits = computed(() => weightedRatioCross({
  rowsValue: cards.value, rowsWeight: players.value, ctx: ctx.value,
  valueField: 'avg_visits', weightField: 'visitors_total', scale: 1,
}))
const cAvgVisits = computed(() => fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'avg_visits' }))

const maxPay = computed(() => maxField({ rows: cards.value, ctx: ctx.value, field: 'max_payment_rub' }))
const cMaxPay = computed(() => fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'max_payment_rub' }))

function fmtAvgVisits(v) {
  if (v === null || !Number.isFinite(v)) return '—'
  return `≈ ${v.toFixed(2).replace('.', ',')} виз./карту`
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Layer 1 -->
    <MetricCard
      title="Вернувшихся за период"
      :value="returning.value === null ? '—' : `≈ ${formatPct(returning.value)}`"
      sub="взвешено по визитам"
      :completeness="cReturning"
      emphasis
    >
      <MonthlyTrend :series="returningSeries" variant="line" :height="72" :format="(v) => formatPct(v, 1)" />
    </MetricCard>

    <MetricCard
      title="Непогашенные обязательства (последний месяц)"
      :completeness="cPoints"
    >
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Очки-деньги</span>
          <span class="text-[1rem] font-semibold text-[var(--text)]">{{ formatRub(points.value) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Невыкупленные тикеты</span>
          <span class="text-[1rem] font-semibold text-[var(--text)]">
            <template v-if="tickets.value !== null">{{ formatInt(tickets.value) }} шт</template>
            <template v-else>—</template>
          </span>
        </div>
      </div>
      <MultiDateNotice :by-park="[...points.byPark, ...tickets.byPark]" />
    </MetricCard>

    <!-- Layer 2 -->
    <p class="px-1 pt-1 text-[0.75rem] uppercase tracking-wide text-[var(--text-muted)]">
      Слой 2 · сводный отчёт
    </p>

    <MetricCard
      title="Карт в системе (последний месяц)"
      :value="formatInt(cardsInSys.value)"
      :completeness="cCardsInSys"
    >
      <MultiDateNotice :by-park="cardsInSys.byPark" />
    </MetricCard>

    <MetricCard
      title="Средних визитов на карту"
      :value="fmtAvgVisits(avgVisits.value)"
      sub="взвешено по визитам"
      :completeness="cAvgVisits"
    />

    <!-- Чертёж: в L2 повторяются «Непогашенные очки-деньги ₽» и
         «Невыкупленные тикеты шт» как отдельные карточки drill-down. -->
    <MetricCard
      title="Непогашенные очки-деньги (последний месяц)"
      :value="formatRub(points.value)"
      :completeness="cPoints"
    >
      <MultiDateNotice :by-park="points.byPark" />
    </MetricCard>

    <MetricCard
      title="Невыкупленные тикеты (последний месяц)"
      :value="tickets.value !== null ? `${formatInt(tickets.value)} шт` : '—'"
      :completeness="cTickets"
    >
      <MultiDateNotice :by-park="tickets.byPark" />
    </MetricCard>

    <MetricCard
      title="Макс. разовый платёж (VIP)"
      :value="formatRub(maxPay.value)"
      sub="high-water mark по периоду"
      :completeness="cMaxPay"
    />

    <Layer3Stub />
  </div>
</template>
