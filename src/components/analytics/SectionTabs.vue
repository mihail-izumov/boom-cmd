<script setup>
import { nextTick, ref, watch } from 'vue'
import { DOMAIN_ORDER, DOMAIN_RU } from '../../i18n/analytics.js'

// Горизонтальная лента вкладок внутри секции «Аналитика»:
//   Главный экран · Пополнения · Игроки · Карты · Чек игры · Призотека · Отзывы.
// Скролл по X — допустим (это контрол, не контент). Контент-свайпа нет.
// Активная вкладка — жёлтая заливка (--accent) + ink (DESIGN-STANDARD §3.5).
// Тач-таргеты ≥44pt; при выборе подкручиваем вкладку в зону видимости.

const TABS = ['home', ...DOMAIN_ORDER]
const LABEL = { home: 'Главный экран', ...DOMAIN_RU }

const props = defineProps({
  modelValue: { type: String, required: true },
})
defineEmits(['update:modelValue'])

const scrollerRef = ref(null)
const btns = ref({})

async function ensureVisible(id) {
  await nextTick()
  const sc = scrollerRef.value
  const el = btns.value[id]
  if (!sc || !el) return
  const elLeft = el.offsetLeft - sc.offsetLeft
  const elRight = elLeft + el.offsetWidth
  const viewLeft = sc.scrollLeft
  const viewRight = viewLeft + sc.clientWidth
  if (elLeft < viewLeft) sc.scrollTo({ left: Math.max(0, elLeft - 12), behavior: 'smooth' })
  else if (elRight > viewRight) sc.scrollTo({ left: elRight - sc.clientWidth + 12, behavior: 'smooth' })
}

watch(() => props.modelValue, (v) => ensureVisible(v), { immediate: true })
</script>

<template>
  <div
    ref="scrollerRef"
    class="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
    style="-ms-overflow-style: none"
    role="tablist"
    aria-label="Разделы аналитики"
  >
    <button
      v-for="id in TABS"
      :key="id"
      :ref="(el) => (btns[id] = el)"
      type="button"
      role="tab"
      :aria-selected="modelValue === id"
      class="inline-flex shrink-0 items-center rounded-full px-4 text-[0.9375rem] font-medium transition-colors"
      :class="modelValue === id
        ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
        : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] active:bg-[var(--surface-2)]'"
      style="min-height: 44px"
      @click="$emit('update:modelValue', id)"
    >{{ LABEL[id] }}</button>
  </div>
</template>

<style scoped>
/* Скрытие скроллбара в WebKit — контрол должен выглядеть лёгкой лентой. */
div::-webkit-scrollbar { display: none; }
</style>
