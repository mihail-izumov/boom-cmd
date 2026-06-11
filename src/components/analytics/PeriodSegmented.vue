<script setup>
import { computed } from 'vue'
import { PERIODS } from '../../i18n/analytics.js'

// Сегмент-переключатель периода (Месяц / 3 мес / 12 мес).
// Без обводки; подложка — `--line` (заметно темнее --surface-2); активный
// сегмент — белая «пилюля» с лёгкой тенью + полужирный текст; неактивные
// — `--text-muted`. Текст монохромный (DESIGN-STANDARD §3.5). ≥44pt.
//
// Лейблы можно переопределить через prop `labels` — Аналитика подменяет
// «Месяц» именем актуального месяца («Май»), чтобы кнопка всегда была
// актуальна периоду.

const props = defineProps({
  modelValue: { type: String, required: true },
  labels: { type: Object, default: () => ({}) },
})
defineEmits(['update:modelValue'])

const items = computed(() =>
  PERIODS.map((p) => ({ id: p.id, label: props.labels[p.id] || p.label })),
)
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Период"
    class="inline-flex w-full select-none rounded-full bg-[var(--line)] p-0.5"
  >
    <button
      v-for="p in items"
      :key="p.id"
      type="button"
      role="radio"
      :aria-checked="modelValue === p.id"
      class="flex flex-1 items-center justify-center rounded-full px-3 text-[0.9375rem] transition-colors"
      :class="modelValue === p.id
        ? 'bg-[var(--surface)] font-semibold text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
        : 'font-medium text-[var(--text-muted)] active:text-[var(--text)]'"
      style="min-height: 44px"
      @click="$emit('update:modelValue', p.id)"
    >{{ p.label }}</button>
  </div>
</template>
