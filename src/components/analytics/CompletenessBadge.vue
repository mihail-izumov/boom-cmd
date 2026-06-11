<script setup>
import { computed } from 'vue'
import { isFullyComplete } from '../../composables/analyticsAggregate.js'

// Бейдж «данные за N из M мес» / «N из M парк-месяцев» (§4.2 контракта).
// Не показываем, если всё в норме (isFullyComplete).
// Стиль — нейтральный, монохром: рамка --line, фон --surface-2, текст --text-muted.

const props = defineProps({
  completeness: { type: Object, default: null },
  // Префикс — например «Период:» или короткое «N из M» без префикса.
  prefix: { type: String, default: '' },
})

const full = computed(() => isFullyComplete(props.completeness))

const label = computed(() => {
  const c = props.completeness
  if (!c) return ''
  if (c.kind === 'park') {
    // Показываем по календарю периода: «N из target мес».
    const have = Math.min(c.have, c.want)
    return `${props.prefix}данные за ${have} из ${c.want} мес`
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
  if (!parts.length) return ''
  return `${props.prefix}данные за ${parts.join(' · ')}`
})
</script>

<template>
  <span
    v-if="!full && label"
    class="inline-flex max-w-full items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-[0.75rem] leading-none text-[var(--text-muted)]"
  >
    <span class="truncate">{{ label }}</span>
  </span>
</template>
