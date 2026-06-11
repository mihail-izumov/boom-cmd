<script setup>
import { PERIODS } from '../../i18n/analytics.js'

// Сегмент-переключатель периода (Месяц / 3 месяца / Год).
// Стиль: контейнер --surface-2 в тонкой рамке --line, активный сегмент —
// --surface с лёгкой тенью; текст монохромный (DESIGN-STANDARD §3.5).
// Тач-таргеты ≥44pt.

const props = defineProps({
  modelValue: { type: String, required: true },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div
    role="radiogroup"
    aria-label="Период"
    class="inline-flex w-full select-none rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
  >
    <button
      v-for="p in PERIODS"
      :key="p.id"
      type="button"
      role="radio"
      :aria-checked="modelValue === p.id"
      class="flex flex-1 items-center justify-center rounded-full px-3 text-[0.9375rem] font-medium transition-colors"
      :class="modelValue === p.id
        ? 'bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
        : 'text-[var(--text-muted)] active:bg-[var(--surface)] active:text-[var(--text)]'"
      style="min-height: 44px"
      @click="$emit('update:modelValue', p.id)"
    >{{ p.label }}</button>
  </div>
</template>
