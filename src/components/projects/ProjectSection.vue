<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import {
  STATUS_RU,
  t,
  pluralRu,
  PROJECTS_PLURAL,
} from '../../i18n/projects.js'
import ProjectCard from './ProjectCard.vue'

// Сворачиваемая группа-статус (TZ-2-Projects §4).
// Цветной точки статуса нет (DESIGN-STANDARD §3.4): статус несёт заголовок+позиция.
// Шапка — кнопка ≥44pt, тап → свернуть/развернуть.

const props = defineProps({
  status: { type: String, required: true },
  projects: { type: Array, default: () => [] },
  open: { type: Boolean, default: true },
})

defineEmits(['toggle', 'open-project'])

const ru = computed(() => t(STATUS_RU, props.status))
const countLabel = computed(() => {
  const n = props.projects.length
  return `${n} ${pluralRu(n, PROJECTS_PLURAL)}`
})
</script>

<template>
  <section class="flex flex-col gap-2">
    <button
      type="button"
      class="flex items-center gap-2 rounded-xl px-1 py-1 text-left active:bg-[var(--surface-2)]"
      style="min-height: 44px"
      :aria-expanded="open"
      :aria-controls="`section-${status}`"
      @click="$emit('toggle', status)"
    >
      <ChevronRight
        class="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150"
        :class="open ? 'rotate-90' : 'rotate-0'"
        :stroke-width="2"
        aria-hidden="true"
      />
      <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ ru }}</h2>
      <span class="text-[0.875rem] text-[var(--text-muted)]">· {{ countLabel }}</span>
    </button>

    <div v-show="open" :id="`section-${status}`" class="flex flex-col gap-2">
      <template v-if="projects.length">
        <ProjectCard
          v-for="project in projects"
          :key="project.id"
          :project="project"
          @open="$emit('open-project', $event)"
        />
      </template>
      <p
        v-else
        class="rounded-2xl border border-dashed border-[var(--line)] px-3 py-2 text-[0.875rem] text-[var(--text-muted)]"
      >Пока пусто</p>
    </div>
  </section>
</template>
