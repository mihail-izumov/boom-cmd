<script setup>
import { computed } from 'vue'
import { PRIORITY_RU, t } from '../../i18n/projects.js'

// Иконка приоритета — DESIGN-STANDARD §3.4:
//   0 No priority — серые точки
//   1 Urgent      — залитый красный квадрат с восклицанием (единственный цветной)
//   2 High        — 3 столбика, --text
//   3 Medium      — 2 столбика, --text-muted
//   4 Low         — 1 столбик, --text-muted

const props = defineProps({
  priority: { type: Number, default: 0 },
  size: { type: Number, default: 14 },
})

const label = computed(() => t(PRIORITY_RU, props.priority))
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center"
    :style="{ width: size + 'px', height: size + 'px' }"
    :aria-label="label"
    :title="label"
  >
    <svg
      v-if="priority === 0"
      :width="size"
      :height="size"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="3" cy="8" r="1.1" fill="var(--text-muted)" />
      <circle cx="8" cy="8" r="1.1" fill="var(--text-muted)" />
      <circle cx="13" cy="8" r="1.1" fill="var(--text-muted)" />
    </svg>

    <svg
      v-else-if="priority === 1"
      :width="size"
      :height="size"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="14" height="14" rx="3" fill="var(--negative)" />
      <rect x="7" y="3.5" width="2" height="6" rx="1" fill="var(--ink-on-color)" />
      <rect x="7" y="11" width="2" height="2" rx="1" fill="var(--ink-on-color)" />
    </svg>

    <svg
      v-else-if="priority === 2"
      :width="size"
      :height="size"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="10" width="3" height="4" rx="0.6" fill="var(--text)" />
      <rect x="6.5" y="7" width="3" height="7" rx="0.6" fill="var(--text)" />
      <rect x="11" y="3" width="3" height="11" rx="0.6" fill="var(--text)" />
    </svg>

    <svg
      v-else-if="priority === 3"
      :width="size"
      :height="size"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="10" width="3" height="4" rx="0.6" fill="var(--text-muted)" />
      <rect x="6.5" y="7" width="3" height="7" rx="0.6" fill="var(--text-muted)" />
      <rect x="11" y="3" width="3" height="11" rx="0.6" fill="var(--line)" />
    </svg>

    <svg
      v-else-if="priority === 4"
      :width="size"
      :height="size"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect x="2" y="10" width="3" height="4" rx="0.6" fill="var(--text-muted)" />
      <rect x="6.5" y="7" width="3" height="7" rx="0.6" fill="var(--line)" />
      <rect x="11" y="3" width="3" height="11" rx="0.6" fill="var(--line)" />
    </svg>

    <svg
      v-else
      :width="size"
      :height="size"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" fill="var(--text-muted)" />
    </svg>
  </span>
</template>
