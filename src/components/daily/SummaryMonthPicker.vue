<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown, X } from 'lucide-vue-next'
import { monthLabel } from '../../i18n/summary.js'

// Селектор месяца раздела «Сводки сети» (v2.2).
// Механика — ровно как у парк-фильтра (ParkFilterPill + ParkPickerSheet):
// пилюля с шевроном открывает bottom-sheet со списком, выбранное помечено Check,
// не цветом. Отличия по виду продиктованы самим разделом: обводок нет, пилюля
// держится заливкой --surface-2.
//
// Список месяцев считает экран — сюда приходят только те, по которым есть хоть
// одна запись любого каденса. Значений вне списка не бывает.

const props = defineProps({
  months: { type: Array, required: true }, // ['2026-07', …], новые сверху
  modelValue: { type: String, default: null }, // 'YYYY-MM'
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const dialogRef = ref(null)

function hide() {
  open.value = false
}
function choose(key) {
  emit('update:modelValue', key)
  hide()
}

function focusables() {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'))
}

function onKey(e) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    hide()
    return
  }
  if (e.key === 'Tab') {
    const els = focusables()
    if (els.length === 0) {
      e.preventDefault()
      return
    }
    const first = els[0]
    const last = els[els.length - 1]
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

let prevOverflow = ''
watch(open, async (v) => {
  if (v) {
    prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    await nextTick()
    dialogRef.value?.querySelector('[data-test="summary-month-option"]')?.focus?.()
  } else {
    document.body.style.overflow = prevOverflow
    document.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => {
  if (open.value) {
    document.body.style.overflow = prevOverflow
    document.removeEventListener('keydown', onKey)
  }
})
</script>

<template>
  <button
    type="button"
    data-test="summary-month-pill"
    class="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-4 text-[var(--text)] active:opacity-90"
    style="min-height: 44px"
    :aria-label="`Месяц сводок: ${monthLabel(modelValue)}`"
    aria-haspopup="dialog"
    @click="open = true"
  >
    <span class="text-[0.9375rem] font-medium leading-none">{{ monthLabel(modelValue) }}</span>
    <ChevronDown class="h-4 w-4 shrink-0 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
      role="presentation"
      @click.self="hide"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        aria-label="Выбор месяца"
        data-test="summary-month-sheet"
        class="flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <header class="flex items-center gap-3 px-4 py-3">
          <h2 class="text-[1rem] font-semibold text-[var(--text)]">Выбрать месяц</h2>
          <button
            type="button"
            class="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
            aria-label="Закрыть"
            @click="hide"
          >
            <X class="h-5 w-5" :stroke-width="2" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-2 pb-2">
          <button
            v-for="m in months"
            :key="m"
            type="button"
            data-test="summary-month-option"
            class="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left active:bg-[var(--surface-2)]"
            style="min-height: 44px"
            @click="choose(m)"
          >
            <span class="text-[1rem] text-[var(--text)]">{{ monthLabel(m) }}</span>
            <Check
              v-if="m === modelValue"
              class="ml-auto h-5 w-5 text-[var(--text)]"
              :stroke-width="2.25"
              aria-label="Выбрано"
            />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
