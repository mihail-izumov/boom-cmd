<script setup>
import { ref } from 'vue'
import { Info } from 'lucide-vue-next'

// Поле формы «Отчёт дня»: подпись + ⓘ-тултип (тач ≥44pt) + контрол + подсветка
// ошибки. По умолчанию контрол — числовой инпут (inputmode="numeric", БЕЗ
// спиннеров: type="text", ввод фильтруется до цифр — рубли/штуки целыми).
// Для селекта/textarea контрол передаётся слотом `control` (рамка та же).
// Текст тултипа — монохромный серый блок (цветного текста нет, DESIGN-STANDARD).

defineProps({
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

function onInput(e) {
  // только цифры; целые ≥0 (минус/точку/пробелы не пропускаем)
  const clean = e.target.value.replace(/\D+/g, '')
  if (clean !== e.target.value) e.target.value = clean
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
        pattern="[0-9]*"
        autocomplete="off"
        enterkeyhint="next"
        :placeholder="placeholder"
        :value="modelValue"
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
