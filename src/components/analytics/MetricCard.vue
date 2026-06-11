<script setup>
import CompletenessBadge from './CompletenessBadge.vue'

// Универсальная метрик-карточка для слоя 1 / слоя 2 / плоского reviews.
// Состав: заголовок + крупное значение + подпись/комментарий + опц. бейдж
// неполноты. Внутри слотов можно положить структуру (доли) или тренд.
// Кликабельность не нужна (карточки внутри уже открытой вкладки).

defineProps({
  title: { type: String, required: true },
  value: { type: String, default: null },
  sub: { type: String, default: null },
  completeness: { type: Object, default: null },
  emphasis: { type: Boolean, default: false }, // более крупное value (слой 1)
})
</script>

<template>
  <article class="flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
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
