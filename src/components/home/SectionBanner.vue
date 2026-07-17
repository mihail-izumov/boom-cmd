<script setup>
import { ChevronRight } from 'lucide-vue-next'

// Командный баннер на Home (TZ-3.1 §1, ревизия 12.06.2026).
// Большая тач-цель (min-h 112px): крупная иконка слева, заголовок, шеврон справа.
// `accent` (v1.1) — жёлтая акцент-карта (бренд-заливка --accent + монохромный тёмный
// ink --accent-ink по DESIGN-STANDARD §3.5), без бордера. Используется для оперативной
// точки входа «Контроль дня». Нейтральные баннеры-вкладки — по умолчанию (surface).
// Тап → переход (логика в родителе).

defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], required: true },
  accent: { type: Boolean, default: false },
})

defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition-colors"
    :class="accent
      ? 'border border-transparent bg-[var(--accent)] active:opacity-90'
      : 'border border-[var(--line)] bg-[var(--surface)] active:bg-[var(--surface-2)]'"
    style="min-height: 112px"
    @click="$emit('select')"
  >
    <component
      :is="icon"
      class="h-9 w-9 shrink-0"
      :class="accent ? 'text-[var(--accent-ink)]' : 'text-[var(--text)]'"
      :stroke-width="2"
      aria-hidden="true"
    />
    <h2
      class="min-w-0 flex-1 text-[1.375rem] font-semibold leading-snug"
      :class="accent ? 'text-[var(--accent-ink)]' : 'text-[var(--text)]'"
    >
      {{ title }}
    </h2>
    <ChevronRight
      class="h-7 w-7 shrink-0"
      :class="accent ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'"
      :stroke-width="2"
      aria-hidden="true"
    />
  </button>
</template>
