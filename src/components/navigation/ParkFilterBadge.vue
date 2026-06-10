<script setup>
import { ref } from 'vue'
import { useParkContext } from '../../composables/useParkContext.js'
import ParkPickerSheet from './ParkPickerSheet.vue'

// Активный парк-фильтр (TZ-3.1 §5):
// центрированный чёрный бедж под центрированным заголовком, ≥44pt.
// Фон --text, текст --ink-on-color — это тон, не цвет (вписывается в правило
// «монохром + функциональный цвет»; чёрный = «здесь активен фильтр», функция).
// При isAll показывает «Все парки»; иначе — полное имя текущего парка.
// Тап открывает chooser (тот же bottom-sheet, что использовался раньше).

const { isAll, currentName } = useParkContext()

const open = ref(false)
function show() {
  open.value = true
}
function close() {
  open.value = false
}
</script>

<template>
  <div class="flex justify-center pb-2 pt-1">
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full bg-[var(--text)] px-4 text-[var(--ink-on-color)] active:opacity-90"
      style="min-height: 44px"
      :aria-label="`Парк-фильтр: ${isAll ? 'Все парки' : currentName}`"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="show"
    >
      <span class="text-[0.9375rem] font-medium leading-none">
        {{ isAll ? 'Все парки' : currentName }}
      </span>
    </button>

    <ParkPickerSheet :open="open" @close="close" />
  </div>
</template>
