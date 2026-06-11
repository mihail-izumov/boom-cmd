<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { formatGrowth, DASH } from '../../i18n/analytics.js'
import CompletenessBadge from './CompletenessBadge.vue'
import MonthlyTrend from './MonthlyTrend.vue'

// KPI-плитка на главном экране Аналитики (Слой 0 → клик ведёт на вкладку
// домена). Спокойная карточка: --surface + рамка --line; жёлтую заливку
// здесь НЕ используем (она зарезервирована за активным состоянием § дизайна).
//
// Состав:
//   • title — заголовок плитки;
//   • value — крупное основное значение (форматированная строка);
//   • sub   — вторая метрика рядом (опц.);
//   • growth — число прироста к прошлому периоду (опц., null → не показ.);
//   • completeness — объект для бейджа неполноты (опц., null → не показ.);
//   • series — массив { month, value } для крошечной sparkline (опц.);
//   • interactive (default true) — кликабельность.

const props = defineProps({
  title: { type: String, required: true },
  value: { type: String, required: true },
  sub: { type: String, default: null },
  note: { type: String, default: null },
  growth: { type: Number, default: null },
  completeness: { type: Object, default: null },
  series: { type: Array, default: null },
  interactive: { type: Boolean, default: true },
})
defineEmits(['open'])

const growthLabel = computed(() => formatGrowth(props.growth))
const growthTone = computed(() => {
  if (props.growth === null || props.growth === undefined || !Number.isFinite(props.growth)) {
    return 'text-[var(--text-muted)]'
  }
  if (props.growth > 0) return 'text-[var(--positive)]'
  if (props.growth < 0) return 'text-[var(--negative)]'
  return 'text-[var(--text-muted)]'
})
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="flex w-full flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors"
    :class="interactive ? 'active:bg-[var(--surface-2)]' : ''"
    style="min-height: 96px"
    @click="interactive && $emit('open')"
  >
    <div class="flex items-start gap-2">
      <span class="flex-1 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {{ title }}
      </span>
      <ChevronRight
        v-if="interactive"
        class="h-4 w-4 shrink-0 text-[var(--text-muted)]"
        :stroke-width="2"
      />
    </div>

    <div class="flex items-baseline gap-2">
      <span class="text-[1.5rem] font-semibold leading-tight text-[var(--text)]">{{ value }}</span>
      <span
        v-if="growth !== null && Number.isFinite(growth)"
        class="text-[0.875rem] font-medium leading-none"
        :class="growthTone"
      >{{ growthLabel }}</span>
    </div>

    <p v-if="sub" class="text-[0.875rem] text-[var(--text-secondary)]">{{ sub }}</p>
    <p v-if="note" class="text-[0.75rem] leading-snug text-[var(--text-muted)]">{{ note }}</p>

    <MonthlyTrend
      v-if="series && series.length"
      :series="series"
      variant="sparkline"
      :height="32"
    />

    <CompletenessBadge v-if="completeness" :completeness="completeness" />
  </component>
</template>
