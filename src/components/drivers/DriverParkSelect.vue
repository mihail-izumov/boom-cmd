<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

// Локальный выпадающий список выбора парка для раздела «Драйверы»: центрированная
// пилюля (как «Вся сеть» в «Задачах») + меню на тап. ЛОКАЛЬНЫЙ, а не глобальный
// useParkContext: у раздела свои три СПб-парка без MARI (§0.1 п.2/п.4).
// Одиночный выбор; закрытие по выбору и по клику вне.

const props = defineProps({
  modelValue: { type: String, required: true },
  // [{ val, label, count }]
  options: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootRef = ref(null)
const current = computed(() => props.options.find((o) => o.val === props.modelValue) || props.options[0])

function pick(v) {
  emit('update:modelValue', v)
  open.value = false
}
function onDocClick(e) {
  if (rootRef.value && !rootRef.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <!-- При открытии поднимаем ВЕСЬ селект в отдельный слой (z-30): position:relative
       без z-index не создаёт stacking context, и меню провалилось бы под слайдер
       статусов и карточки, идущие ниже в DOM. -->
  <div ref="rootRef" class="relative flex justify-center" :class="open ? 'z-30' : ''">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-4 text-[0.9375rem] font-medium text-[var(--text)] active:opacity-90"
      style="min-height: 44px"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span>{{ current && current.label }}</span>
      <span v-if="current && current.count != null" class="text-[0.75rem] text-[var(--text-muted)]">{{ current.count }}</span>
      <ChevronDown class="h-4 w-4 text-[var(--text-muted)] transition-transform duration-150" :class="open ? 'rotate-180' : ''" :stroke-width="2" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      role="listbox"
      class="absolute left-1/2 top-[calc(100%+6px)] z-30 w-64 max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--card-shadow)]"
    >
      <button
        v-for="o in options"
        :key="o.val"
        type="button"
        role="option"
        :aria-selected="o.val === modelValue"
        class="flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-4 text-left text-[0.9375rem] last:border-b-0 active:bg-[var(--surface-2)]"
        :class="o.val === modelValue ? 'bg-[var(--surface-2)] font-semibold text-[var(--text)]' : 'text-[var(--text-secondary)]'"
        style="min-height: 44px"
        @click="pick(o.val)"
      >
        <span>{{ o.label }}</span>
        <span class="text-[0.8125rem] text-[var(--text-muted)]">{{ o.count }}</span>
      </button>
    </div>
  </div>
</template>
