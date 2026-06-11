<script setup>
import { computed } from 'vue'
import { isFullyComplete } from '../../composables/analyticsAggregate.js'

// Бейдж неполноты — без обводки, лёгкая пилюля. Формат текста короткий:
//   • park view:    «N из M мес»
//   • network view: «N из M мес» / «N из M парков» / «N из M парк-мес»
// Не показываем, если всё полно (isFullyComplete).

const props = defineProps({
  completeness: { type: Object, default: null },
})

const full = computed(() => isFullyComplete(props.completeness))

const label = computed(() => {
  const c = props.completeness
  if (!c) return ''
  if (c.kind === 'park') {
    const have = Math.min(c.have, c.want)
    return `${have} из ${c.want} мес`
  }
  // network
  const parts = []
  if (c.monthsHave < c.monthsWant) {
    parts.push(`${c.monthsHave} из ${c.monthsWant} мес`)
  }
  if (c.parksWithData < c.parksCount) {
    parts.push(`${c.parksWithData} из ${c.parksCount} парков`)
  } else if (c.haveParkMonths < c.wantParkMonths) {
    parts.push(`${c.haveParkMonths} из ${c.wantParkMonths} парк-мес`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <span
    v-if="!full && label"
    class="inline-flex max-w-full items-center rounded-full bg-[var(--surface-2)] px-2 py-1 text-[0.75rem] leading-none text-[var(--text-muted)]"
  >
    <span class="truncate">{{ label }}</span>
  </span>
</template>
