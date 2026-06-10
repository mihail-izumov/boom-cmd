<script setup>
// Командный баннер на Home (TZ-3.1 §1).
// Большая тач-цель (min-h 112px), крупный заголовок раздела + крупная
// монохромная иконка слева; ниже — слот под 1–2 ключевые цифры (сейчас
// плейсхолдер «— —» + «данные позже»; реальные цифры — Ф4/5).
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
    <div class="flex min-w-0 flex-1 flex-col">
      <h2 class="text-[1.375rem] font-semibold leading-snug text-[var(--text)]">{{ title }}</h2>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-[1.5rem] font-semibold leading-none text-[var(--text-muted)]" aria-hidden="true">— —</span>
        <span class="text-[0.8125rem] text-[var(--text-muted)]">данные позже</span>
      </div>
    </div>
  </button>
</template>
