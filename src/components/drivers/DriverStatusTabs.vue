<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

// Горизонтальная лента-слайдер фильтра статуса — тот же паттерн, что SectionTabs
// на «Прогрессе»: активная вкладка жёлтая (--accent, активное состояние по
// DESIGN-STANDARD §3.5), скролл по X разрешён (контрол, не контент-свайп),
// по краям — градиент-маски-подсказки скрытого хвоста, гаснут на границе.
// Вкладки приходят из данных (['all', ...присутствующие статусы]).

const props = defineProps({
  modelValue: { type: String, required: true },
  // [{ id, label, count }]
  tabs: { type: Array, default: () => [] },
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
      aria-label="Фильтр по статусу"
      @scroll.passive="onScroll"
    >
      <button
        v-for="t in tabs"
        :key="t.id"
        :ref="(el) => (btns[t.id] = el)"
        type="button"
        role="tab"
        :aria-selected="modelValue === t.id"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 pb-[2px] text-[0.9375rem] font-medium transition-colors"
        :class="modelValue === t.id
          ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
          : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] active:bg-[var(--surface-2)]'"
        style="min-height: 44px"
        @click="$emit('update:modelValue', t.id)"
      >
        {{ t.label }}
        <!-- Счётчик — круглый бейдж, единый язык с шапками групп (DriverGroup).
             На неактивном чипе подложка --line (как в группах); на активном жёлтом
             --line выглядел бы грязно, поэтому лёгкий тон ink на самом акценте.
             Текст в обоих случаях монохромный (§3.5). -->
        <span
          v-if="t.count != null"
          class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-medium leading-none"
          :class="modelValue === t.id ? 'text-[var(--accent-ink)]' : 'bg-[var(--line)] text-[var(--text-secondary)]'"
          :style="modelValue === t.id
            ? { background: 'color-mix(in srgb, var(--accent-ink) 14%, transparent)' }
            : null"
        >{{ t.count }}</span>
      </button>
    </div>

    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-150"
      :style="{ opacity: atStart ? 0 : 1, background: 'linear-gradient(to right, var(--bg), color-mix(in srgb, var(--bg) 0%, transparent))' }"
    />
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-150"
      :style="{ opacity: atEnd ? 0 : 1, background: 'linear-gradient(to left, var(--bg), color-mix(in srgb, var(--bg) 0%, transparent))' }"
    />
  </div>
</template>

<style scoped>
div::-webkit-scrollbar { display: none; }
</style>
