<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import {
  STATUS_RU,
  PRIORITY_RU,
  FIELD_RU,
  parkLabelForDetail,
  t,
} from '../../i18n/projects.js'
import PriorityIcon from './PriorityIcon.vue'
import DirectionChip from './DirectionChip.vue'
import MilestoneMark from './MilestoneMark.vue'

// Read-only модалка деталей проекта.
// fixed inset-0 + focus-trap + body-scroll-lock; на мобиле — bottom-sheet,
// на десктопе (≥sm) — центрированная панель. Закрытие: фон / кнопка / Esc.

const props = defineProps({
  project: { type: Object, default: null },
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

const statusRu = computed(() => t(STATUS_RU, props.project?.status))
const priorityRu = computed(() => t(PRIORITY_RU, props.project?.priority ?? 0))
const directions = computed(() => props.project?.directions || [])
const items = computed(() => props.project?.items || [])
// TZ-3.3 §2: scope теперь текст-поле (не бейдж). «Вся сеть» или имена парков
// через «·» — формируется единым хелпером.
const parksLabel = computed(() => parkLabelForDetail(props.project?.parks))
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
      :aria-label="project?.title || 'Проект'"
      class="flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
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
        <h2 class="text-[1.25rem] font-semibold leading-snug text-[var(--text)]">
          {{ project?.title }}
        </h2>

        <dl class="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-[0.9375rem]">
          <dt class="text-[var(--text-muted)]">{{ FIELD_RU.priority }}</dt>
          <dd class="flex items-center gap-2 text-[var(--text)]">
            <PriorityIcon :priority="project?.priority ?? 0" :size="14" />
            <span>{{ priorityRu }}</span>
          </dd>

          <template v-if="directions.length">
            <dt class="text-[var(--text-muted)]">{{ FIELD_RU.directions }}</dt>
            <dd class="flex flex-wrap gap-1">
              <DirectionChip v-for="d in directions" :key="d" :label="d" />
            </dd>
          </template>

          <dt class="text-[var(--text-muted)]">{{ FIELD_RU.parks }}</dt>
          <dd class="text-[var(--text)]">{{ parksLabel }}</dd>

          <template v-if="project?.target">
            <dt class="text-[var(--text-muted)]">{{ FIELD_RU.target }}</dt>
            <dd class="text-[var(--text)]">{{ project.target }}</dd>
          </template>
        </dl>

        <section v-if="project?.description" class="mt-5">
          <h3
            class="mb-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >{{ FIELD_RU.description }}</h3>
          <p
            class="whitespace-pre-wrap text-[1rem] leading-relaxed text-[var(--text-secondary)]"
          >{{ project.description }}</p>
        </section>

        <section v-if="items.length" class="mt-5">
          <h3
            class="mb-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >{{ FIELD_RU.items }}</h3>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="it in items"
              :key="it.id"
              class="flex items-start gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2"
            >
              <MilestoneMark v-if="it.type === 'milestone'" class="mt-[5px]" />
              <span v-else class="mt-[7px] inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--text-muted)]" aria-hidden="true" />
              <div class="flex min-w-0 flex-col">
                <span class="text-[0.9375rem] leading-snug text-[var(--text)]">{{ it.title }}</span>
                <span
                  v-if="it.description"
                  class="text-[0.8125rem] leading-snug text-[var(--text-muted)]"
                >{{ it.description }}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
