<script setup>
import { ref } from 'vue'
import { AlertCircle } from 'lucide-vue-next'
import { ACCESS_RU } from '../i18n/access.js'

// Экран входа на весь вход (Фаза 4): одна общая фраза доступа, без логинов/ролей.
// Дизайн — токены DESIGN-STANDARD: фон --bg/--surface, рамка --line, текст монохром.
// Цвет несёт только функцию: при ошибке — иконка-заливка --negative; текст
// при этом монохромный (§3.5 — цветного текста нет). Кнопка — акцент-заливка
// с --accent-ink. Тач-таргеты ≥44pt.

const props = defineProps({
  error: { type: Boolean, default: false }, // неверная фраза
  loading: { type: Boolean, default: false }, // идёт проверка
  netError: { type: String, default: null }, // нет связи с источником
})
const emit = defineEmits(['submit'])

const phrase = ref('')

function onSubmit() {
  const v = phrase.value.trim()
  if (!v || props.loading) return
  emit('submit', v)
}
</script>

<template>
  <div class="flex min-h-[100svh] flex-col items-center justify-center bg-[var(--bg)] px-6">
    <form class="flex w-full max-w-[20rem] flex-col gap-3" @submit.prevent="onSubmit">
      <div class="flex flex-col gap-1 text-center">
        <h1 class="text-[1.25rem] font-semibold text-[var(--text)]">
          {{ ACCESS_RU.title }}
        </h1>
        <p class="text-[0.9375rem] text-[var(--text-muted)]">
          {{ ACCESS_RU.hint }}
        </p>
      </div>

      <input
        v-model="phrase"
        type="password"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="ACCESS_RU.placeholder"
        :aria-invalid="error ? 'true' : 'false'"
        :disabled="loading"
        class="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-[1.0625rem] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--text-muted)] disabled:opacity-60"
        style="min-height: 44px"
      />

      <!-- Фидбэк: цвет — только в иконке-заливке (функция), текст монохром -->
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

      <button
        type="submit"
        :disabled="loading"
        class="w-full rounded-full bg-[var(--accent)] px-4 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
        style="min-height: 44px"
      >
        {{ loading ? ACCESS_RU.checking : ACCESS_RU.submit }}
      </button>
    </form>
  </div>
</template>
