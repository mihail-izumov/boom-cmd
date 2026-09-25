<script setup>
import { computed, ref } from 'vue'
import { Info } from 'lucide-vue-next'

// Поле формы «Отчёт дня»: подпись + ⓘ-тултип (тач ≥44pt) + контрол + подсветка
// ошибки. По умолчанию контрол — числовой инпут (inputmode="numeric", БЕЗ
// спиннеров: type="text", ввод фильтруется до цифр — рубли/штуки целыми).
// Для селекта/textarea контрол передаётся слотом `control` (рамка та же).
// Текст тултипа — монохромный серый блок (цветного текста нет, DESIGN-STANDARD).
//
// Разделение на тысячи при вводе (25.09, просьба владельца): в поле видно
// «207 249», а в модель формы уходят только цифры «207249». Поэтому валидация,
// сводка и payload не меняются вовсе — пробел живёт только на экране.
// Разделитель — неразрывный пробел, как в `formatInt` (одинаково с остальными
// числами приложения, и число не рвётся переносом).
// Каретка после переформатирования ставится за ТУ ЖЕ цифру, что была до него:
// иначе при правке середины числа она прыгала бы в конец. Стёрли Backspace'ом
// сам пробел — стирается цифра перед ним, как в банковских приложениях; без
// этого нажатие выглядело бы «не сработавшим».
// Атрибут pattern="[0-9]*" снят: с пробелами поле числилось бы :invalid. Цифровую
// клавиатуру на iOS и Android даёт inputmode="numeric".

const SEP = ' '
const onlyDigits = (s) => String(s ?? '').replace(/\D+/g, '')
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, SEP)

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  tip: { type: String, default: '' },
  // постоянный хинт «где взять число» под контролом (v2.2 §2) — всегда видим, НЕ тултип
  hint: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  optional: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const tipOpen = ref(false)

// что показывать в поле: цифры модели, сгруппированные по три
const display = computed(() => group(onlyDigits(props.modelValue)))

function onInput(e) {
  const el = e.target
  const raw = el.value
  // только цифры; целые ≥0 (минус/точку/запятую не пропускаем, пробелы — наши)
  let clean = onlyDigits(raw)
  // Клавиатура ещё собирает символ (IME на части Android-клавиатур) — поле не
  // трогаем, иначе ввод рвётся; отформатируем на следующем событии.
  if (e.isComposing) {
    emit('update:modelValue', clean)
    return
  }
  const caret = typeof el.selectionStart === 'number' ? el.selectionStart : raw.length
  let digitsBefore = onlyDigits(raw.slice(0, caret)).length
  // Стёрли только разделитель — цифр не убавилось: стираем соседнюю цифру.
  const type = e.inputType || ''
  if (type.startsWith('delete') && clean === onlyDigits(props.modelValue) && clean) {
    const forward = type === 'deleteContentForward'
    const i = forward ? digitsBefore : digitsBefore - 1
    if (i >= 0 && i < clean.length) {
      clean = clean.slice(0, i) + clean.slice(i + 1)
      if (!forward) digitsBefore -= 1
    }
  }
  const formatted = group(clean)
  if (formatted !== raw) {
    el.value = formatted
    // каретка — сразу за той же по счёту цифрой
    let pos = 0
    let seen = 0
    while (pos < formatted.length && seen < digitsBefore) {
      if (formatted[pos] !== SEP) seen += 1
      pos += 1
    }
    try { el.setSelectionRange(pos, pos) } catch { /* поле не в фокусе — не страшно */ }
  }
  emit('update:modelValue', clean)
}
</script>

<template>
  <div class="py-2.5">
    <div class="flex items-center">
      <label
        :for="id"
        class="text-[0.875rem] font-medium text-[var(--text-secondary)]"
      >{{ label }}<span
        v-if="optional"
        class="ml-1.5 font-normal text-[var(--text-muted)]"
      >· необязательно</span></label>
      <!-- ⓘ: визуально компактная иконка, тач-зона 44×44 (отрицательные поля) -->
      <button
        v-if="tip"
        type="button"
        class="-my-2.5 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--surface-2)]"
        :aria-expanded="tipOpen ? 'true' : 'false'"
        :aria-label="`Пояснение: ${label}`"
        @click="tipOpen = !tipOpen"
      >
        <Info class="h-[18px] w-[18px]" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-0.5"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-0.5"
    >
      <p
        v-if="tip && tipOpen"
        class="mt-1.5 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]"
      >{{ tip }}</p>
    </Transition>

    <slot name="control">
      <input
        :id="id"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        enterkeyhint="next"
        :placeholder="placeholder"
        :value="display"
        class="mt-1.5 w-full min-h-[44px] rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-[1.0625rem] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
        :class="invalid ? 'border-[var(--negative)]' : 'border-[var(--line)] focus:border-[var(--text-muted)]'"
        @input="onInput"
      />
    </slot>

    <p
      v-if="hint"
      class="mt-1 text-[0.75rem] leading-snug text-[var(--text-muted)]"
    >{{ hint }}</p>
  </div>
</template>
