<script setup>
import { computed } from 'vue'
import {
  STATUS_RU,
  STATUS_TOKEN,
  t,
  pluralRu,
  TASKS_PLURAL,
} from '../../i18n/roadmap.js'
import RoadmapCard from './RoadmapCard.vue'

// Секция-статус: точка цвета --st-* + RU-подпись + счётчик «N задач(а/и)».

const props = defineProps({
  status: { type: String, required: true },
  cards: { type: Array, default: () => [] },
})

defineEmits(['open'])

const ru = computed(() => t(STATUS_RU, props.status))
const dotColor = computed(() => STATUS_TOKEN[props.status] || 'var(--text-muted)')
const countLabel = computed(() => {
  const n = props.cards.length
  return `${n} ${pluralRu(n, TASKS_PLURAL)}`
})
</script>

<template>
  <section class="flex flex-col gap-2">
    <header class="flex items-center gap-2 px-1">
      <span
        class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        :style="{ backgroundColor: dotColor }"
        aria-hidden="true"
      />
      <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ ru }}</h2>
      <span class="text-[0.875rem] text-[var(--text-muted)]">· {{ countLabel }}</span>
    </header>

    <div v-if="cards.length" class="flex flex-col gap-2">
      <RoadmapCard
        v-for="card in cards"
        :key="card.id"
        :card="card"
        @open="$emit('open', $event)"
      />
    </div>
    <p
      v-else
      class="rounded-2xl border border-dashed border-[var(--line)] px-3 py-2 text-[0.875rem] text-[var(--text-muted)]"
    >Пока пусто</p>
  </section>
</template>
