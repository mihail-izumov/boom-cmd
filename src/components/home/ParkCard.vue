<script setup>
import { computed } from 'vue'

// Карточка парка на Home (TZ-3 §5).
// park === null  → агрегат «Вся сеть» (без города).
// active === true → подсветка текущего контекста: рамка --text + фон --surface-2
//                   (НЕ цветом, по решению владельца).
// Слот под статистику сейчас — пустой стейт «Сводка появится позже».

const props = defineProps({
  park: { type: Object, default: null },
  active: { type: Boolean, default: false },
})

defineEmits(['select'])

const id = computed(() => props.park?.id ?? 'all')
const name = computed(() => props.park?.name ?? 'Вся сеть')
const city = computed(() => props.park?.city ?? null)
</script>

<template>
  <button
    type="button"
    class="flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors active:bg-[var(--surface-2)]"
    :class="active
      ? 'border-[var(--text)] bg-[var(--surface-2)]'
      : 'border-[var(--line)] bg-[var(--surface)]'"
    style="min-height: 44px"
    :aria-current="active ? 'true' : 'false'"
    @click="$emit('select', id)"
  >
    <div class="flex items-baseline gap-2">
      <h2 class="text-[1.125rem] font-semibold leading-snug text-[var(--text)]">{{ name }}</h2>
      <span v-if="city" class="text-[0.875rem] text-[var(--text-muted)]">{{ city }}</span>
    </div>
    <p class="text-[0.8125rem] text-[var(--text-muted)]">Сводка появится позже</p>
  </button>
</template>
