<script setup>
import { computed } from 'vue'
import CompletenessBadge from './CompletenessBadge.vue'

// Универсальная метрик-карточка для слоя 1 / слоя 2 / плоского reviews.
// Состав: заголовок + крупное значение + подпись/комментарий + опц. бейдж
// неполноты. Внутри слотов можно положить структуру (доли) или тренд.
//
// emphasis=true → ТЁМНАЯ карточка (Слой 1, drill-anchor). Заливка `--text`,
// текст `--ink-on-color`. Чтобы вложенные элементы (бейдж, MultiDateNotice,
// MonthlyTrend, child-параграфы) автоматически перекрасились, мы локально
// переопределяем CSS-токены на уровне корня карточки — все ребёнки наследуют.
// Никакого хардкода hex/rgba: значения — color-mix от `--ink-on-color`
// (DESIGN-STANDARD §3.5: на тёмной заливке текст белый).

const props = defineProps({
  title: { type: String, required: true },
  value: { type: String, default: null },
  sub: { type: String, default: null },
  completeness: { type: Object, default: null },
  emphasis: { type: Boolean, default: false }, // более крупное value + тёмная карточка (слой 1)
})

const darkVars = {
  '--text': 'var(--ink-on-color)',
  '--text-secondary': 'color-mix(in srgb, var(--ink-on-color) 80%, transparent)',
  '--text-muted': 'color-mix(in srgb, var(--ink-on-color) 62%, transparent)',
  '--line': 'color-mix(in srgb, var(--ink-on-color) 22%, transparent)',
  '--surface-2': 'color-mix(in srgb, var(--ink-on-color) 14%, transparent)',
}

const rootStyle = computed(() => (props.emphasis ? darkVars : null))
</script>

<template>
  <article
    class="flex flex-col gap-2 rounded-2xl border p-3"
    :class="emphasis
      ? 'border-transparent bg-[var(--text)] text-[var(--ink-on-color)]'
      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'"
    :style="rootStyle"
  >
    <div class="flex items-start gap-2">
      <h3 class="flex-1 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {{ title }}
      </h3>
      <CompletenessBadge v-if="completeness" :completeness="completeness" />
    </div>
    <div v-if="value !== null && value !== undefined">
      <span
        class="font-semibold leading-tight text-[var(--text)]"
        :class="emphasis ? 'text-[1.75rem]' : 'text-[1.25rem]'"
      >{{ value }}</span>
    </div>
    <p v-if="sub" class="text-[0.875rem] leading-snug text-[var(--text-secondary)]">{{ sub }}</p>
    <slot />
  </article>
</template>
