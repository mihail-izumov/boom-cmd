<script setup>
import { computed, ref } from 'vue'
import { AlertCircle, Eye, EyeOff } from 'lucide-vue-next'
import { ACCESS_RU } from '../i18n/access.js'

// Экран входа (Фаза 4). Заголовок «Расти с планом» вверху по центру; белая карта
// строго по центру экрана (БУМБАСТИК → логин+фраза в одном поле с разделителем →
// «Войти»); внизу — маскированный графитом логотип «Модуль роста» + обводочная
// плашка «Мастерплан» (оба приглушены opacity). Токены DESIGN-STANDARD, текст
// монохром, цвет только по функции (ошибка — иконка --negative; кнопка — --accent).
// Поле «логин» — ДЕКОРАТИВНОЕ (placeholder Knock_Knock), в проверке не участвует:
// вход по-прежнему по фразе доступа.

const props = defineProps({
  error: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  netError: { type: String, default: null },
  notice: { type: String, default: null },
})
const emit = defineEmits(['submit'])

const login = ref('') // декоративное поле, не валидируется
const phrase = ref('')
const show = ref(false)

function onSubmit() {
  const v = phrase.value.trim()
  if (!v || props.loading) return
  emit('submit', v)
}

// Логотип тонируется графитом через CSS-маску (силуэт SVG, независимо от заливок).
const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
const logoUrl = `url("${base}runscale_logo.svg")`
const logoMask = {
  WebkitMaskImage: logoUrl, maskImage: logoUrl,
  WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center', maskPosition: 'center',
  WebkitMaskSize: 'contain', maskSize: 'contain',
}
</script>

<template>
  <div class="flex min-h-[100svh] flex-col bg-[var(--bg)] px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
    <!-- заголовок: по центру между верхом и картой -->
    <div class="flex flex-1 items-center justify-center">
      <h1 class="text-center text-[2.875rem] font-semibold leading-[1.04] tracking-tight text-[var(--text)]">Расти<br>с планом</h1>
    </div>

    <!-- карта ввода (строго по центру экрана за счёт равных flex-зон) -->
    <form class="mx-auto w-full max-w-[20rem]" @submit.prevent="onSubmit">
      <div class="flex flex-col gap-4 rounded-[26px] bg-[var(--surface)] p-6 shadow-[0_2px_14px_rgba(28,27,24,0.08)]">
        <p class="text-center text-[1.625rem] font-extrabold tracking-[0.03em] text-[var(--text)]">{{ ACCESS_RU.brand }}</p>

        <!-- объединённое поле: логин / разделитель / фраза, единая обводка -->
        <div class="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <div class="flex min-h-[52px] items-center px-4">
            <input
              v-model="login"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="ACCESS_RU.login_ph"
              :disabled="loading"
              class="w-full border-none bg-transparent text-[1.0625rem] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-60"
            />
          </div>
          <div class="h-px bg-[var(--line)]" aria-hidden="true"></div>
          <div class="relative flex min-h-[52px] items-center pl-4 pr-1">
            <input
              v-model="phrase"
              :type="show ? 'text' : 'password'"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="ACCESS_RU.placeholder"
              :aria-invalid="error ? 'true' : 'false'"
              :disabled="loading"
              class="w-full border-none bg-transparent pr-2 text-[1.0625rem] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-60"
            />
            <button
              type="button"
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--surface-2)]"
              :aria-label="show ? ACCESS_RU.hide : ACCESS_RU.show"
              :aria-pressed="show ? 'true' : 'false'"
              tabindex="-1"
              @click="show = !show"
            >
              <EyeOff v-if="show" class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
              <Eye v-else class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- ошибка: цвет только в иконке, текст монохром -->
        <p
          v-if="error || netError"
          class="flex items-center justify-center gap-1.5 text-[0.875rem] text-[var(--text-secondary)]"
          role="alert"
        >
          <AlertCircle class="h-4 w-4 shrink-0 text-[var(--negative)]" :stroke-width="2" aria-hidden="true" />
          <span>{{ netError || ACCESS_RU.wrong }}</span>
        </p>
        <p v-else-if="notice" class="text-center text-[0.875rem] text-[var(--text-muted)]">{{ notice }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-2xl bg-[var(--accent)] px-4 text-[1.125rem] font-bold text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
          style="min-height: 52px"
        >
          {{ loading ? ACCESS_RU.checking : ACCESS_RU.submit }}
        </button>
      </div>
    </form>

    <!-- футер: маскированный графитом логотип + обводочная плашка «Мастерплан», приглушены -->
    <div class="flex flex-1 flex-col items-center justify-end gap-2 pb-10 opacity-[0.62]">
      <div class="h-7 w-[99px] bg-[var(--graphite)]" :style="logoMask" role="img" aria-label="Модуль роста"></div>
      <div class="w-[99px] rounded-full border-2 border-[var(--graphite)] px-2 py-1 text-center text-[0.625rem] font-bold uppercase tracking-[0.08em] text-[var(--graphite)]">{{ ACCESS_RU.section }}</div>
    </div>
  </div>
</template>
