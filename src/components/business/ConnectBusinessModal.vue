<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { BUSINESS_NAME_MAX, useConnectRequest } from '../../composables/useConnectRequest.js'

// Модалка «Подключить бизнес» (D-20).
//
// РОВНО ТРИ элемента содержимого — ни тарифов, ни конфигуратора, ни выбора
// модулей: подключение бизнеса делает команда, модалка только открывает диалог.
//   1) текст-объяснение,
//   2) поле «Название бизнеса» (одно, обязательное),
//   3) кнопка «Оставить заявку» → POST action=connect_request (Apps Script v3.7).
//
// Успех → состояние «Заявка отправлена…» и автозакрытие. Ошибка → плашка
// «Не удалось отправить, попробуйте ещё раз», введённое название НЕ теряем.
// Controlled: открытием управляет родитель (prop `open` + emit `close`).

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const L = {
  title: 'Подключить бизнес',
  lead: 'Эксперт Модуля Роста свяжется с вами, подключит данные и соберёт трекер под этот бизнес.',
  label: 'Название бизнеса',
  placeholder: 'Например, «Кофейня на Невском»',
  submit: 'Оставить заявку',
  sending: 'Отправляем…',
  done: 'Заявка отправлена. Эксперт свяжется с вами.',
  error: 'Не удалось отправить, попробуйте ещё раз',
}

const CLOSE_AFTER_MS = 1800 // сколько держим экран успеха перед автозакрытием

const name = ref('')
const { sending, sent, sendError, submit, reset } = useConnectRequest()

const dialogRef = ref(null)
const inputRef = ref(null)
let closeTimer = null

function hide() {
  emit('close')
}

async function onSubmit() {
  if (sending.value || !name.value.trim()) return
  const ok = await submit(name.value)
  if (!ok) return
  // название держим до закрытия: если владелец успеет закрыть руками — не мигаем пустым
  closeTimer = setTimeout(hide, CLOSE_AFTER_MS)
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
      // каждое открытие — с чистого листа (после успеха и после ошибки)
      name.value = ''
      reset()
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKey)
      await nextTick()
      inputRef.value?.focus?.()
    } else {
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  },
)

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
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
      class="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
      role="presentation"
      @click.self="hide"
    >
      <div
        ref="dialogRef"
        data-test="connect-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="L.title"
        class="flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.title }}</h2>
          <button
            type="button"
            class="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
            aria-label="Закрыть"
            @click="hide"
          >
            <X class="h-5 w-5" :stroke-width="2" />
          </button>
        </header>

        <!-- успех: одно сообщение, дальше автозакрытие -->
        <div v-if="sent" data-test="connect-done" class="px-4 py-6">
          <p class="text-[1.0625rem] leading-relaxed text-[var(--text)]">{{ L.done }}</p>
        </div>

        <!-- три элемента: текст · поле · кнопка -->
        <form v-else class="flex flex-col gap-4 px-4 py-4" @submit.prevent="onSubmit">
          <p class="text-[1rem] leading-relaxed text-[var(--text-secondary)]">{{ L.lead }}</p>

          <div>
            <label
              for="connect-business-name"
              class="text-[0.875rem] font-medium text-[var(--text-secondary)]"
            >{{ L.label }}</label>
            <input
              id="connect-business-name"
              ref="inputRef"
              v-model="name"
              data-test="connect-input"
              type="text"
              autocomplete="off"
              autocapitalize="sentences"
              spellcheck="false"
              required
              :maxlength="BUSINESS_NAME_MAX"
              :placeholder="L.placeholder"
              :disabled="sending"
              class="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[1.0625rem] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)] disabled:opacity-60"
            />
          </div>

          <p
            v-if="sendError"
            data-test="connect-error"
            class="rounded-xl px-3 py-2 text-[0.875rem] font-medium text-[var(--text)]"
            style="background: color-mix(in srgb, var(--negative) 16%, var(--surface))"
          >{{ L.error }}</p>

          <button
            type="submit"
            data-test="connect-submit"
            :disabled="sending || !name.trim()"
            class="min-h-[48px] w-full rounded-2xl bg-[var(--accent)] px-4 text-[1.0625rem] font-bold text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
          >{{ sending ? L.sending : L.submit }}</button>
        </form>
      </div>
    </div>
  </Teleport>
</template>
