<script setup>
import { ChevronLeft } from 'lucide-vue-next'

defineProps({
  title: { type: String, required: true },
  collapsed: { type: Boolean, default: false },
  // Слот «Назад» зарезервирован: в Фазе 1 глубоких уровней нет.
  showBack: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
})
defineEmits(['back'])
</script>

<template>
  <!-- Компактный бар: липкий вверху скролл-области, стекло появляется на скролле -->
  <header
    class="sticky top-0 z-20 pt-[env(safe-area-inset-top)] backdrop-blur transition-colors duration-200"
    :class="collapsed
      ? 'bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] border-b border-[var(--line)]'
      : 'bg-transparent border-b border-transparent'"
  >
    <div class="flex h-11 w-full items-center px-1">
      <!-- слот «Назад» (≥44pt активная зона) -->
      <button
        v-if="showBack"
        type="button"
        class="flex min-h-[44px] min-w-[44px] items-center gap-0.5 rounded-lg px-1 text-[var(--text)]"
        @click="$emit('back')"
      >
        <ChevronLeft class="h-6 w-6" :stroke-width="2.25" />
        <span v-if="backLabel" class="text-[1.0625rem] leading-none">{{ backLabel }}</span>
      </button>
      <div v-else class="min-h-[44px] min-w-[44px]" aria-hidden="true"></div>

      <!-- компактный заголовок: проявляется, когда large title уходит вверх -->
      <div
        class="pointer-events-none flex-1 truncate px-1 text-center transition-opacity duration-200"
        :class="collapsed ? 'opacity-100' : 'opacity-0'"
      >
        <span class="text-[1.0625rem] font-semibold text-[var(--text)]">{{ title }}</span>
      </div>

      <!-- правый слот: trailing-actions (Ф3: парк-селектор) -->
      <div class="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-end pr-1">
        <slot name="trailing" :collapsed="collapsed" />
      </div>
    </div>
  </header>

  <!-- Крупный заголовок (large title) — в потоке скролла -->
  <div class="px-4 pb-1 pt-1">
    <h1 class="text-[2.125rem] font-bold leading-tight tracking-tight text-[var(--text)]">
      {{ title }}
    </h1>
  </div>
</template>
