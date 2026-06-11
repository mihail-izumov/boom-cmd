<script setup>
import { ref } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import ParkFilterPill from './navigation/ParkFilterPill.vue'
import ParkPickerSheet from './navigation/ParkPickerSheet.vue'
import SyncIcon from './icons/SyncIcon.vue'
import { useNavCaption } from '../composables/useNavCaption.js'

// Шапка навигации (TZ-3.2 + правка по запросу владельца):
//   - sticky compact-bar сверху: back / leading-action слева, центрированный
//     компактный заголовок по полной ширине бара (absolute-позиционирование),
//     компактная пилюля парк-фильтра справа.
//   - в потоке скролла: крупный центрированный заголовок;
//   - в потоке скролла: большая пилюля по центру под заголовком (если parkFilter).
//
// Компактный заголовок ВЫНЕСЕН в absolute-слой по `inset-x-0`, поэтому его
// центр совпадает с центром бара независимо от ширины back/leading и пилюли.
// Симметричный `px-[10rem]` защищает от наезда на левую/правую кнопки; при
// overflow заголовок `truncate`. (`fix(header)`.)
//
// `leadingAction` — конфигурируемая кнопка слева вместо back-кнопки, когда
// `showBack=false`. Сейчас единственный вариант — 'hardReload' на Главной.

defineProps({
  title: { type: String, required: true },
  collapsed: { type: Boolean, default: false },
  parkFilter: { type: Boolean, default: false },
  showBack: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
  leadingAction: { type: String, default: null }, // null | 'hardReload'
})
defineEmits(['back'])

const { caption } = useNavCaption()

const pickerOpen = ref(false)
function openPicker() {
  pickerOpen.value = true
}
function closePicker() {
  pickerOpen.value = false
}

// Жёсткая перезагрузка: чистим кэши SW, разрегистрируем service worker и
// перезагружаем страницу. После reload main.js снова зарегистрирует sw.js.
// Полезно во время разработки, чтобы видеть каждую правку без ручного
// «очистить кэш».
async function hardReload() {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch (e) {
    // Не блокируем reload, даже если очистка частично не удалась.
    console.warn('hard reload cleanup failed', e)
  } finally {
    if (typeof window !== 'undefined') window.location.reload()
  }
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
    <div class="relative h-11 w-full">
      <!-- Левый угол: back или leadingAction (взаимоисключающие) -->
      <div class="absolute left-1 top-0 flex h-11 items-center">
        <button
          v-if="showBack"
          type="button"
          class="flex min-h-[44px] min-w-[44px] items-center gap-0.5 rounded-lg px-1 text-[var(--text)] active:bg-[var(--surface-2)]"
          @click="$emit('back')"
        >
          <ChevronLeft class="h-6 w-6" :stroke-width="2.25" />
          <span v-if="backLabel" class="text-[1.0625rem] leading-none">{{ backLabel }}</span>
        </button>
        <button
          v-else-if="leadingAction === 'hardReload'"
          type="button"
          class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text)] active:bg-[var(--surface-2)]"
          aria-label="Жёсткая перезагрузка (сбросить кэш)"
          title="Жёсткая перезагрузка"
          @click="hardReload"
        >
          <SyncIcon class="h-5 w-5" />
        </button>
        <div v-else class="min-h-[44px] min-w-[44px]" aria-hidden="true"></div>
      </div>

      <!-- Правый угол: компактная пилюля парк-фильтра (виден при collapsed && parkFilter) -->
      <div
        class="absolute right-1 top-0 flex h-11 items-center transition-opacity duration-200"
        :class="collapsed && parkFilter ? 'opacity-100' : 'pointer-events-none opacity-0'"
      >
        <ParkFilterPill v-if="parkFilter" :compact="true" @open="openPicker" />
      </div>

      <!-- Компактный заголовок: absolute по центру всего бара,
           симметричный px-[10rem] защищает от наезда на back/leading и пилюлю. -->
      <div
        class="pointer-events-none absolute inset-0 flex h-11 items-center justify-center px-[10rem] transition-opacity duration-200"
        :class="collapsed ? 'opacity-100' : 'opacity-0'"
      >
        <span class="truncate text-[1.0625rem] font-semibold text-[var(--text)]">{{ title }}</span>
      </div>
    </div>
  </header>

  <!-- Крупный центрированный заголовок — в потоке скролла -->
  <div class="px-4 pb-3 pt-2 text-center">
    <p
      v-if="caption"
      class="mb-1 text-[0.75rem] leading-none text-[var(--text-muted)]"
    >{{ caption }}</p>
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
