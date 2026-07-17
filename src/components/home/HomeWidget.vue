<script setup>
import { MoveUpRight, MoveDownRight, MoveRight } from 'lucide-vue-next'

// Виджет-кнопка на Главной. Стрелка тренда — 3 состояния (up/down/flat), серая
// монохромная в круге. Пока грузятся данные — переливы (bc-skeleton). Тап → переход.

defineProps({
  icon: { type: [Object, Function], required: true },
  name: { type: String, required: true },
  metricLabel: { type: String, required: true },
  valueMain: { type: String, default: '' },
  valueUnit: { type: String, default: '' },
  trend: { type: String, default: null }, // 'up' | 'down' | 'flat' | null
  subLabel: { type: String, required: true },
  subValue: { type: String, default: '' },
  loading: { type: Boolean, default: false },
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
      <h2 class="whitespace-pre-line text-[0.9375rem] font-bold leading-tight text-[var(--text)]">{{ name }}</h2>
    </div>

    <p class="text-[0.78rem] font-medium text-[var(--text-muted)]">{{ metricLabel }}</p>

    <div class="mt-1 flex min-h-[30px] items-center gap-2">
      <template v-if="loading">
        <span class="bc-skeleton h-[26px] w-[92px] rounded-lg"></span>
      </template>
      <template v-else>
        <span class="text-[1.875rem] font-extrabold leading-none tracking-tight text-[var(--text)]">{{ valueMain }}</span>
        <span v-if="valueUnit" class="self-end text-[1.0625rem] font-bold leading-none text-[var(--text)]">{{ valueUnit }}</span>
        <span
          v-if="trend"
          class="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-secondary)]"
          aria-hidden="true"
        >
          <component
            :is="trend === 'up' ? MoveUpRight : trend === 'down' ? MoveDownRight : MoveRight"
            class="h-4 w-4"
            :stroke-width="2"
          />
        </span>
      </template>
    </div>

    <div class="mt-auto pt-3 leading-snug">
      <span class="block text-[0.75rem] text-[var(--text-muted)]">{{ subLabel }}</span>
      <span v-if="loading" class="bc-skeleton mt-1 block h-[15px] w-[84px] rounded"></span>
      <span v-else class="block text-[0.8125rem] font-bold text-[var(--text)]">{{ subValue }}</span>
    </div>
  </button>
</template>
