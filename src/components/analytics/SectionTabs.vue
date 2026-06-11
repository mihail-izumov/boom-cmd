<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { DOMAIN_ORDER, DOMAIN_RU } from '../../i18n/analytics.js'

// Горизонтальная лента вкладок внутри секции «Аналитика»:
//   Сводный · Пополнения · Игроки · Карты · Чек игры · Призотека · Отзывы.
// Активная вкладка — жёлтая (DESIGN-STANDARD §3.5; цвет — для активного
// состояния). Скролл по X разрешён (это контрол, а не контент-свайп).
//
// Подсказка скрытого хвоста (по запросу владельца): по краям ленты —
// градиент-маски в `--bg`. Когда упёрся в левую/правую границу — маска
// с этой стороны гаснет (нет смысла подсказывать, что больше нечего
// показывать). Реализовано на DOM-оверлеях, без mask-image и
// зависимостей.
//
// Оптический подъём текста: capheight системных шрифтов визуально лежит
// чуть НИЖЕ геометрического центра кнопки. Компенсируем — `pb-[2px]`.

const TABS = ['home', ...DOMAIN_ORDER]
const LABEL = { home: 'Сводный', ...DOMAIN_RU }

const props = defineProps({
  modelValue: { type: String, required: true },
})
defineEmits(['update:modelValue'])

const scrollerRef = ref(null)
const btns = ref({})
const atStart = ref(true)
const atEnd = ref(false)

function update() {
  const sc = scrollerRef.value
  if (!sc) return
  const maxScroll = sc.scrollWidth - sc.clientWidth
  atStart.value = sc.scrollLeft <= 1
  atEnd.value = maxScroll <= 0 || sc.scrollLeft >= maxScroll - 1
}

function onScroll() {
  update()
}

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
  // Подкрутить флаги после ручной прокрутки (smooth-scroll не сразу
  // эмитит scroll, но onScroll триггернётся по ходу).
  update()
}

watch(() => props.modelValue, (v) => ensureVisible(v), { immediate: true })

onMounted(() => {
  update()
  window.addEventListener('resize', update)
})
onUnmounted(() => {
  window.removeEventListener('resize', update)
})
</script>

<template>
  <div class="relative -mx-3">
    <div
      ref="scrollerRef"
      class="flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
      style="-ms-overflow-style: none"
      role="tablist"
      aria-label="Разделы аналитики"
      @scroll.passive="onScroll"
    >
      <button
        v-for="id in TABS"
        :key="id"
        :ref="(el) => (btns[id] = el)"
        type="button"
        role="tab"
        :aria-selected="modelValue === id"
        class="inline-flex shrink-0 items-center rounded-full px-4 pb-[2px] text-[0.9375rem] font-medium transition-colors"
        :class="modelValue === id
          ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
          : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] active:bg-[var(--surface-2)]'"
        style="min-height: 44px"
        @click="$emit('update:modelValue', id)"
      >{{ LABEL[id] }}</button>
    </div>

    <!-- Градиент-маски подсказывают, что лента продолжается за краем.
         Прозрачно-цветные оверлеи; pointer-events:none. Гаснут на крае. -->
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-150"
      :style="{
        opacity: atStart ? 0 : 1,
        background: 'linear-gradient(to right, var(--bg), color-mix(in srgb, var(--bg) 0%, transparent))',
      }"
    />
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-150"
      :style="{
        opacity: atEnd ? 0 : 1,
        background: 'linear-gradient(to left, var(--bg), color-mix(in srgb, var(--bg) 0%, transparent))',
      }"
    />
  </div>
</template>

<style scoped>
div::-webkit-scrollbar { display: none; }
</style>
