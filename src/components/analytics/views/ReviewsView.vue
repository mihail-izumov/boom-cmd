<script setup>
import { computed } from 'vue'
import {
  sumField,
  lastInPeriod,
  fieldCompleteness,
} from '../../../composables/analyticsAggregate.js'
import { formatInt, formatIntSigned } from '../../../i18n/analytics.js'
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

// Бейдж неполноты на объединённой карточке «Отзывы (всего)» опираем на
// yandex_total — это основной источник для общей суммы (2ГИС часто пуст).
const cYandex = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'yandex_total' }))
const cGrowth = computed(() => fieldCompleteness({ rows: rows.value, ctx: ctx.value, field: 'yandex_growth' }))
</script>

<template>
  <div class="flex flex-col gap-3">
    <MetricCard
      title="Средняя оценка площадок"
      value="—"
      sub="нет в текущем источнике; появится с подключением источника отзывов"
    />

    <!-- Чертёж: «Отзывы Яндекс Карты + 2ГИС (всего)» — одна метрика парой. -->
    <MetricCard
      title="Отзывы (всего, последний месяц)"
      :completeness="cYandex"
    >
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">Яндекс Карты</span>
          <span class="text-[1rem] font-semibold text-[var(--text)]">{{ formatInt(yandexLast.value) }}</span>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[0.9375rem] text-[var(--text-secondary)]">2ГИС</span>
          <span class="text-[1rem] font-semibold text-[var(--text)]">{{ formatInt(twogisLast.value) }}</span>
        </div>
      </div>
      <MultiDateNotice :by-park="[...yandexLast.byPark, ...twogisLast.byPark]" />
    </MetricCard>

    <MetricCard
      title="Прирост отзывов за период (Яндекс)"
      :value="formatIntSigned(growth.value)"
      :completeness="cGrowth"
    />
  </div>
</template>
