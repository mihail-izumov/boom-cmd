<script setup>
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { PARKS_BY_ID } from '../../data/parks.js'
import { useParkContext } from '../../composables/useParkContext.js'

// Парк-фильтр — лёгкая монохромная пилюля с шевроном (TZ-3.2 §3).
// Не цвет: рамка --line, фон --surface-2, текст --text, шеврон --text-muted.
// ≥44pt. Кликом эмитит `open` — chooser держит NavigationBar (один на оба
// экземпляра пилюли: большой в потоке и компактный в стики-панели).
//
// Подписи (TZ-3.3 §3):
//   isNetwork === true  → «Вся сеть»
//   id парка            → имя парка (short || name в компактном виде)
//
// `compact`:
//   false — полное имя / «Вся сеть» + рамка/фон.
//   true  — короткое имя (short || name) + шеврон, без рамки/фона,
//           max-w-[10rem] + truncate (узкая, чтобы не давить компактный
//           центрированный заголовок).

const props = defineProps({
  compact: { type: Boolean, default: false },
})

defineEmits(['open'])

const { current, isNetwork } = useParkContext()

const fullLabel = computed(() =>
  isNetwork.value ? 'Вся сеть' : PARKS_BY_ID[current.value]?.name || 'Вся сеть',
)
const shortLabel = computed(() => {
  if (isNetwork.value) return 'Вся сеть'
  const p = PARKS_BY_ID[current.value]
  return p?.short || p?.name || 'Вся сеть'
})
const label = computed(() => (props.compact ? shortLabel.value : fullLabel.value))
const ariaLabel = computed(() => `Парк-фильтр: ${fullLabel.value}`)
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="inline-flex items-center gap-1 rounded-full px-2 text-[var(--text)] active:bg-[var(--surface-2)]"
    style="min-height: 44px; max-width: 10rem"
    :aria-label="ariaLabel"
    aria-haspopup="dialog"
    @click="$emit('open')"
  >
    <span class="truncate text-[0.9375rem] font-medium leading-none">{{ label }}</span>
    <ChevronDown
      class="h-4 w-4 shrink-0 text-[var(--text-muted)]"
      :stroke-width="2"
      aria-hidden="true"
    />
  </button>
  <button
    v-else
    type="button"
    class="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-4 text-[var(--text)] active:opacity-90"
    style="min-height: 44px"
    :aria-label="ariaLabel"
    aria-haspopup="dialog"
    @click="$emit('open')"
  >
    <span class="text-[0.9375rem] font-medium leading-none">{{ label }}</span>
    <ChevronDown
      class="h-4 w-4 shrink-0 text-[var(--text-muted)]"
      :stroke-width="2"
      aria-hidden="true"
    />
  </button>
</template>
