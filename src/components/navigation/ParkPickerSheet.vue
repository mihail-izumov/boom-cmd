<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { CITY_ORDER, PARKS_BY_CITY } from '../../data/parks.js'
import { useParkContext } from '../../composables/useParkContext.js'

// Bottom-sheet chooser выбора парка.
// Controlled: открытием/закрытием управляет родитель через prop `open` и emit `close`.
// fixed inset-0 + focus-trap + body-scroll-lock + Esc/фон/кнопка.
// Группы «Москва» / «Санкт-Петербург»; «Вся сеть» сверху (TZ-3.3 §3).
// Выбор помечен Check (--text), не цветом.

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const { current, isNetwork, setPark } = useParkContext()

const dialogRef = ref(null)
const firstItemRef = ref(null)

function hide() {
  emit('close')
}
function choose(id) {
  setPark(id)
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
  if (!props.open) return
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
watch(
  () => props.open,
  async (v) => {
    if (v) {
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKey)
      await nextTick()
      firstItemRef.value?.focus?.()
    } else {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  },
)

onBeforeUnmount(() => {
  if (props.open) {
    document.body.style.overflow = prevOverflow
    document.removeEventListener('keydown', onKey)
  }
})
</script>

<template>
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
        aria-label="Выбор парка"
        class="flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 class="text-[1rem] font-semibold text-[var(--text)]">Выбрать парк</h2>
          <button
            type="button"
            class="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
            aria-label="Закрыть"
            @click="hide"
          >
            <X class="h-5 w-5" :stroke-width="2" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-2 py-2">
          <button
            ref="firstItemRef"
            type="button"
            class="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left active:bg-[var(--surface-2)]"
            style="min-height: 44px"
            @click="choose('network')"
          >
            <span class="text-[1rem] text-[var(--text)]">Вся сеть</span>
            <Check
              v-if="isNetwork"
              class="ml-auto h-5 w-5 text-[var(--text)]"
              :stroke-width="2.25"
              aria-label="Выбрано"
            />
          </button>

          <template v-for="city in CITY_ORDER" :key="city">
            <div
              v-if="(PARKS_BY_CITY[city] || []).length"
              class="mt-2 px-3 pb-1 pt-2 text-[0.75rem] font-medium uppercase tracking-wide text-[var(--text-muted)]"
            >{{ city }}</div>
            <button
              v-for="p in PARKS_BY_CITY[city] || []"
              :key="p.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left active:bg-[var(--surface-2)]"
              style="min-height: 44px"
              @click="choose(p.id)"
            >
              <span class="text-[1rem] text-[var(--text)]">{{ p.name }}</span>
              <Check
                v-if="current === p.id"
                class="ml-auto h-5 w-5 text-[var(--text)]"
                :stroke-width="2.25"
                aria-label="Выбрано"
              />
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
