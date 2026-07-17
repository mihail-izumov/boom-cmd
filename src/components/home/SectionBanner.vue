<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'

// Командный баннер на Home (TZ-3.1 §1, ревизия 12.06.2026).
// Большая тач-цель (min-h 112px): крупная иконка слева, заголовок, шеврон справа.
//
// variant (v1.1):
//   'default' — нейтральная карта (surface + бордер); баннеры-вкладки.
//   'accent'  — жёлтая бренд-заливка (--accent + тёмный ink --accent-ink).
//   'primary' — тёмный нейтрал (--text + белый --ink-on-color): главная
//               операционная точка входа «Контроль дня». Отличает её от
//               жёлтой ссылки b00m.fun; все токены существующие, текст монохром,
//               новых hex нет (DESIGN-STANDARD §3.5). Откат на жёлтый = 'accent'.
// Тап → переход (логика в родителе).

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], required: true },
  variant: { type: String, default: 'default' },
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
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors"
    :class="cls.card"
    style="min-height: 112px"
    @click="$emit('select')"
  >
    <component :is="icon" class="h-9 w-9 shrink-0" :class="cls.ink" :stroke-width="2" aria-hidden="true" />
    <h2 class="min-w-0 flex-1 text-[1.375rem] font-semibold leading-snug" :class="cls.ink">
      {{ title }}
    </h2>
    <ChevronRight class="h-7 w-7 shrink-0" :class="cls.chev" :stroke-width="2" aria-hidden="true" />
  </button>
</template>
