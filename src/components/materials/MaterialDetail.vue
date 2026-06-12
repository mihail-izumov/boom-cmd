<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { X, ExternalLink, Maximize2 } from 'lucide-vue-next'
import {
  MATERIALS_FIELD_RU,
  typeIcon,
  isLocalImage,
} from '../../i18n/materials.js'
import ImageViewer from './ImageViewer.vue'

// Read-only модалка деталей материала — по образцу ProjectDetail:
// fixed inset-0 + focus-trap + body-scroll-lock; bottom-sheet на мобиле,
// центр на ≥sm. Закрытие: фон / кнопка / Esc.
//
// Сырой URL не показываем (решение владельца) — внизу одна кнопка действия:
//   • локальное изображение → «Смотреть» → ImageViewer внутри PWA;
//   • всё остальное со ссылкой → «Открыть ссылку» → новое окно
//     (target=_blank + noopener; в standalone-PWA это Safari-просмотр поверх).
// ImageViewer живёт внутри модалки: Esc сначала закрывает просмотр, потом её.

const props = defineProps({
  material: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const dialogRef = ref(null)
const closeBtnRef = ref(null)
const viewerOpen = ref(false)

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
    if (viewerOpen.value) {
      viewerOpen.value = false
      return
    }
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

const TypeIcon = computed(() => typeIcon(props.material?.type))
const typeLabel = computed(() => props.material?.type || 'Материал')
const directionsLabel = computed(() =>
  (props.material?.directions || []).filter(Boolean).join(' · '),
)
const localImage = computed(() => isLocalImage(props.material))
const hasAction = computed(() => !!props.material?.href)
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
      :aria-label="material?.title || 'Материал'"
      class="bc-fade-in flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
      style="padding-bottom: env(safe-area-inset-bottom)"
    >
      <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <span
          class="inline-flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[0.9375rem] font-medium text-[var(--text)]"
        >
          <component
            :is="TypeIcon"
            class="h-4 w-4 shrink-0 text-[var(--text-muted)]"
            :stroke-width="2"
            aria-hidden="true"
          />
          {{ typeLabel }}
        </span>
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
          {{ material?.title }}
        </h2>

        <dl class="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-[0.9375rem]">
          <template v-if="material?.status">
            <dt class="text-[var(--text-muted)]">{{ MATERIALS_FIELD_RU.status }}</dt>
            <dd class="text-[var(--text)]">{{ material.status }}</dd>
          </template>

          <template v-if="directionsLabel">
            <dt class="text-[var(--text-muted)]">{{ MATERIALS_FIELD_RU.directions }}</dt>
            <dd class="text-[var(--text)]">{{ directionsLabel }}</dd>
          </template>

          <template v-if="material?.last_updated">
            <dt class="text-[var(--text-muted)]">{{ MATERIALS_FIELD_RU.updated }}</dt>
            <dd class="text-[var(--text)]">{{ material.last_updated }}</dd>
          </template>
        </dl>

        <section v-if="material?.description" class="mt-5">
          <h3
            class="mb-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >{{ MATERIALS_FIELD_RU.description }}</h3>
          <p
            class="whitespace-pre-wrap text-[1rem] leading-relaxed text-[var(--text-secondary)]"
          >{{ material.description }}</p>
        </section>
      </div>

      <footer
        v-if="hasAction"
        class="border-t border-[var(--line)] px-4 py-3"
      >
        <button
          v-if="localImage"
          type="button"
          class="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
          style="min-height: 44px"
          @click="viewerOpen = true"
        >
          <Maximize2 class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
          Смотреть
        </button>
        <a
          v-else
          :href="material.href"
          target="_blank"
          rel="noopener noreferrer"
          class="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
          style="min-height: 44px"
        >
          <ExternalLink class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
          Открыть ссылку
        </a>
      </footer>
    </div>

    <ImageViewer
      v-if="viewerOpen && localImage"
      :href="material.href"
      :alt="material.title"
      @close="viewerOpen = false"
    />
  </div>
</template>
