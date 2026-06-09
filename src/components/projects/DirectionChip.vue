<script setup>
// Направление — нейтральный монохромный чип (DESIGN-STANDARD §3.4):
// серый фон --surface-2 + текст --text-secondary. Без цветового кодирования.

defineProps({
  label: { type: String, required: true },
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.75rem] font-medium leading-tight text-[var(--text-secondary)]"
  >{{ label }}</span>
</template>
