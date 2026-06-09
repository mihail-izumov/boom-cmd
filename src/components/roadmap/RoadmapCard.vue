<script setup>
import { computed } from 'vue'
import PriorityIcon from './PriorityIcon.vue'
import EstimateBadge from './EstimateBadge.vue'
import LabelTag from './LabelTag.vue'

// Карточка — кнопка ≥44pt. Внутри: project · target, заголовок,
// до 3 лейблов («+N» если больше), приоритет-иконка, estimate-чип.

const props = defineProps({
  card: { type: Object, required: true },
})

defineEmits(['open'])

const visibleLabels = computed(() => (props.card.labels || []).slice(0, 3))
const extraLabels = computed(() => Math.max(0, (props.card.labels?.length || 0) - 3))
</script>

<template>
  <button
    type="button"
    class="flex w-full flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 44px"
    @click="$emit('open', card)"
  >
    <div class="flex items-center gap-2 text-[0.8125rem] text-[var(--text-muted)]">
      <span class="truncate">{{ card.project }}</span>
      <span
        v-if="card.target"
        class="ml-auto shrink-0 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--text-secondary)]"
      >{{ card.target }}</span>
    </div>

    <h3 class="text-[1rem] font-medium leading-snug text-[var(--text)]">{{ card.title }}</h3>

    <div v-if="visibleLabels.length || extraLabels > 0" class="flex flex-wrap items-center gap-1">
      <LabelTag v-for="l in visibleLabels" :key="l" :label="l" />
      <span v-if="extraLabels > 0" class="text-[0.75rem] text-[var(--text-muted)]">+{{ extraLabels }}</span>
    </div>

    <div class="mt-1 flex items-center gap-2">
      <PriorityIcon :priority="card.priority" :size="14" />
      <EstimateBadge :estimate="card.estimate" />
    </div>
  </button>
</template>
