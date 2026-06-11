<script setup>
import { computed } from 'vue'
import {
  sumField,
  recalcRatio,
  weightedRatio,
  recalcRatioCross,
  fieldCompleteness,
  monthlySeries,
} from '../../../composables/analyticsAggregate.js'
import {
  formatRub, formatRubCompact, formatRub2, formatInt, formatIntCompact, formatPct,
} from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MonthlyTrend from '../MonthlyTrend.vue'
import Layer3Stub from '../Layer3Stub.vue'

// Вкладка «Чек игры» (game_econ).
// Слой 1: средняя цена игры + payout_share_pct (кросс: prize_cost/game_revenue).
// Слой 2: тикетный контур (взвеш.) · игры · тикеты · бонусные очки · игровая выручка · тренд.
// Слой 3: stub.

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const rows = computed(() => props.data.game_econ || [])
const prizes = computed(() => props.data.prizes || [])
const ctx = computed(() => props.ctx)

const avgPrice = computed(() => recalcRatio({
  rows: rows.value, ctx: ctx.value, num: 'game_revenue', den: 'games', scale: 1,
}))
const cPrice = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'avg_game_price' }))

const payoutShare = computed(() => recalcRatioCross({
  rowsNum: prizes.value, rowsDen: rows.value, ctx: ctx.value,
  num: 'prize_cost', den: 'game_revenue',
}))
const cPayout = computed(() => fieldCompleteness({ rows: prizes.value, ctx: ctx.value, field: 'prize_cost' }))

const ticketLoop = computed(() => weightedRatio({
  rows: rows.value, ctx: ctx.value, valueField: 'ticket_loop_pct', weightField: 'game_revenue',
}))
const cTicketLoop = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'ticket_loop_pct' }))

const games = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'games' }))
const tickets = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'tickets_issued' }))
const bonus = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'bonus_points' }))
const gameRev = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'game_revenue' }))
const cGames = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'games' }))
const cTickets = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'tickets_issued' }))
const cBonus = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'bonus_points' }))
const cRev = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'game_revenue' }))

const series = computed(() => monthlySeries({ rows: rows.value, ctx: ctx.value, field: 'game_revenue' }))

// Выручка по контурам = Σgame_revenue × ticket_loop_weighted (тикетный)
// и × (100 − ticket_loop_weighted) (безтикетный). Контракт даёт только
// один процент тикетного контура — расщепляем суммарную выручку по нему.
const ticketRevenue = computed(() => {
  if (gameRev.value.value === null || ticketLoop.value.value === null) return null
  return gameRev.value.value * (ticketLoop.value.value / 100)
})
const nonTicketRevenue = computed(() => {
  if (gameRev.value.value === null || ticketLoop.value.value === null) return null
  return gameRev.value.value * (1 - ticketLoop.value.value / 100)
})
const nonTicketLoop = computed(() => {
  if (ticketLoop.value.value === null) return null
  return 100 - ticketLoop.value.value
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Layer 1 -->
    <MetricCard
      title="Средняя цена игры"
      :value="formatRub2(avgPrice.value)"
      sub="Σ игровая выручка / Σ игры (пересчёт по периоду)"
      :completeness="cPrice"
      emphasis
    />

    <MetricCard
      title="Payout от игровой выручки"
      :value="formatPct(payoutShare.value, 2)"
      sub="Σ себестоимость призов / Σ игровая выручка"
      :completeness="cPayout"
      emphasis
    />

    <MetricCard
      title="Тикетный vs безтикетный контур"
      :completeness="cTicketLoop"
      sub="взвешено по игровой выручке"
    >
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Тикетный</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatPct(ticketLoop.value) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Безтикетный</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatPct(nonTicketLoop) }}</span>
        </div>
      </div>
    </MetricCard>

    <MetricCard title="Выручка по контурам">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Тикетный</span>
          <span class="text-[0.9375rem] text-[var(--text)]">
            {{ formatRubCompact(ticketRevenue) }}
            <span class="ml-1 text-[var(--text-muted)]">· {{ formatPct(ticketLoop.value, 0) }}</span>
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Безтикетный</span>
          <span class="text-[0.9375rem] text-[var(--text)]">
            {{ formatRubCompact(nonTicketRevenue) }}
            <span class="ml-1 text-[var(--text-muted)]">· {{ formatPct(nonTicketLoop, 0) }}</span>
          </span>
        </div>
      </div>
    </MetricCard>

    <!-- Чертёж: «Средняя цена игры по контурам». В контракте нет разбиения
         games по контурам, только сводный avg_game_price (L1). Плейсхолдер. -->
    <MetricCard
      title="Средняя цена игры по контурам"
      value="—"
      sub="нет в текущем источнике; нужно games-by-loop разбиение в API"
    />

    <MetricCard title="Объёмы за период">
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Игры</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatInt(games.value) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Тикетов выдано</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatInt(tickets.value) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Бонусные очки</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatRub(bonus.value) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3 border-t border-[var(--line)] pt-1.5">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Игровая выручка</span>
          <span class="text-[0.9375rem] text-[var(--text)]">{{ formatRub(gameRev.value) }}</span>
        </div>
      </div>
    </MetricCard>

    <MetricCard title="Помесячный тренд игровой выручки">
      <MonthlyTrend :series="series" variant="bar" :format="formatRubCompact" />
    </MetricCard>

    <Layer3Stub />
  </div>
</template>
