<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown, Plus } from 'lucide-vue-next'
import { BUSINESSES } from '../../data/businesses.js'
import ConnectBusinessModal from './ConnectBusinessModal.vue'

// Чип бизнеса в шапке Главной (D-20). Раньше — статичный бейдж «БУМБАСТИК»
// (eyebrow над крупным заголовком), теперь — кнопка-переключатель бизнесов.
// Внешний вид бейджа не менялся: та же графитовая капсула, тот же капс; добавлен
// только шеврон — иначе кнопка не читается как кнопка (асимметричные pl-4/pr-3
// под него и были заложены изначально).
//
// Выпадашка: список бизнесов (сейчас один, активный помечен галкой, НЕ цветом) →
// разделитель → «Подключить бизнес · с экспертом» → модалка заявки.
//
// TODO(роли): когда на фронте появятся роли, пункт «Подключить бизнес» скрыть от
// не-владельцев. Сейчас ролей нет — пункт виден всем. Это TODO, а не логика:
// прав доступа в коде фронта не заводим (права = доступы Google к таблице).

defineProps({
  label: { type: String, required: true },
})

const open = ref(false)
const modalOpen = ref(false)
const rootRef = ref(null)
const menuRef = ref(null)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function openConnect() {
  close()
  modalOpen.value = true
}

function onKey(e) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
function onDocClick(e) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target)) close()
}

watch(open, async (v) => {
  if (v) {
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onDocClick, true)
    await nextTick()
    menuRef.value?.querySelector('[role="menuitem"]')?.focus?.()
  } else {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('click', onDocClick, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick, true)
})
</script>

<template>
  <div ref="rootRef" class="relative inline-flex">
    <button
      type="button"
      data-test="business-chip"
      class="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--graphite)] py-1 pl-4 pr-3 text-[0.75rem] font-medium uppercase tracking-[0.32em] text-[var(--ink-on-color)] active:opacity-90"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="menu"
      @click="toggle"
    >
      {{ label }}
      <ChevronDown
        class="h-3.5 w-3.5 shrink-0 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
        :stroke-width="2.25"
        aria-hidden="true"
      />
    </button>

    <!-- выпадающий список: под чипом, по центру относительно него -->
    <div
      v-if="open"
      ref="menuRef"
      data-test="business-menu"
      role="menu"
      class="absolute left-1/2 top-full z-40 mt-2 w-[16.5rem] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1 text-left shadow-2xl"
    >
      <button
        v-for="b in BUSINESSES"
        :key="b.id"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left active:bg-[var(--surface-2)]"
        style="min-height: 44px"
        @click="close"
      >
        <span class="text-[1rem] text-[var(--text)]">{{ b.name }}</span>
        <Check
          v-if="b.active"
          class="ml-auto h-5 w-5 text-[var(--text)]"
          :stroke-width="2.25"
          aria-label="Активный бизнес"
        />
      </button>

      <div class="my-1 h-px bg-[var(--line)]" aria-hidden="true"></div>

      <button
        type="button"
        role="menuitem"
        data-test="business-connect"
        class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left active:bg-[var(--surface-2)]"
        style="min-height: 44px"
        @click="openConnect"
      >
        <Plus class="h-5 w-5 shrink-0 text-[var(--text-secondary)]" :stroke-width="2.25" aria-hidden="true" />
        <span class="flex min-w-0 flex-col">
          <span class="text-[1rem] leading-tight text-[var(--text)]">Подключить бизнес</span>
          <span class="text-[0.75rem] leading-tight text-[var(--text-muted)]">с экспертом</span>
        </span>
      </button>
    </div>

    <ConnectBusinessModal :open="modalOpen" @close="modalOpen = false" />
  </div>
</template>
