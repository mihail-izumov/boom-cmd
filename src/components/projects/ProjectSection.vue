<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { STATUS_RU, t } from '../../i18n/projects.js'
import ProjectCard from './ProjectCard.vue'

// Сворачиваемая группа-статус. Цветной точки статуса нет: статус несёт
// заголовок + позиция группы (DESIGN-STANDARD §3.4). Шапка — кнопка ≥44pt.
// Счётчик — круглый бейдж с цифрой после заголовка (ревизия 12.06.2026,
// единый стиль с MaterialSection; фон --line, чтобы не сливался с --bg).
//
// TZ-3.4: пустые группы вообще не рендерим. ProjectsScreen передаёт сюда
// только непустые projects (visibleStatuses), но root-level v-if держим
// как страховку от регрессии — если кто-то в будущем забудет отфильтровать,
// пустая секция всё равно не появится.

const props = defineProps({
  status: { type: String, required: true },
  projects: { type: Array, default: () => [] },
  open: { type: Boolean, default: true },
})

defineEmits(['toggle', 'open-project'])

const ru = computed(() => t(STATUS_RU, props.status))
</script>

<template>
  <section v-if="projects.length" class="flex flex-col gap-2">
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
      <span
        class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--line)] px-1.5 text-[0.8125rem] font-medium leading-none text-[var(--text-secondary)]"
      >{{ projects.length }}</span>
    </button>

    <div v-show="open" :id="`section-${status}`" class="flex flex-col gap-2">
      <ProjectCard
        v-for="project in projects"
        :key="project.id"
        :project="project"
        @open="$emit('open-project', $event)"
      />
    </div>
  </section>
</template>
