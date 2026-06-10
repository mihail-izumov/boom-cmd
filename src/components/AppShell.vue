<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import NavigationBar from './NavigationBar.vue'
import TabBar from './TabBar.vue'

// Оболочка приложения.
// Принимает таб-бар-конфиг (tabs[]), активную вкладку (active) и опциональную
// под-страницу (subView + subViews). Под-страница имеет приоритет над вкладкой.
//
// TZ-3.2: возврат механики Ф1 — `collapsed` + `@scroll` (порог 28px).
// При смене активного экрана (вкладка или под-страница) скролл возвращается
// к верху и large-title снова раскрывается.

const props = defineProps({
  tabs: { type: Array, required: true },
  active: { type: String, required: true },
  subView: { type: String, default: null },
  subViews: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:active', 'back'])

const activeTab = computed(
  () => props.tabs.find((t) => t.id === props.active) ?? props.tabs[0],
)

const current = computed(() => {
  if (props.subView && props.subViews[props.subView]) {
    return { ...props.subViews[props.subView], _isSub: true }
  }
  return activeTab.value
})

const scrollEl = ref(null)
const collapsed = ref(false)
const COLLAPSE_AT = 28 // px прокрутки, после которых large title сворачивается

function onScroll(e) {
  collapsed.value = e.target.scrollTop > COLLAPSE_AT
}

watch(
  () => [props.active, props.subView],
  async () => {
    await nextTick()
    if (scrollEl.value) scrollEl.value.scrollTop = 0
    collapsed.value = false
  },
)
</script>

<template>
  <div
    class="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[var(--bg)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:border-x md:border-[var(--line)]"
  >
    <!-- Скролл-область: navigation bar (large title + пилюля в потоке) + экран -->
    <div
      ref="scrollEl"
      class="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      @scroll="onScroll"
    >
      <NavigationBar
        :title="current.title"
        :collapsed="collapsed"
        :show-back="!!current.showBack"
        :back-label="current.backLabel || ''"
        :park-filter="!!current.parkFilter"
        @back="emit('back')"
      />
      <component :is="current.screen" />
    </div>

    <!-- Tab bar: фиксирован под скроллом, не уезжает со страницей -->
    <TabBar :tabs="tabs" :active="active" @select="(id) => emit('update:active', id)" />
  </div>
</template>
