<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { RESUBMIT } from '../../i18n/report.js'

// Подтверждение пересдачи (v2.4 Ф-3, NET-152). Повод — 16.09: Питерленд пересдавал
// 11.09, а форма сама подставила вчерашнюю дату, 15.09, и отчёт лёг в чужой день.
// Пересдача — законная операция, поэтому здесь вопрос, а не запрет: «Да, пересдаю»
// отправляет, «Отмена» возвращает в форму с нетронутыми полями.
//
// Свой компонент, а не `window.confirm`: системный диалог блокирует поток, не
// стилизуется под токены и в PWA на iOS выглядит чужеродно. Паттерн — как у
// ConnectBusinessModal: Teleport в body, скрим, Escape и тап по фону = «Отмена».
// Фокус при открытии — на «Отмене»: случайный Enter не должен перезаписать день.

const props = defineProps({
  open: { type: Boolean, default: false },
  revenue: { type: Number, default: 0 },
})
const emit = defineEmits(['confirm', 'cancel'])

const dialogRef = ref(null)
const cancelRef = ref(null)

function onKey(e) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
    return
  }
  if (e.key === 'Tab') {
    // две кнопки — фокус ходит только между ними
    const els = dialogRef.value ? Array.from(dialogRef.value.querySelectorAll('button')) : []
    if (!els.length) return
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

watch(
  () => props.open,
  async (v) => {
    if (v) {
      document.addEventListener('keydown', onKey)
      await nextTick()
      cancelRef.value?.focus?.()
    } else {
      document.removeEventListener('keydown', onKey)
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
      role="presentation"
      @click.self="emit('cancel')"
    >
      <div
        ref="dialogRef"
        data-test="report-resubmit"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rep-resubmit-text"
        class="w-full max-w-[430px] rounded-t-2xl bg-[var(--surface)] px-4 pt-5 shadow-2xl sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <p
          id="rep-resubmit-text"
          data-test="report-resubmit-text"
          class="text-[1.0625rem] font-medium leading-snug text-[var(--text)]"
        >{{ RESUBMIT.text(revenue) }}</p>
        <div class="mt-4 flex flex-col gap-2">
          <button
            type="button"
            data-test="report-resubmit-yes"
            class="min-h-[48px] w-full rounded-2xl bg-[var(--accent)] px-4 text-[1.0625rem] font-semibold text-[var(--accent-ink)] active:opacity-90"
            @click="emit('confirm')"
          >{{ RESUBMIT.yes }}</button>
          <button
            ref="cancelRef"
            type="button"
            data-test="report-resubmit-cancel"
            class="min-h-[48px] w-full rounded-2xl bg-[var(--surface-2)] px-4 text-[1.0625rem] font-semibold text-[var(--text)] active:opacity-90"
            @click="emit('cancel')"
          >{{ RESUBMIT.cancel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
