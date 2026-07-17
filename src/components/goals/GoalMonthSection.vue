<script setup>
import { ChevronRight } from 'lucide-vue-next'
import { monthTitle } from '../../i18n/goals.js'
import GoalLinkCard from './GoalLinkCard.vue'

// Сворачиваемая группа-месяц (как ProjectSection по статусам): шапка-кнопка ≥44pt
// (шеврон + «Июль 2026» + счётчик), внутри — карты-ссылки.
defineProps({
  month: { type: String, required: true },
  items: { type: Array, default: () => [] },
  open: { type: Boolean, default: true },
})
defineEmits(['toggle'])
</script>

<template>
  <section v-if="items.length" class="flex flex-col gap-2">
    <button
      type="button"
      class="flex items-center gap-2 rounded-xl px-1 py-1 text-left active:bg-[var(--surface-2)]"
      style="min-height: 44px"
      :aria-expanded="open"
      @click="$emit('toggle', month)"
    >
      <ChevronRight
        class="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150"
        :class="open ? 'rotate-90' : 'rotate-0'"
        :stroke-width="2"
        aria-hidden="true"
      />
      <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ monthTitle(month) }}</h2>
      <span
        class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--line)] px-1.5 text-[0.8125rem] font-medium leading-none text-[var(--text-secondary)]"
      >{{ items.length }}</span>
    </button>

    <div v-show="open" class="flex flex-col gap-2">
      <GoalLinkCard v-for="(it, i) in items" :key="i" :item="it" />
    </div>
  </section>
</template>
