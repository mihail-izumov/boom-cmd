<script setup>
import { computed, onActivated, onDeactivated, onMounted, reactive, watch } from 'vue'
import { useGoals } from '../composables/useGoals.js'
import { useParkContext } from '../composables/useParkContext.js'
import { useNavCaption } from '../composables/useNavCaption.js'
import { updatedDateLabel } from '../i18n/analytics.js'
import { L } from '../i18n/goals.js'
import GoalMonthSection from '../components/goals/GoalMonthSection.vue'

// Экран под-страницы «Цели и прогнозы» — лаунчер ссылок. 4 состояния
// (loading/error/empty/data). Парк-пилюля (parkFilter:true): парк → его материалы
// (scope=park); «Вся сеть» → сетевые (scope=network). Группировка — аккордеоны по
// месяцам (последний открыт). caption «данные от …» = updated.

const { data, loading, error, hint, reload } = useGoals()
const { current: parkCtx, isNetwork } = useParkContext()
const { setCaption, clearCaption } = useNavCaption()

const items = computed(() => data.value?.items || [])
const visible = computed(() =>
  isNetwork.value
    ? items.value.filter((i) => i.park === 'network')
    : items.value.filter((i) => i.park === parkCtx.value),
)
const months = computed(() => [...new Set(visible.value.map((i) => i.month))].sort().reverse())
const byMonth = computed(() => {
  const m = {}
  for (const it of visible.value) (m[it.month] = m[it.month] || []).push(it)
  for (const k in m) {
    m[k].sort((a, b) => (a.type || '').localeCompare(b.type || '', 'ru') || a.title.localeCompare(b.title, 'ru'))
  }
  return m
})

// аккордеоны: последний месяц открыт по умолчанию, состояние — на сессию
const openMap = reactive({})
watch(
  months,
  (ms) => { ms.forEach((mo, i) => { if (!(mo in openMap)) openMap[mo] = i === 0 }) },
  { immediate: true },
)
function toggle(mo) { openMap[mo] = !openMap[mo] }

// caption «данные от …» = updated (getLastUpdated таблицы)
const updatedLabel = computed(() => {
  const u = updatedDateLabel(data.value?.updated)
  return u ? `данные от ${u}` : ''
})
let isActive = false
function syncCaption() { if (isActive) setCaption(updatedLabel.value) }
onMounted(() => { isActive = true; syncCaption() })
onActivated(() => { isActive = true; syncCaption() })
onDeactivated(() => { isActive = false; clearCaption() })
watch(updatedLabel, () => syncCaption())
</script>

<template>
  <section class="flex flex-col gap-4 px-3 pb-6 pt-2">
    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-4" aria-busy="true" aria-label="Загрузка">
      <div v-for="i in 2" :key="i" class="flex flex-col gap-2">
        <div class="bc-skeleton h-4 w-32 rounded" />
        <div class="bc-skeleton h-16 rounded-2xl border border-[var(--line)]" />
      </div>
      <p class="px-1 text-[0.875rem] text-[var(--text-muted)]">Загрузка…</p>
    </div>

    <!-- error -->
    <div v-else-if="error" class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.error }}</p>
      <p v-if="hint" data-test="net-hint" class="text-[0.9375rem] font-medium text-[var(--text)]">{{ hint }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button type="button" class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90" style="min-height: 44px" @click="reload">{{ L.retry }}</button>
    </div>

    <!-- empty -->
    <div v-else-if="!visible.length" class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ isNetwork ? L.empty_network : L.empty_park }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ isNetwork ? L.empty_hint_network : L.empty_hint_park }}</p>
    </div>

    <!-- data -->
    <template v-else>
      <GoalMonthSection
        v-for="mo in months"
        :key="mo"
        class="bc-fade-in"
        :month="mo"
        :items="byMonth[mo]"
        :open="openMap[mo]"
        @toggle="toggle"
      />
    </template>
  </section>
</template>
