<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { L } from '../../i18n/daily.js'

// Шкала оценки пользы «Сигнала Дня» — ЕДИНСТВЕННЫЙ шаг после нажатия на карточке
// (NET-61). Controlled по образцу ParkPickerSheet: prop `open`, emit
// `close`/`submit(score)`/`skip`. Ползунок монохромный (accent-color: var(--text)) —
// цветного не-статусного управления не заводим (DESIGN-STANDARD §3.3); значение —
// крупной цифрой.
//
// КОНТУР А ЗАЩИТЫ ОТ ДУРАКА (2026-08-04). Раньше шкала стартовала с 5 и «Отправить»
// была активна сразу: 7 оценок из 19 оказались ровно пятёрками — то есть дефолтом.
// Отличить «подумал и поставил 5» от «просто нажал Отправить» было нельзя, а по этой
// метрике владелец правит стандарт сигналов. Теперь значения нет, пока шкалу не
// тронули, и отправлять нечего.
//
// КОНТУР Б: отказ от оценки — ЯВНЫЙ выход «Отметить без оценки», а не догадка. И он,
// и крестик, и тап по фону записывают прочтение (это делает родитель): отметка не
// должна становиться заложником оценки. Ноль при этом не отправляется — поля score в
// теле запроса просто нет, и строка в signal_scores не появляется.
const props = defineProps({
  open: { type: Boolean, default: false },
  // Переоценка (Ф-5): текущая оценка — эхо записанного значения либо проекция бэка.
  // Есть — шкала открывается на ней и сразу готова к отправке: человек уже
  // высказался, требовать повторного касания незачем.
  // ⚠ Сюда приходит null, а не 0, когда оценки нет. Родитель считает значение через
  // scoreOf; прежняя формула `Number(entry.score)` давала 0 и открывала шкалу на нуле
  // уже «тронутой» — одно нажатие записывало ноль, которого никто не ставил (NET-62).
  initial: { type: Number, default: null },
  // Прочтение ещё не записано → есть чем «отказаться от оценки». Уже записано →
  // выход бессмыслен: отмечать нечего, достаточно закрыть.
  canSkip: { type: Boolean, default: true },
})
const emit = defineEmits(['close', 'submit', 'skip'])

const score = ref(5)      // позиция ползунка; смысл имеет только при touched
const touched = ref(false)

function hide() { emit('close') }
function send() {
  if (!touched.value) return
  emit('submit', Number(score.value))
}
// Явный отказ от оценки. Прочтение записывает родитель — здесь только намерение.
function skip() { emit('skip') }
function onKey(e) {
  if (props.open && e.key === 'Escape') {
    e.preventDefault()
    hide()
  }
}

// Каждое открытие — заново; плюс scroll-lock тела, как у шитов.
let prevOverflow = ''
watch(
  () => props.open,
  (v) => {
    if (v) {
      const has = Number.isInteger(props.initial)
      score.value = has ? props.initial : 5
      touched.value = has
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKey)
    } else {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  },
)
onBeforeUnmount(() => {
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
      data-test="signal-rate-sheet"
      class="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
      role="presentation"
      @click.self="hide"
    >
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="L.signal_rate_q"
        class="flex w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl bg-[var(--surface)] shadow-2xl sm:rounded-2xl"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <header class="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.signal_rate_q }}</h2>
          <button
            type="button"
            class="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
            aria-label="Закрыть"
            @click="hide"
          >
            <X class="h-5 w-5" :stroke-width="2" />
          </button>
        </header>

        <div class="px-4 pb-4 pt-3">
          <!-- крупное значение — единственный «ответ» модалки; до касания шкалы его нет -->
          <p
            data-test="signal-rate-value"
            class="text-center text-[2.25rem] font-bold leading-none tabular-nums text-[var(--text)]"
            aria-hidden="true"
          >{{ touched ? score : L.signal_rate_empty }}</p>

          <input
            v-model.number="score"
            data-test="signal-rate-slider"
            type="range"
            min="0"
            max="10"
            step="1"
            :aria-label="L.signal_rate_aria"
            class="mt-3 w-full"
            style="accent-color: var(--text); min-height: 44px"
            @input="touched = true"
          />
          <div class="mt-1 flex justify-between text-[0.75rem] text-[var(--text-muted)]">
            <span>{{ L.signal_rate_min }}</span>
            <span>{{ L.signal_rate_max }}</span>
          </div>

          <button
            type="button"
            data-test="signal-rate-submit"
            :disabled="!touched"
            class="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-[0.9375rem] font-semibold text-[var(--accent-ink)] transition-opacity active:opacity-90 disabled:opacity-60"
            style="min-height: 48px"
            @click="send"
          >
            {{ L.signal_rate_send }}
          </button>
          <p
            v-if="!touched"
            data-test="signal-rate-hint"
            class="mt-2 text-center text-[0.8125rem] text-[var(--text-muted)]"
          >{{ L.signal_rate_hint }}</p>

          <!-- Выход из шага, при котором прочтение всё равно записывается. Стоит
               ЗДЕСЬ, а не на карточке: на карточке это была бы вторая кнопка — ровно
               то, на что жаловались 04.08. Текстом, без заливки: это не равнозначная
               альтернатива отправке, а запасной выход. --text-secondary на --surface
               даёт 9,88:1. -->
          <button
            v-if="canSkip"
            type="button"
            data-test="signal-rate-skip"
            class="mt-1 flex w-full items-center justify-center rounded-xl px-4 text-[0.875rem] font-medium text-[var(--text-secondary)] active:bg-[var(--surface-2)]"
            style="min-height: 44px"
            @click="skip"
          >
            {{ L.signal_rate_skip }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
