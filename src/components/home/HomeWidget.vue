<script setup>
import { ChevronUp, ChevronDown } from 'lucide-vue-next'

// Виджет-кнопка на Главной (два столбца). Белая карта: шапка (жёлтая плашка-иконка +
// имя), лейбл метрики, крупное значение (+ опц. серая стрелка тренда), внизу — тихий
// подлейбл + жирное значение. Стрелок-шевронов входа нет. Тап → переход (в родителе).
// Токены существующие, текст монохром, стрелка тренда — серая в любом состоянии.

defineProps({
  icon: { type: [Object, Function], required: true },
  name: { type: String, required: true },
  metricLabel: { type: String, required: true },
  valueMain: { type: String, required: true },
  valueUnit: { type: String, default: '' },
  trend: { type: String, default: null }, // 'up' | 'down' | null
  subLabel: { type: String, required: true },
  subValue: { type: String, required: true },
})
defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="flex min-h-[172px] flex-col rounded-[22px] bg-[var(--surface)] p-[15px] text-left shadow-sm transition-colors active:bg-[var(--surface-2)]"
    @click="$emit('select')"
  >
    <div class="mb-3.5 flex items-center gap-2.5">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]">
        <component :is="icon" class="h-[22px] w-[22px]" :stroke-width="2.1" aria-hidden="true" />
      </span>
      <h2 class="text-[0.9375rem] font-bold leading-tight text-[var(--text)]">{{ name }}</h2>
    </div>

    <p class="text-[0.78rem] font-medium text-[var(--text-muted)]">{{ metricLabel }}</p>
    <div class="mt-1 flex items-center gap-2">
      <span class="text-[1.875rem] font-extrabold leading-none tracking-tight text-[var(--text)]">{{ valueMain }}</span>
      <span v-if="valueUnit" class="self-end pb-0.5 text-[1.0625rem] font-bold text-[var(--text)]">{{ valueUnit }}</span>
      <span
        v-if="trend"
        class="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-secondary)]"
        aria-hidden="true"
      >
        <component :is="trend === 'down' ? ChevronDown : ChevronUp" class="h-4 w-4" :stroke-width="2.6" />
      </span>
    </div>

    <div class="mt-auto pt-3 leading-snug">
      <span class="block text-[0.75rem] text-[var(--text-muted)]">{{ subLabel }}</span>
      <span class="block text-[0.8125rem] font-bold text-[var(--text)]">{{ subValue }}</span>
    </div>
  </button>
</template>
