<script setup>
import { computed } from 'vue'
import {
  sumField,
  lastInPeriod,
  fieldCompleteness,
} from '../../../composables/analyticsAggregate.js'
import { formatInt } from '../../../i18n/analytics.js'
import MetricCard from '../MetricCard.vue'
import MultiDateNotice from '../MultiDateNotice.vue'

// Вкладка «Отзывы» (reviews). Без слоёв — плоско, три метрики (чертёж).
// Поле «средняя оценка площадок» в API контракте отсутствует → прочерк с
// явной пометкой (PRODUCT-PRINCIPLES §6 — не врать, лучше «—»).

const props = defineProps({
  data: { type: Object, required: true },
  ctx: { type: Object, required: true },
})

const rows = computed(() => props.data.reviews || [])
const ctx = computed(() => props.ctx)

const yandexLast = computed(() => lastInPeriod({ rows: rows.value, ctx: ctx.value, field: 'yandex_total' }))
const twogisLast = computed(() => lastInPeriod({ rows: rows.value, ctx: ctx.value, field: 'twogis_total' }))
const growth = computed(() => sumField({ rows: rows.value, ctx: ctx.value, field: 'yandex_growth' }))

const cYandex = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'yandex_total' }))
const cTwogis = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'twogis_total' }))
const cGrowth = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'yandex_growth' }))
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="px-1 text-[0.8125rem] text-[var(--text-muted)]">
      Без слоёв — три метрики сразу
    </p>

    <MetricCard
      title="Средняя оценка площадок"
      value="—"
      sub="нет в текущем источнике; появится с подключением источника отзывов"
    />

    <MetricCard
      title="Отзывы Яндекс Карты (всего, последний месяц)"
      :value="formatInt(yandexLast.value)"
      :completeness="cYandex"
    >
      <MultiDateNotice :by-park="yandexLast.byPark" />
    </MetricCard>

    <MetricCard
      title="Отзывы 2ГИС (всего, последний месяц)"
      :value="formatInt(twogisLast.value)"
      :completeness="cTwogis"
    >
      <MultiDateNotice :by-park="twogisLast.byPark" />
    </MetricCard>

    <MetricCard
      title="Прирост отзывов за период (Яндекс)"
      :value="growth.value === null ? '—' : `+${formatInt(growth.value)}`"
      :completeness="cGrowth"
    />
  </div>
</template>
