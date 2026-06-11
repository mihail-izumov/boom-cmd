<script setup>
import { computed } from 'vue'
import {
  sumField,
  recalcRatio,
  recalcPayoutTarget,
  weightedRatio,
  weightedRatioCross,
  lastInPeriod,
  growthVsPrev,
  fieldCompleteness,
  monthlySeries,
} from '../../../composables/analyticsAggregate.js'
import {
  formatRubCompact,
  formatRub2,
  formatRub,
  formatInt,
  formatIntCompact,
  formatPct,
} from '../../../i18n/analytics.js'
import KpiTile from '../KpiTile.vue'

// Главный экран Аналитики — 8 KPI-плиток по чертежу. Каждая плитка ведёт
// на свою вкладку (PRODUCT-PRINCIPLES §3.5: прогрессивное раскрытие).
// Маппинг KPI → формула зафиксирован в ответе владельца:
//   1. Игровая выручка ₽ (Σgame_revenue) + ср. цена игры (Σgame_revenue/Σgames)
//   2. Тикетный контур % (взвешено по game_revenue)
//   3. Prize payout % (payout_target_pct по периоду, цель 20–25%)
//   4. Пополнения ₽ (Σtotal_revenue) + рост к прошлому периоду
//   5. Посетителей всего (Σvisitors_total) + доля новых (Σnew/Σvisitors)
//   6. % вернувшихся (взвешено по visitors_total, пометка «≈»)
//   7. Непогашенные обязательства (очки ₽ + тикеты шт, последний месяц)
//   8. Прирост отзывов (Σ yandex_growth)

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})
const emit = defineEmits(['open-domain'])

const ctx = computed(() => props.ctx)
const game_econ = computed(() => props.data.game_econ || [])
const revenue = computed(() => props.data.revenue || [])
const players = computed(() => props.data.players || [])
const cards = computed(() => props.data.cards || [])
const prizes = computed(() => props.data.prizes || [])
const reviews = computed(() => props.data.reviews || [])

// --- 1. Игровая выручка ₽ + ср. цена игры -----------------------------
const kpiGameRev = computed(() => {
  const sum = sumField({ rows: game_econ.value, ctx: ctx.value, field: 'game_revenue' })
  const price = recalcRatio({
    rows: game_econ.value, ctx: ctx.value, num: 'game_revenue', den: 'games',
  })
  return {
    value: formatRubCompact(sum.value),
    sub: `средняя цена игры ${formatRub2(price.value)}`,
    completeness: fieldCompleteness({ rows: game_econ.value, ctx: ctx.value, field: 'game_revenue' }),
    series: monthlySeries({ rows: game_econ.value, ctx: ctx.value, field: 'game_revenue' }),
  }
})

// --- 2. Тикетный контур % (взвешено по game_revenue) ------------------
const kpiTicketLoop = computed(() => {
  const v = weightedRatio({
    rows: game_econ.value, ctx: ctx.value, valueField: 'ticket_loop_pct', weightField: 'game_revenue',
  })
  return {
    value: formatPct(v.value),
    sub: 'взвешено по игровой выручке',
    completeness: fieldCompleteness({ rows: game_econ.value, ctx: ctx.value, field: 'ticket_loop_pct' }),
  }
})

// --- 3. Prize payout % (payout_target_pct, цель 20–25%) ---------------
const kpiPrizePayout = computed(() => {
  const v = recalcPayoutTarget({ rows: prizes.value, ctx: ctx.value })
  return {
    value: formatPct(v.value),
    sub: 'цель 20–25 %',
    completeness: fieldCompleteness({ rows: prizes.value, ctx: ctx.value, field: 'payout_target_pct' }),
  }
})

// --- 4. Пополнения ₽ + рост к прошлому периоду -------------------------
const kpiRevenue = computed(() => {
  const sum = sumField({ rows: revenue.value, ctx: ctx.value, field: 'total_revenue' })
  const growth = growthVsPrev({
    rows: revenue.value, data: props.data, ctx: ctx.value, field: 'total_revenue',
  })
  return {
    value: formatRubCompact(sum.value),
    sub: `всего ${formatRub(sum.value)}`,
    growth,
    completeness: fieldCompleteness({ rows: revenue.value, ctx: ctx.value, field: 'total_revenue' }),
    series: monthlySeries({ rows: revenue.value, ctx: ctx.value, field: 'total_revenue' }),
  }
})

