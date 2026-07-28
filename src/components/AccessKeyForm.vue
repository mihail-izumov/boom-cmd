<script setup>
import { computed, ref } from 'vue'
import { AlertCircle, Eye, EyeOff } from 'lucide-vue-next'
import { ACCESS_RU } from '../i18n/access.js'

// Экран входа (Фаза 4; ревизия D-21 от 28.07.2026 — ТЗ «экран входа: логотип Ранскейл»).
//
// Сверху вниз: логотип Ранскейл (шеврон + слово) вместо прежнего заголовка
// «Расти с планом» → карта входа по центру экрана (ярлык ДОСТУП В СИСТЕМУ →
// логин+код в одном поле с разделителем → СТАРТ) → в подвале логотип
// «Модуль роста». Плашка с именем продукта из подвала УБРАНА.
//
// Метрики лого (mobile при вьюпорте 390px): шеврон 53px по высоте, зазор до слова
// 12px, слово 28px Univers 67 Bold Cond, капс, трекинг 0.06em. Ширина шеврона
// считается из его пропорции (1080:923.72) = 62px ≈ 44% ширины слова (141.5px по
// метрикам шрифта) — канон утверждённого локапа. Прежние 72px/60% (вариант A)
// отклонены владельцем 28.07. На ≥768px связка масштабируется ×1.5 (80 / 18 / 42px).
//
// ПАКЕТ ПРАВОК v2 (тёмная витрина входа, референс docs/brand/ranskeil-login-dark-v2.png):
// экран переведён в нейтральный монохром через СКОУПНЫЙ набор токенов
// `data-theme="auth-dark"` на корне (значения — в src/styles/main.css). Атрибут висит
// на компоненте, а не на <html>: внутрь приложения тёмная тема НЕ распространяется —
// «Сегодня» и остальные экраны остаются светлыми (явная граница ТЗ). Ни одного hex
// в разметке: жёлтая кнопка стала белой переопределением --accent/--accent-ink,
// а не заменой классов. Цвет = сигнал: единственный цветной элемент — текст ошибки.
//
// Метрики шеврона выверены по мокапу v2 (780×1500 = 390×750 @2x): знак 106px = 53px CSS,
// слово — cap 42px = 21px CSS, что при cap-height 0.722 em даёт ровно 28px кегля.
//
// Токены DESIGN-STANDARD, текст монохром, цвет только по функции (ошибка —
// --negative; кнопка — --accent). Хардкод `#111` из ТЗ заменён на var(--text):
// хардкод hex запрещён, а токен ещё и позволил переключить экран в тёмный одним блоком.
// Поле «логин» — ДЕКОРАТИВНОЕ, в проверке не участвует: вход по-прежнему по
// фразе доступа. Placeholder показывает реальный формат логина, а не шутку.

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

// Логотипы тонируются через CSS-маску (силуэт SVG, независимо от заливок в файле).
const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
const maskOf = (file) => {
  const url = `url("${base}${file}")`
  return {
    WebkitMaskImage: url, maskImage: url,
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
    WebkitMaskSize: 'contain', maskSize: 'contain',
  }
}
const logoMask = maskOf('runscale_logo.svg') // «Модуль роста», подвал
// Шеврон Ранскейл. viewBox обрезан по знаку (см. комментарий в самом svg),
// поэтому aspect-ratio = ровно пропорция знака, а height = его реальная высота.
const chevronMask = { ...maskOf('runscale_chevron.svg'), aspectRatio: '1080 / 923.72' }

// Тёмный theme-color системной шапки ставит НЕ этот компонент, а App.vue по
// состоянию гейта (см. composables/useThemeColor.js): если фраза уже подтверждена,
// форма входа не монтируется — возвращать цвет было бы некому.
</script>

