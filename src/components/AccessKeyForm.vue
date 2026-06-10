<script setup>
import { ref } from 'vue'
import { AlertCircle, Eye, EyeOff } from 'lucide-vue-next'
import { ACCESS_RU } from '../i18n/access.js'

// Экран входа на весь вход (Фаза 4): одна общая фраза доступа, без логинов/ролей.
// Дизайн — токены DESIGN-STANDARD: фон --bg/--surface, рамка --line, текст монохром.
// Цвет несёт только функцию: при ошибке — иконка-заливка --negative; текст
// при этом монохромный (§3.5). Кнопка — акцент-заливка с --accent-ink. ≥44pt.

const props = defineProps({
  error: { type: Boolean, default: false }, // неверная фраза
  loading: { type: Boolean, default: false }, // идёт проверка
  netError: { type: String, default: null }, // нет связи с источником
  notice: { type: String, default: null }, // сессия истекла / доступ изменился
})
const emit = defineEmits(['submit'])

const phrase = ref('')
const show = ref(false) // показывать ли символы пароля

function onSubmit() {
  const v = phrase.value.trim()
  if (!v || props.loading) return
  emit('submit', v)
}
</script>

<template>
  <div class="flex min-h-[100svh] flex-col items-center justify-center bg-[var(--bg)] px-6">
    <form class="flex w-full max-w-[20rem] flex-col gap-3" @submit.prevent="onSubmit">
      <div class="flex flex-col items-center gap-2">
        <h1 class="text-[2rem] font-extrabold tracking-tight text-[var(--text)]">
          {{ ACCESS_RU.brand }}
        </h1>
        <span
          class="rounded-full bg-[var(--surface-2)] px-4 py-2 text-[1.1875rem] font-medium text-[var(--text-secondary)]"
        >{{ ACCESS_RU.section }}</span>
      </div>

      <div class="relative mt-2">
        <input
          v-model="phrase"
          :type="show ? 'text' : 'password'"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="ACCESS_RU.placeholder"
          :aria-invalid="error ? 'true' : 'false'"
          :disabled="loading"
          class="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] pl-4 pr-12 text-[1.0625rem] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--text-muted)] disabled:opacity-60"
          style="min-height: 50px"
        />
        <button
          type="button"
          class="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--surface-2)]"
          :aria-label="show ? ACCESS_RU.hide : ACCESS_RU.show"
          :aria-pressed="show ? 'true' : 'false'"
          tabindex="-1"
          @click="show = !show"
        >
          <EyeOff v-if="show" class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
          <Eye v-else class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <!-- Ошибка (неверная фраза / нет связи): цвет только в иконке, текст монохром -->
      <p
        v-if="error || netError"
        class="flex items-center justify-center gap-1.5 text-[0.875rem] text-[var(--text-secondary)]"
        role="alert"
      >
        <AlertCircle
          class="h-4 w-4 shrink-0 text-[var(--negative)]"
          :stroke-width="2"
          aria-hidden="true"
        />
        <span>{{ netError || ACCESS_RU.wrong }}</span>
      </p>

      <!-- Информация (сессия истекла / доступ изменился) — нейтрально, без значка-ошибки -->
      <p
        v-else-if="notice"
        class="text-center text-[0.875rem] text-[var(--text-muted)]"
      >{{ notice }}</p>

      <button
        type="submit"
        :disabled="loading"
        class="mt-1 w-full rounded-full bg-[var(--accent)] px-4 text-[1.125rem] font-bold text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
        style="min-height: 52px"
      >
        {{ loading ? ACCESS_RU.checking : ACCESS_RU.submit }}
      </button>
    </form>
  </div>
</template>