// --- 5. Посетителей всего + доля новых --------------------------------
const kpiVisitors = computed(() => {
  const sum = sumField({ rows: players.value, ctx: ctx.value, field: 'visitors_total' })
  const share = recalcRatio({
    rows: players.value, ctx: ctx.value, num: 'new_visitors', den: 'visitors_total',
  })
  return {
    value: formatInt(sum.value),
    sub: `доля новых ${formatPct(share.value, 0)}`,
    completeness: fieldCompleteness({ rows: players.value, ctx: ctx.value, field: 'visitors_total' }),
  }
})

// --- 6. % вернувшихся (взвеш. по visitors_total, «≈») -----------------
const kpiReturning = computed(() => {
  // returning_pct в cards, visitors_total в players → кросс-доменное взвешивание.
  const v = weightedRatioCross({
    rowsValue: cards.value, rowsWeight: players.value, ctx: ctx.value,
    valueField: 'returning_pct', weightField: 'visitors_total',
  })
  const label = v.value === null ? '—' : `≈ ${formatPct(v.value)}`
  return {
    value: label,
    sub: 'взвешено по визитам',
    completeness: fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'returning_pct' }),
  }
})

// --- 7. Непогашенные обязательства (последний месяц) ------------------
const kpiObligations = computed(() => {
  const pts = lastInPeriod({ rows: cards.value, ctx: ctx.value, field: 'outstanding_points_rub' })
  const tix = lastInPeriod({ rows: cards.value, ctx: ctx.value, field: 'unredeemed_tickets_qty' })
  const multi = pts.multipleDates || tix.multipleDates
  return {
    value: formatRubCompact(pts.value),
    sub: `тикеты ${formatIntCompact(tix.value)}${tix.value !== null ? ' шт' : ''}`,
    note: multi ? 'на разные даты по паркам' : null,
    completeness: fieldCompleteness({ rows: cards.value, ctx: ctx.value, field: 'outstanding_points_rub' }),
  }
})

// --- 8. Прирост отзывов (Σ yandex_growth) ------------------------------
const kpiReviews = computed(() => {
  const sum = sumField({ rows: reviews.value, ctx: ctx.value, field: 'yandex_growth' })
  return {
    value: sum.value === null ? '—' : `+${formatInt(sum.value)}`,
    sub: 'Яндекс Карты',
    completeness: fieldCompleteness({ rows: reviews.value, ctx: ctx.value, field: 'yandex_growth' }),
  }
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-2">
      <KpiTile
        title="Игровая выручка"
        :value="kpiGameRev.value"
        :sub="kpiGameRev.sub"
        :completeness="kpiGameRev.completeness"
        :series="kpiGameRev.series"
        @open="emit('open-domain', 'game_econ')"
      />
      <KpiTile
        title="Тикетный контур"
        :value="kpiTicketLoop.value"
        :sub="kpiTicketLoop.sub"
        :completeness="kpiTicketLoop.completeness"
        @open="emit('open-domain', 'game_econ')"
      />
      <KpiTile
        title="Prize payout"
        :value="kpiPrizePayout.value"
        :sub="kpiPrizePayout.sub"
        :completeness="kpiPrizePayout.completeness"
        @open="emit('open-domain', 'prizes')"
      />
      <KpiTile
        title="Пополнения"
        :value="kpiRevenue.value"
        :sub="kpiRevenue.sub"
        :growth="kpiRevenue.growth"
        :completeness="kpiRevenue.completeness"
        :series="kpiRevenue.series"
        @open="emit('open-domain', 'revenue')"
      />
      <KpiTile
        title="Посетителей"
        :value="kpiVisitors.value"
        :sub="kpiVisitors.sub"
        :completeness="kpiVisitors.completeness"
        @open="emit('open-domain', 'players')"
      />
      <KpiTile
        title="Вернувшихся"
        :value="kpiReturning.value"
        :sub="kpiReturning.sub"
        :completeness="kpiReturning.completeness"
        @open="emit('open-domain', 'cards')"
      />
      <KpiTile
        title="Непогашенные обязательства"
        :value="kpiObligations.value"
        :sub="kpiObligations.sub"
        :note="kpiObligations.note"
        :completeness="kpiObligations.completeness"
        @open="emit('open-domain', 'cards')"
      />
      <KpiTile
        title="Прирост отзывов"
        :value="kpiReviews.value"
        :sub="kpiReviews.sub"
        :completeness="kpiReviews.completeness"
        @open="emit('open-domain', 'reviews')"
      />
    </div>
  </div>
</template>
