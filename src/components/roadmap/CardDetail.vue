<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import {
  STATUS_RU,
  PRIORITY_RU,
  ESTIMATE_RU,
  FIELD_RU,
  STATUS_TOKEN,
  t,
} from '../../i18n/roadmap.js'
import PriorityIcon from './PriorityIcon.vue'
import LabelTag from './LabelTag.vue'

// Модалка деталей карточки — read-only.
// fixed inset-0 оверлей с центрированной панелью; на мобиле — bottom-sheet.
// Закрытие: фон / кнопка / Esc. Body-scroll-lock + примитивный focus-trap.

const props = defineProps({
  card: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const dialogRef = ref(null)
const closeBtnRef = ref(null)

function focusables() {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'))
}

function onKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
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
onMounted(() => {
  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKey)
  nextTick(() => closeBtnRef.value?.focus())
})
onBeforeUnmount(() => {
  document.body.style.overflow = prevOverflow
  document.removeEventListener('keydown', onKey)
})

const statusRu = computed(() => t(STATUS_RU, props.card?.status))
const priorityRu = computed(() => t(PRIORITY_RU, props.card?.priority ?? 0))
const estimateRu = computed(() =>
  props.card?.estimate ? t(ESTIMATE_RU, props.card.estimate) : null,
)
const statusDot = computed(
  () => STATUS_TOKEN[props.card?.status] || 'var(--text-muted)',
)
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
    role="presentation"
    @click.self="$emit('close')"
  >
    <div
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      :aria-label="card?.title || 'Карточка'"
      class="flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <span
          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: statusDot }"
          aria-hidden="true"
        />
        <span class="text-[0.875rem] text-[var(--text-muted)]">{{ statusRu }}</span>
        <button
          ref="closeBtnRef"
          type="button"
          class="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
          aria-label="Закрыть"
          @click="$emit('close')"
        >
          <X class="h-5 w-5" :stroke-width="2" />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-4 py-3">
        <div class="text-[0.8125rem] text-[var(--text-muted)]">
          <span>{{ card?.project }}</span>
          <span v-if="card?.target"> · {{ card.target }}</span>
        </div>
        <h2 class="mt-1 text-[1.25rem] font-semibold leading-snug text-[var(--text)]">
          {{ card?.title }}
        </h2>

        <dl class="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-[0.9375rem]">
          <dt class="text-[var(--text-muted)]">{{ FIELD_RU.priority }}</dt>
          <dd class="flex items-center gap-2 text-[var(--text)]">
            <PriorityIcon :priority="card?.priority ?? 0" :size="14" />
            <span>{{ priorityRu }}</span>
          </dd>

          <template v-if="card?.estimate">
            <dt class="text-[var(--text-muted)]">{{ FIELD_RU.estimate }}</dt>
            <dd class="text-[var(--text)]">
              {{ card.estimate }}
              <span class="text-[var(--text-secondary)]"> · {{ estimateRu }}</span>
            </dd>
          </template>

          <template v-if="card?.assignee">
            <dt class="text-[var(--text-muted)]">{{ FIELD_RU.assignee }}</dt>
            <dd class="text-[var(--text)]">{{ card.assignee }}</dd>
          </template>

          <template v-if="card?.target">
            <dt class="text-[var(--text-muted)]">{{ FIELD_RU.target }}</dt>
            <dd class="text-[var(--text)]">{{ card.target }}</dd>
          </template>

          <template v-if="card?.labels?.length">
            <dt class="text-[var(--text-muted)]">{{ FIELD_RU.labels }}</dt>
            <dd class="flex flex-wrap gap-1">
              <LabelTag v-for="l in card.labels" :key="l" :label="l" />
            </dd>
          </template>
        </dl>

        <section v-if="card?.description" class="mt-5">
          <h3
            class="mb-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >{{ FIELD_RU.description }}</h3>
          <p
            class="whitespace-pre-wrap text-[1rem] leading-relaxed text-[var(--text-secondary)]"
          >{{ card.description }}</p>
        </section>
      </div>
    </div>
  </div>
</template>
