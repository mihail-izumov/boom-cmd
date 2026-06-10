<script setup>
import { computed } from 'vue'
import PriorityIcon from './PriorityIcon.vue'
import DirectionChip from './DirectionChip.vue'
import { pluralRu, TASKS_PLURAL } from '../../i18n/projects.js'

// Карточка проекта — спокойная, монохромная.
// TZ-3.3 §2: парк-бейджей на карточках больше нет — scope задаёт сам
// активный фильтр (Вся сеть / парк), поэтому имя парка/«Вся сеть» дублировать
// на каждой карточке незачем.
//
// Верх: до 2 направлений (+N).
// Тело: заголовок проекта.
// Низ:  иконка приоритета + счётчик задач серым.
// БЕЗ estimate, БЕЗ срок-бейджа, БЕЗ парк-бейджа.

const props = defineProps({
  project: { type: Object, required: true },
})

defineEmits(['open'])

const visibleDirections = computed(() => (props.project.directions || []).slice(0, 2))
const extraDirections = computed(() =>
  Math.max(0, (props.project.directions?.length || 0) - 2),
)
const itemsCount = computed(() => (props.project.items?.length || 0))
const itemsLabel = computed(() =>
  itemsCount.value ? `${itemsCount.value} ${pluralRu(itemsCount.value, TASKS_PLURAL)}` : null,
)
</script>

<template>
  <button
    type="button"
    class="flex w-full flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 44px"
    @click="$emit('open', project)"
  >
    <div
      v-if="visibleDirections.length || extraDirections > 0"
      class="flex flex-wrap items-center gap-1"
    >
      <DirectionChip v-for="d in visibleDirections" :key="d" :label="d" />
      <span v-if="extraDirections > 0" class="text-[0.75rem] text-[var(--text-muted)]">+{{ extraDirections }}</span>
    </div>

    <h3 class="text-[1rem] font-medium leading-snug text-[var(--text)]">
      {{ project.title }}
    </h3>

    <div class="mt-1 flex items-center gap-2">
      <PriorityIcon :priority="project.priority" :size="14" />
      <span v-if="itemsLabel" class="text-[0.8125rem] text-[var(--text-muted)]">{{ itemsLabel }}</span>
    </div>
  </button>
</template>
