<script setup>
import { computed } from 'vue'
import { monthLabel, PARK_RU, t } from '../../i18n/analytics.js'

// Подпись «состояние на разные даты» для сетевых «последний месяц»-метрик
// (ответ владельца №2б): если у парков последние строки приходятся на
// разные месяцы — рядом со значением должна быть подсказка, на какие.

const props = defineProps({
  // массив { park, month, value } — выход lastInPeriod().byPark
  byPark: { type: Array, default: () => [] },
})

const groups = computed(() => {
  // {month → [parks]}
  const map = new Map()
  for (const item of props.byPark) {
    if (!map.has(item.month)) map.set(item.month, [])
    map.get(item.month).push(item.park)
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1)) // свежий месяц — первым
    .map(([month, parks]) => ({
      month,
      label: monthLabel(month),
      parks: parks.map((id) => t(PARK_RU, id)),
    }))
})

const multiple = computed(() => groups.value.length > 1)
</script>

<template>
  <p
    v-if="multiple"
    class="text-[0.75rem] leading-snug text-[var(--text-muted)]"
  >
    Состояние на:
    <template v-for="(g, i) in groups" :key="g.month">
      <span class="text-[var(--text-secondary)]">{{ g.label }}</span>
      ({{ g.parks.join(', ') }}){{ i < groups.length - 1 ? '; ' : '' }}
    </template>
  </p>
</template>
