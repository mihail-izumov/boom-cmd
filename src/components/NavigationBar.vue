<script setup>
import { ref } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import ParkFilterPill from './navigation/ParkFilterPill.vue'
import ParkPickerSheet from './navigation/ParkPickerSheet.vue'

// Шапка навигации (TZ-3.2: возврат large-title-collapse механики Ф1,
// заголовок — центрированный и крупный, и компактный).
//
// Структура:
//   - sticky compact-bar сверху: back / центрированный компактный заголовок
//     (виден по opacity при collapsed) / компактная пилюля справа
//     (видна по opacity при collapsed && parkFilter);
//   - в потоке скролла: крупный центрированный заголовок;
//   - в потоке скролла: большая пилюля по центру под заголовком
//     (только при parkFilter), уезжает за sticky-бар при скролле.
//
// Один chooser (ParkPickerSheet) на оба экземпляра пилюли — открывается
// эмитом `open` из ParkFilterPill, состояние держит шапка.
// Liquid Glass-эффект — `backdrop-blur` (через Tailwind, чтобы autoprefixer
// добавил -webkit-) + color-mix фон на collapsed.

defineProps({
  title: { type: String, required: true },
  collapsed: { type: Boolean, default: false },
  parkFilter: { type: Boolean, default: false },
  showBack: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
})
defineEmits(['back'])

const pickerOpen = ref(false)
function openPicker() {
  pickerOpen.value = true
}
function closePicker() {
  pickerOpen.value = false
}
</script>

<template>
  <!-- Sticky compact-bar: липкий вверху, стекло появляется на скролле -->
  <header
    class="sticky top-0 z-20 pt-[env(safe-area-inset-top)] backdrop-blur transition-colors duration-200"
    :class="collapsed
      ? 'bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] border-b border-[var(--line)]'
      : 'bg-transparent border-b border-transparent'"
  >
    <div class="flex h-11 w-full items-center px-1">
      <!-- back-кнопка слева -->
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

      <!-- компактный центрированный заголовок: проявляется при collapsed -->
      <div
        class="pointer-events-none flex-1 truncate px-1 text-center transition-opacity duration-200"
        :class="collapsed ? 'opacity-100' : 'opacity-0'"
      >
        <span class="text-[1.0625rem] font-semibold text-[var(--text)]">{{ title }}</span>
      </div>

      <!-- компактная пилюля справа: проявляется при collapsed && parkFilter -->
      <div
        class="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-end pr-1 transition-opacity duration-200"
        :class="collapsed && parkFilter ? 'opacity-100' : 'pointer-events-none opacity-0'"
      >
        <ParkFilterPill v-if="parkFilter" :compact="true" @open="openPicker" />
      </div>
    </div>
  </header>

  <!-- Крупный центрированный заголовок — в потоке скролла -->
  <div class="px-4 pb-3 pt-2 text-center">
    <h1 class="text-[2.125rem] font-bold leading-tight tracking-tight text-[var(--text)]">
      {{ title }}
    </h1>
  </div>

  <!-- Большая пилюля под крупным заголовком — в потоке скролла -->
  <div v-if="parkFilter" class="flex justify-center pb-3">
    <ParkFilterPill :compact="false" @open="openPicker" />
  </div>

  <ParkPickerSheet :open="pickerOpen" @close="closePicker" />
</template>
