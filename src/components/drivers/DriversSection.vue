<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useDaily } from '../../composables/useDaily.js'
import { useParkContext } from '../../composables/useParkContext.js'
import {
  joinDrivers,
  parkOptions,
  matches,
  statusOptions,
  statusCounts,
} from '../../composables/driversModel.js'
import { statusLabel, L } from '../../i18n/drivers.js'
import DriverStatusTabs from './DriverStatusTabs.vue'
import DriverGroup from './DriverGroup.vue'

// Раздел «Драйверы роста» — приведён к паттернам приложения:
//   • ПАРК — глобальная выпадающая пилюля в шапке (useParkContext, как «Задачи»);
//     секция не рендерит свой парк-контрол (parkFilter:true у под-страницы в App.vue).
//   • СТАТУС — горизонтальный слайдер-лента (DriverStatusTabs, как домены «Прогресса»).
//   • СПИСОК — сворачиваемые группы по статусу с кружком-счётчиком (DriverGroup, как
//     статус-группы «Задач»), по дефолту свёрнуты.
//
// ЧЕТЫРЕ СОСТОЯНИЯ (loading/error/empty/data): раздел — под-страница со своей плиткой,
// useDaily не синглтон (fetch на каждом открытии), поэтому «скрыть всё» давало бы
// пустой экран. error и empty разведены (не путаем «пусто» с «не загрузилось»).

const { data, loading, error, reload } = useDaily()
const { current: parkCtx, isNetwork, currentName } = useParkContext()

const joined = computed(() =>
  joinDrivers(data.value && data.value.drivers, data.value && data.value.driver_periods),
)
// Набор парков для строк карточки — из всех данных (не зависит от выбранного парка).
const parkIds = computed(() => parkOptions(joined.value))

// Парк-скоуп из глобального контекста: «Вся сеть» → все драйверы; парк → запущенные
// в этом парке + незапущенные (они потенциально сетевые). Логика — в matches().
const parkScope = computed(() => (isNetwork.value ? 'all' : parkCtx.value))
const scoped = computed(() => joined.value.filter((d) => matches(d, parkScope.value, 'all')))

const total = computed(() => scoped.value.length)
const present = computed(() => statusOptions(scoped.value))
const sCounts = computed(() => statusCounts(scoped.value))

const statusTabs = computed(() => [
  { id: 'all', label: L.all, count: scoped.value.length },
  ...present.value.map((s) => ({ id: s, label: statusLabel(s), count: sCounts.value[s] })),
])

const fStatus = ref('all')
// Если выбранный статус пропал из скоупа (сменили парк) — вернуться на «Все».
watch([present, fStatus], () => {
  if (fStatus.value !== 'all' && !present.value.includes(fStatus.value)) fStatus.value = 'all'
})

// Группировка по статусу (внутри — по коду).
const grouped = computed(() => {
  const m = {}
  for (const s of present.value) m[s] = []
  for (const d of scoped.value) (m[d.status] || (m[d.status] = [])).push(d)
  for (const s in m) m[s].sort((a, b) => String(a.code).localeCompare(String(b.code)))
  return m
})
const visibleStatuses = computed(() =>
  fStatus.value === 'all' ? present.value : present.value.filter((s) => s === fStatus.value),
)

// Сворачивание: по дефолту всё свёрнуто (как «Задачи»). При выборе конкретного
// статуса слайдером его группа раскрыта — искать нечего, показываем сразу.
const openMap = reactive({})
const toggle = (s) => (openMap[s] = !openMap[s])
const isOpen = (s) => (fStatus.value !== 'all' ? true : !!openMap[s])
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-2">
    <!-- loading: skeleton по форме карточки (та же shimmer-«молния», что везде) -->
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка">
      <div class="bc-skeleton mx-auto h-4 w-2/3 rounded" />
      <div class="bc-skeleton h-11 rounded-full" />
      <div v-for="i in 3" :key="i" class="flex flex-col gap-2.5 rounded-2xl border border-[var(--line)] p-4">
        <div class="flex items-center justify-between">
          <div class="bc-skeleton h-3 w-14 rounded" />
          <div class="bc-skeleton h-5 w-20 rounded-full" />
        </div>
        <div class="bc-skeleton h-4 w-[75%] rounded" />
        <div class="bc-skeleton h-3 w-[90%] rounded" />
      </div>
      <p class="px-1 text-[0.875rem] text-[var(--text-muted)]">{{ L.loading }}</p>
    </div>

    <!-- error -->
    <div
      v-else-if="error"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.error_title }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >{{ L.retry }}</button>
    </div>

    <!-- empty: источника нет вовсе (ни одного драйвера в пейлоаде) -->
    <div
      v-else-if="!joined.length"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty_title }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_hint }}</p>
    </div>

    <!-- empty по scope: драйверы есть, но не под выбранный парк -->
    <div
      v-else-if="!scoped.length"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">
        {{ isNetwork ? L.empty_scope_network : L.empty_scope_park(currentName) }}
      </p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_scope_hint }}</p>
    </div>

    <!-- data -->
    <template v-else>
      <!-- лид по центру, как на «Трендах» (крупный заголовок рисует оболочка) -->
      <p class="bc-fade-in px-4 text-center text-[1rem] leading-snug text-[var(--text-muted)]">{{ L.subtitle }}</p>

      <!-- слайдер статусов -->
      <DriverStatusTabs v-model="fStatus" :tabs="statusTabs" class="bc-fade-in" />

      <p class="bc-fade-in px-1 text-[0.8125rem] text-[var(--text-muted)]">{{ L.total(total) }}</p>

      <!-- сворачиваемые группы по статусу -->
      <DriverGroup
        v-for="s in visibleStatuses"
        :key="s"
        class="bc-fade-in"
        :status="s"
        :drivers="grouped[s]"
        :park-ids="parkIds"
        :open="isOpen(s)"
        @toggle="toggle"
      />
    </template>
  </section>
</template>