<template>
  <div
    data-theme="auth-dark"
    data-test="access-root"
    class="flex min-h-[100svh] flex-col bg-[var(--bg)] px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
  >
    <!-- логотип: связка шеврон + слово, отступ сверху ≈13% высоты экрана (ТЗ §1) -->
    <div class="flex flex-1 items-start justify-center pt-[13svh]">
      <div
        data-test="access-logo"
        class="flex flex-col items-center"
        role="img"
        :aria-label="ACCESS_RU.logo_alt"
      >
        <div
          data-test="access-chevron"
          class="h-[53px] bg-[var(--text)] md:h-[80px]"
          :style="chevronMask"
        ></div>
        <!-- mr компенсирует трекинг после последней буквы: без него связка
             визуально уезжает влево на половину межбуквенного интервала -->
        <span
          data-test="access-wordmark"
          class="mt-[12px] mr-[-0.06em] font-brand text-[1.75rem] uppercase leading-none tracking-[0.06em] text-[var(--text)] md:mt-[18px] md:text-[2.625rem]"
          aria-hidden="true"
        >Ранскейл</span>
      </div>
    </div>

    <!-- карта ввода (строго по центру экрана за счёт равных flex-зон) -->
    <form class="mx-auto w-full max-w-[20rem]" @submit.prevent="onSubmit">
      <div class="flex flex-col gap-4 rounded-[26px] bg-[var(--surface)] p-6 shadow-[0_2px_14px_rgba(28,27,24,0.08)]">
        <!-- ярлык функции, а не вывеска: тише и мельче прежнего «БУМБАСТИК».
             v2: разрядка 6% → 10%, цвет --text-secondary = #9A9A9A на карточке
             #161616 → 6.43:1 (посчитано по WCAG, не на память) -->
        <p
          data-test="access-card-label"
          class="text-center font-label text-[0.9375rem] uppercase tracking-[0.1em] text-[var(--text-secondary)]"
        >{{ ACCESS_RU.card_label }}</p>

        <!-- объединённое поле: логин / разделитель / фраза, единая обводка.
             v2: фон полей темнее карточки (--surface-2 #0F0F0F на --surface #161616) -->
        <div class="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-2)]">
          <div class="flex min-h-[52px] items-center px-4">
            <input
              v-model="login"
              type="text"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="ACCESS_RU.login_ph"
              :disabled="loading"
              data-test="access-login"
              class="w-full border-none bg-transparent font-mono text-[1rem] text-[var(--text)] placeholder:text-[var(--placeholder)] outline-none disabled:opacity-60"
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
              data-test="access-phrase"
              class="w-full border-none bg-transparent pr-2 font-mono text-[1rem] text-[var(--text)] placeholder:text-[var(--placeholder)] outline-none disabled:opacity-60"
            />
            <button
              type="button"
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface)]"
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

        <!-- ошибка — ЕДИНСТВЕННЫЙ цветной элемент экрана (v2: цвет = сигнал,
             а не декорация). Поэтому здесь текст красный, а не монохромный, как
             в остальном приложении. --negative на тёмной витрине поднят до
             #FF5C4D = 5.94:1 на карточке (брендовый #D92D20 давал 3.75:1). -->
        <p
          v-if="error || netError"
          data-test="access-error"
          class="flex items-center justify-center gap-1.5 text-[0.875rem] text-[var(--negative)]"
          role="alert"
        >
          <AlertCircle class="h-4 w-4 shrink-0 text-[var(--negative)]" :stroke-width="2" aria-hidden="true" />
          <span>{{ netError || ACCESS_RU.wrong }}</span>
        </p>
        <p v-else-if="notice" class="text-center text-[0.875rem] text-[var(--text-muted)]">{{ notice }}</p>

        <!-- Форма/размер кнопки не тронуты. v2: цвет пришёл из скоупных токенов
             (--accent стал белым, --accent-ink чёрным), разрядка 6% → 12%. -->
        <button
          type="submit"
          data-test="access-submit"
          :disabled="loading"
          class="w-full rounded-2xl bg-[var(--accent)] px-4 font-brand text-[1.125rem] uppercase tracking-[0.12em] text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
          style="min-height: 52px"
        >
          {{ loading ? ACCESS_RU.checking : ACCESS_RU.submit }}
        </button>
      </div>
    </form>

    <!-- футер: только логотип «Модуль роста» под маску, приглушённым --graphite.
         Плашка с именем продукта убрана (D-21): имя продукта теперь наверху,
         в логотипе — дублировать его внизу нечем и незачем.
         v2: прежний opacity 0.62 снят — он был подобран под светлый фон и на
         тёмном утопил бы подпись совсем; приглушение теперь даёт сам токен. -->
    <div class="flex flex-1 flex-col items-center justify-end pb-10">
      <div class="h-7 w-[99px] bg-[var(--graphite)]" :style="logoMask" role="img" aria-label="Модуль роста"></div>
    </div>
  </div>
</template>
