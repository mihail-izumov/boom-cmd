<script setup>
import { ChevronRight } from 'lucide-vue-next'

// Командный баннер на Home (TZ-3.1 §1, ревизия 12.06.2026).
// Большая тач-цель (min-h 112px): крупная монохромная иконка слева,
// заголовок по центру вертикали, крупный серый шеврон справа — явный
// аффорданс «можно зайти внутрь». Плейсхолдер цифр («— —» / «данные позже»)
// убран по решению владельца; слот под ключевые цифры вернётся с данными (Ф6).
// Тап → переход на соответствующую вкладку (логика — в родителе).

defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], required: true },
})

defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 112px"
    @click="$emit('select')"
  >
    <component
      :is="icon"
      class="h-9 w-9 shrink-0 text-[var(--text)]"
      :stroke-width="2"
      aria-hidden="true"
    />
    <h2 class="min-w-0 flex-1 text-[1.375rem] font-semibold leading-snug text-[var(--text)]">
      {{ title }}
    </h2>
    <ChevronRight
      class="h-7 w-7 shrink-0 text-[var(--text-muted)]"
      :stroke-width="2"
      aria-hidden="true"
    />
  </button>
</template>
