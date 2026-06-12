<script setup>
import { computed } from 'vue'
import {
  lastInPeriod,
  balanceDelta,
  maxField,
  weightedRatioCross,
  fieldCompleteness,
  monthlyWeightedSeriesCross,
} from '../../../composables/analyticsAggregate.js'
import {
  formatRub, formatInt, formatPct,
  formatRubSigned, formatQtySigned,
  balanceTitle, deltaRowLabel, BALANCE_LABELS,
} from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MonthlyTrend from '../MonthlyTrend.vue'
import MultiDateNotice from '../MultiDateNotice.vue'
import Layer3Stub from '../Layer3Stub.vue'

// Вкладка «Карты» (cards).
// Слой 1: % вернувшихся (взвеш.) + Непогашенные обязательства (очки/тикеты, баланс на дату + Δ за период).
// Слой 2: avg_visits (взвеш.) · cards_in_system (баланс) · outstanding_points (баланс) · unredeemed_tickets (баланс) · max_payment (max).
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

// --- БАЛАНС+Δ (контракт §3, вариант B — утверждён владельцем) ----------
// Балансовые значения остаются на lastInPeriod; balanceDelta считает
// только Δ за период. Текст строго монохромный (DESIGN-STANDARD).
const dPoints = computed(() => balanceDelta({ rows: cards.value, ctx: ctx.value, field: 'outstanding_points_rub' }))
const dTickets = computed(() => balanceDelta({ rows: cards.value, ctx: ctx.value, field: 'unredeemed_tickets_qty' }))

// Заголовки «{Название} · баланс на {DD.MM.YYYY}» — через i18n.
const titleObligations = computed(() => balanceTitle('obligations', [...points.value.dates, ...tickets.value.dates]))
const titleCardsInSys = computed(() => balanceTitle('cards_in_system', cardsInSys.value.dates))
const titlePoints = computed(() => balanceTitle('outstanding_points', points.value.dates))
const titleTickets = computed(() => balanceTitle('unredeemed_tickets', tickets.value.dates))

// Строка Δ — только в карточке «Непогашенные обязательства».
const deltaLabel = computed(() => deltaRowLabel(dPoints.value, dTickets.value))
const deltaAvailable = computed(() => dPoints.value.value !== null || dTickets.value.value !== null)
const deltaValue = computed(() => `${formatRubSigned(dPoints.value.value)} · ${formatQtySigned(dTickets.value.value)}`)
const deltaNoData = computed(() => BALANCE_LABELS.deltaNoData(dPoints.value.prevMonth ?? dTickets.value.prevMonth))
// Бейдж «k из n парков» — network, Δ определена не у всех парков.
// k/n берём по основному полю (очки-деньги): оба поля живут в одних
// строках домена cards, расхождение покрытий на практике не возникает.
const deltaParksBadge = computed(() => {
  if (ctx.value.park !== 'network') return null
  const d = dPoints.value
  if (d.value === null || d.contribParks >= d.totalParks) return null
  return BALANCE_LABELS.deltaParks(d.contribParks, d.totalParks)
})

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
      :title="titleObligations"
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
        <!-- Δ за период (вариант B). Знак всегда явный; текст монохромный —
             никаких цветных дельт (DESIGN-STANDARD). -->
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">{{ deltaLabel }}</span>
          <span v-if="deltaAvailable" class="text-[1rem] font-semibold text-[var(--text)]">{{ deltaValue }}</span>
          <span v-else class="text-[0.9375rem] text-[var(--text-secondary)]">{{ deltaNoData }}</span>
        </div>
        <div v-if="deltaParksBadge" class="flex justify-end">
          <span class="inline-flex items-center rounded-full bg-[var(--surface-2)] px-2 py-1 text-[0.75rem] leading-none text-[var(--text-muted)]">{{ deltaParksBadge }}</span>
        </div>
      </div>
      <MultiDateNotice :by-park="[...points.byPark, ...tickets.byPark]" />
    </MetricCard>

    <MetricCard
      :title="titleCardsInSys"
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
         «Невыкупленные тикеты шт» как отдельные карточки drill-down.
         Подписи — «баланс на дату» (вариант B), Δ здесь НЕ показываем:
         строка Δ — только в карточке «Непогашенные обязательства». -->
    <MetricCard
      :title="titlePoints"
      :value="formatRub(points.value)"
      :completeness="cPoints"
    >
      <MultiDateNotice :by-park="points.byPark" />
    </MetricCard>

    <MetricCard
      :title="titleTickets"
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
