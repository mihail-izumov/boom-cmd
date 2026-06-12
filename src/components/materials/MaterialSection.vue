<script setup>
import { computed } from 'vue'
import { pluralRu } from '../../i18n/projects.js'
import { MATERIALS_PLURAL, typeGroupLabel } from '../../i18n/materials.js'
import MaterialCard from './MaterialCard.vue'

// Группа-тип витрины материалов. Без сворачивания (упрощение vs Проекты —
// TZ-5.2 §2.3): материалов в группе мало, прятать незачем, поэтому шапка —
// не кнопка, а простой заголовок. Пустые группы не рендерим (страховка —
// root v-if, как в ProjectSection).

const props = defineProps({
  type: { type: String, required: true },
  materials: { type: Array, default: () => [] },
})

defineEmits(['open-material'])

const label = computed(() => typeGroupLabel(props.type))
const countLabel = computed(() => {
  const n = props.materials.length
  return `${n} ${pluralRu(n, MATERIALS_PLURAL)}`
})
</script>

<template>
  <section v-if="materials.length" class="flex flex-col gap-2">
    <div class="flex items-center gap-2 px-1">
      <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ label }}</h2>
      <span class="text-[0.875rem] text-[var(--text-muted)]">· {{ countLabel }}</span>
    </div>

    <div class="flex flex-col gap-2">
      <MaterialCard
        v-for="m in materials"
        :key="m.id"
        :material="m"
        @open="$emit('open-material', $event)"
      />
    </div>
  </section>
</template>
