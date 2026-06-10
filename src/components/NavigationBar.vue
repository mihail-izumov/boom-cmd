<script setup>
import { ChevronLeft } from 'lucide-vue-next'

// Шапка навигации (TZ-3.1 §4):
// центрированный статичный заголовок, БЕЗ сворачивания large-title.
// Слева — back-кнопка (только при showBack), справа — trailing-распорка
// (слот зарезервирован для будущих действий).
// Под заголовком — scoped slot `belowTitle` (используется AppShell для
// рендера центрированного парк-бедж-фильтра на рабочих страницах).

defineProps({
  title: { type: String, required: true },
  showBack: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
})
defineEmits(['back'])
</script>

<template>
  <header
    class="sticky top-0 z-20 bg-[var(--bg)] pt-[env(safe-area-inset-top)]"
  >
    <div class="flex h-14 w-full items-center px-1">
      <!-- back (≥44pt активная зона) -->
      <button
        v-if="showBack"
        type="button"
        class="flex min-h-[44px] min-w-[44px] items-center gap-0.5 rounded-lg px-1 text-[var(--text)] active:bg-[var(--surface-2)]"
        @click="$emit('back')"
      >
        <ChevronLeft class="h-6 w-6" :stroke-width="2.25" />
        <span v-if="backLabel" class="text-[1.0625rem] leading-none">{{ backLabel }}</span>
      </button>
      <div v-else class="min-h-[44px] min-w-[44px]" aria-hidden="true"></div>

      <!-- центрированный статичный заголовок -->
      <div class="pointer-events-none flex-1 truncate px-1 text-center">
        <span class="text-[1.0625rem] font-semibold text-[var(--text)]">{{ title }}</span>
      </div>

      <!-- trailing — пустая распорка-точка расширения -->
      <div class="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-end pr-1">
        <slot name="trailing" />
      </div>
    </div>

    <!-- под-заголовок: например, парк-бедж-фильтр на Проектах -->
    <slot name="belowTitle" />
  </header>
</template>
