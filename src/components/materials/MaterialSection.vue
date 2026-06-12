<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { pluralRu } from '../../i18n/projects.js'
import { MATERIALS_PLURAL, typeGroupLabel } from '../../i18n/materials.js'
import MaterialCard from './MaterialCard.vue'

// Группа-тип витрины материалов. Сворачиваемая (решение владельца после
// первого прогона UI, отменяет упрощение TZ-5.2 §2.3): шапка — кнопка ≥44pt
// с шевроном (механика = ProjectSection), счётчик — бейдж-пилюля справа.
// По дефолту все группы свёрнуты (state держит MaterialsScreen).
// Пустые группы не рендерим (root v-if — страховка, как в ProjectSection).

const props = defineProps({
  type: { type: String, required: true },
  materials: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})

defineEmits(['toggle', 'open-material'])

const label = computed(() => typeGroupLabel(props.type))
const countLabel = computed(() => {
  const n = props.materials.length
  return `${n} ${pluralRu(n, MATERIALS_PLURAL)}`
})
</script>

<template>
  <section v-if="materials.length" class="flex flex-col gap-2">
    <button
      type="button"
      class="flex items-center gap-2 rounded-xl px-1 py-1 text-left active:bg-[var(--surface-2)]"
      style="min-height: 44px"
      :aria-expanded="open"
      :aria-controls="`materials-${type}`"
      @click="$emit('toggle', type)"
    >
      <ChevronRight
        class="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150"
        :class="open ? 'rotate-90' : 'rotate-0'"
        :stroke-width="2"
        aria-hidden="true"
      />
      <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ label }}</h2>
      <span
        class="ml-auto inline-flex items-center rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[0.8125rem] font-medium leading-tight text-[var(--text-secondary)]"
      >{{ countLabel }}</span>
    </button>

    <div v-show="open" :id="`materials-${type}`" class="flex flex-col gap-2">
      <MaterialCard
        v-for="m in materials"
        :key="m.id"
        :material="m"
        @open="$emit('open-material', $event)"
      />
    </div>
  </section>
</template>
