<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, Share, X } from 'lucide-vue-next'

// Баннер «Откройте Ранскейл как приложение» на Главной (ревизия 12.06.2026;
// имя продукта 28.07.2026: «Мастерплан» → «Ранскейл», D-20 — «Мастерплан» стал
// внутренним именем модуля, продукт называется Ранскейл. Иконка НЕ менялась —
// это отдельная задача владельца).
// Иконка приложения слева, заголовок, пилюля «Подробнее ↓» → модалка-инструкция
// по установке PWA на домашний экран iPhone; крестик — закрыть.
//
// Логика показа (ревизия 13.06.2026):
//   • уже запущено как установленное PWA (standalone) → НЕ показываем вовсе;
//   • закрыли крестиком → прячем только в памяти текущего просмотра.
//     Перезагрузка / новый запуск → баннер снова виден (владелец: после
//     reload должен появляться). Персист в storage НЕ делаем.

const appIcon = `${import.meta.env.BASE_URL}icon-192.png`

const dismissed = ref(false)
const standalone = ref(false)
const modalOpen = ref(false)

function detectStandalone() {
  if (typeof window === 'undefined') return false
  const mm =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  // iOS Safari — нестандартный navigator.standalone.
  const iosStandalone = window.navigator && window.navigator.standalone === true
  return !!(mm || iosStandalone)
}

const visible = computed(() => !standalone.value && !dismissed.value)

function dismiss() {
  dismissed.value = true
}

// ——— модалка-инструкция ———
const dialogRef = ref(null)
const closeBtnRef = ref(null)

function onKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    modalOpen.value = false
  }
}
let prevOverflow = ''
function lockScroll() {
  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKey)
  nextTick(() => closeBtnRef.value?.focus())
}
function unlockScroll() {
  document.body.style.overflow = prevOverflow
  document.removeEventListener('keydown', onKey)
}
function openModal() {
  modalOpen.value = true
  nextTick(lockScroll)
}
function closeModal() {
  modalOpen.value = false
  unlockScroll()
}

onMounted(() => {
  standalone.value = detectStandalone()
})
onBeforeUnmount(() => {
  if (modalOpen.value) unlockScroll()
})

const steps = [
  'Откройте сайт в Safari на айфоне.',
  'Нажмите кнопку «Поделиться» внизу экрана — квадрат со стрелкой вверх.',
  'Пролистайте меню и выберите «На экран „Домой“».',
  'Нажмите «Добавить» — иконка Ранскейла появится рядом с другими приложениями.',
]
</script>

<template>
  <div v-if="visible" class="mt-2">
    <div
      class="relative flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-lg"
    >
      <span
        class="relative block h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl border border-[var(--line)]"
      >
        <img :src="appIcon" alt="" class="h-full w-full" />
        <span class="bc-shine" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1 pr-8">
        <span class="text-[0.9375rem] font-semibold leading-[1.15] text-[var(--text)]">
          Откройте Ранскейл<br />как приложение
        </span>
        <button
          type="button"
          class="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--text)] px-2.5 py-0.5 text-[0.75rem] font-medium text-[var(--ink-on-color)] active:opacity-90"
          @click="openModal"
        >
          Подробнее
          <ChevronDown class="h-3.5 w-3.5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        class="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--surface-2)]"
        aria-label="Скрыть баннер"
        @click="dismiss"
      >
        <X class="h-5 w-5" :stroke-width="2" />
      </button>
    </div>

    <!-- модалка-инструкция -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
      role="presentation"
      @click.self="closeModal"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        aria-label="Как установить приложение"
        class="bc-fade-in flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <span
            class="inline-flex items-center gap-2 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[0.9375rem] font-medium text-[var(--text)]"
          >
            <Share class="h-4 w-4 shrink-0 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
            Установка
          </span>
          <button
            ref="closeBtnRef"
            type="button"
            class="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
            aria-label="Закрыть"
            @click="closeModal"
          >
            <X class="h-5 w-5" :stroke-width="2" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-4 py-4">
          <h2 class="text-[1.25rem] font-semibold leading-snug text-[var(--text)]">
            Как пользоваться Ранскейлом на айфоне
          </h2>
          <p class="mt-2 text-[1rem] leading-relaxed text-[var(--text-secondary)]">
            Это веб-приложение — устанавливать из App Store ничего не нужно.
            Добавьте ярлык на домашний экран и пользуйтесь как обычным приложением.
          </p>

          <h3
            class="mt-5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]"
          >Добавьте Ранскейл на домашний экран</h3>
          <ol class="mt-3 flex flex-col gap-3">
            <li
              v-for="(step, i) in steps"
              :key="i"
              class="flex items-start gap-3"
            >
              <span
                class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[0.8125rem] font-semibold text-[var(--text-secondary)]"
              >{{ i + 1 }}</span>
              <span class="text-[1rem] leading-snug text-[var(--text)]">{{ step }}</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Периодический «блик» по иконке (запрос владельца): диагональная полоса
   света проходит раз в ~6с, остальное время — за кадром. Цвет блика — из
   токена --ink-on-color (белый) через color-mix, без хардкода. */
.bc-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 38%,
    color-mix(in srgb, var(--ink-on-color) 55%, transparent) 50%,
    transparent 62%
  );
  transform: translateX(-120%);
  animation: bc-shine-sweep 6s ease-in-out infinite;
}
@keyframes bc-shine-sweep {
  0%,
  72% {
    transform: translateX(-120%);
  }
  88%,
  100% {
    transform: translateX(120%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bc-shine {
    animation: none;
    opacity: 0;
  }
}
</style>
