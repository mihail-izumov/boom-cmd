<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'

// Командный баннер на Home (TZ-3.1 §1, ревизия 12.06.2026).
// Большая тач-цель: крупная иконка слева, заголовок, шеврон справа.
//
// variant:
//   'default' — нейтральная карта (surface + бордер); карты-вкладки.
//   'accent'  — жёлтая бренд-заливка (--accent + тёмный ink --accent-ink).
//   'primary' — тёмный нейтрал (--text + белый --ink-on-color).
// size:
//   'lg' (по умолч.) — крупная операционная карта, min-h 112px.
//   'sm'             — компактная карта-вкладка, min-h 76px.
// Все токены существующие, текст монохром, новых hex нет (DESIGN-STANDARD §3.5).
// Тап → переход (логика в родителе).

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], required: true },
  variant: { type: String, default: 'default' },
  size: { type: String, default: 'lg' },
})

defineEmits(['select'])

const cls = computed(() => {
  switch (props.variant) {
    case 'accent':
      return { card: 'border border-transparent bg-[var(--accent)] active:opacity-90', ink: 'text-[var(--accent-ink)]', chev: 'text-[var(--accent-ink)]' }
    case 'primary':
      return { card: 'border border-transparent bg-[var(--text)] active:opacity-90', ink: 'text-[var(--ink-on-color)]', chev: 'text-[var(--ink-on-color)]' }
    default:
      return { card: 'border border-[var(--line)] bg-[var(--surface)] active:bg-[var(--surface-2)]', ink: 'text-[var(--text)]', chev: 'text-[var(--text-muted)]' }
  }
})

const dims = computed(() =>
  props.size === 'sm'
    ? { pad: 'py-3', minH: 76, icon: 'h-8 w-8', title: 'text-[1.1875rem]', chevSize: 'h-6 w-6' }
    : { pad: 'py-4', minH: 112, icon: 'h-9 w-9', title: 'text-[1.375rem]', chevSize: 'h-7 w-7' },
)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-4 rounded-2xl px-4 text-left transition-colors"
    :class="[cls.card, dims.pad]"
    :style="{ minHeight: dims.minH + 'px' }"
    @click="$emit('select')"
  >
    <component :is="icon" class="shrink-0" :class="[dims.icon, cls.ink]" :stroke-width="2" aria-hidden="true" />
    <h2 class="min-w-0 flex-1 font-semibold leading-snug" :class="[dims.title, cls.ink]">
      {{ title }}
    </h2>
    <ChevronRight class="shrink-0" :class="[dims.chevSize, cls.chev]" :stroke-width="2" aria-hidden="true" />
  </button>
</template>
