<script setup>
import { computed } from 'vue'
import {
  sumField,
  recalcRatio,
  growthVsPrev,
  fieldCompleteness,
  monthlySeries,
  shareOfTotal,
} from '../../../composables/analyticsAggregate.js'
import {
  formatRub, formatRubCompact, formatRub2, formatInt, formatPct, formatGrowth,
  pluralRu,
} from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MonthlyTrend from '../MonthlyTrend.vue'
import Layer3Stub from '../Layer3Stub.vue'

// Вкладка «Пополнения, ₽» (revenue).
// Слой 1: Итого пополнения + рост.
// Слой 2: безнал / нал / сайт долями, средний чек, помесячный тренд.
// Слой 3: stub.

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const rows = computed(() => props.data.revenue || [])
const ctx = computed(() => props.ctx)

const sumTotal = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'total_revenue' }))
const growth = computed(() => growthVsPrev({ rows: rows.value, data: props.data, ctx: ctx.value, field: 'total_revenue' }))
const cTotal = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'total_revenue' }))
const cCashStruct = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'cashless' }))

const series = computed(() => monthlySeries({ rows: rows.value, ctx: ctx.value, field: 'total_revenue' }))

const struct = computed(() => shareOfTotal({
  rows: rows.value, ctx: ctx.value, fields: ['cashless', 'cash', 'website'],
}))

const sumReceipts = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'receipts' }))
const avgCheck = computed(() => recalcRatio({
  rows: rows.value, ctx: ctx.value, num: 'total_revenue', den: 'receipts', scale: 1,
}))
const cReceipts = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'receipts' }))

const STRUCT_LABEL = { cashless: 'Безнал', cash: 'Нал', website: 'Сайт' }
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Layer 1 -->
    <MetricCard
      title="Итого пополнения за период"
      :value="formatRub(sumTotal.value)"
      :completeness="cTotal"
      emphasis
    >
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
      title="Структура: безнал · нал · сайт"
      :completeness="cCashStruct"
    >
      <div class="flex flex-col gap-1.5">
        <div
          v-for="s in struct"
          :key="s.field"
          class="flex items-baseline justify-between gap-3"
        >
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">{{ STRUCT_LABEL[s.field] }}</span>
          <span class="text-[0.9375rem] text-[var(--text)]">
            <template v-if="s.value !== null">
              {{ formatRubCompact(s.value) }}
              <span class="ml-1 text-[var(--text-muted)]">·</span>
              <span class="ml-1 text-[var(--text-muted)]">{{ formatPct(s.share, 0) }}</span>
            </template>
            <template v-else>—</template>
          </span>
        </div>
      </div>
    </MetricCard>

    <MetricCard
      title="Средний чек пополнения"
      :value="formatRub2(avgCheck.value)"
      :sub="`всего чеков: ${formatInt(sumReceipts.value)} ${sumReceipts.value !== null ? pluralRu(sumReceipts.value, ['чек','чека','чеков']) : ''}`"
      :completeness="cReceipts"
    />

    <!-- Чертёж: «Покупка очков vs гостевые карты». В API контракте этого
         разбиения нет (см. DATA-CONTRACT §2). Показываем явный плейсхолдер,
         чтобы не врать (PRODUCT-PRINCIPLES §6). -->
    <MetricCard
      title="Покупка очков vs гостевые карты"
      value="—"
      sub="нет в текущем источнике; появится с раздельным учётом каналов оплаты"
    />

    <MetricCard title="Помесячный тренд пополнений">
      <MonthlyTrend :series="series" variant="bar" :format="formatRubCompact" />
    </MetricCard>

    <Layer3Stub />
  </div>
</template>
