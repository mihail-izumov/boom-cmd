<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import NavigationBar from './NavigationBar.vue'
import TabBar from './TabBar.vue'
import ParkSelector from './navigation/ParkSelector.vue'

const props = defineProps({
  tabs: { type: Array, required: true },
  active: { type: String, required: true },
})
const emit = defineEmits(['update:active'])

const current = computed(
  () => props.tabs.find((t) => t.id === props.active) ?? props.tabs[0],
)

const scrollEl = ref(null)
const collapsed = ref(false)
const COLLAPSE_AT = 28 // px прокрутки, после которых large title сворачивается

function onScroll(e) {
  collapsed.value = e.target.scrollTop > COLLAPSE_AT
}

// смена вкладки: вернуть скролл к верху, снова раскрыть large title
watch(
  () => props.active,
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
    <!-- Скролл-область: navigation bar (large title в потоке) + экран -->
    <div
      ref="scrollEl"
      class="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
      @scroll="onScroll"
    >
      <NavigationBar :title="current.title" :collapsed="collapsed">
        <template #trailing="{ collapsed: isCollapsed }">
          <ParkSelector :compact="isCollapsed" />
        </template>
      </NavigationBar>
      <component :is="current.screen" />
    </div>

    <!-- Tab bar: фиксирован под скроллом, не уезжает со страницей -->
    <TabBar :tabs="tabs" :active="active" @select="(id) => emit('update:active', id)" />
  </div>
</template>
