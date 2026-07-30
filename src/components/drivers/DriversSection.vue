<script setup>
import { computed, ref, watch } from 'vue'
import { useDaily } from '../../composables/useDaily.js'
import {
  joinDrivers,
  parkOptions,
  matches,
  visibleDrivers,
  parkCounts,
  statusCounts,
  statusOptions,
} from '../../composables/driversModel.js'
import { statusLabel, parkLabel, L } from '../../i18n/drivers.js'
import DriverCard from './DriverCard.vue'
import DriverParkSelect from './DriverParkSelect.vue'
import DriverStatusTabs from './DriverStatusTabs.vue'

// Раздел «Драйверы роста» — по §3 задания и песочнице: ДВА ряда чипов-фильтров
// (Парк · Статус) + плоский список карточек в одну колонку, сортировка по статусу.
// Чипы и тач-таргеты ≥44pt — по образцу «Задач», не из sizing песочницы.
//
// Парк — ЛОКАЛЬНЫЙ фильтр по трём действующим СПб (Охта/Питерленд/Июнь), БЕЗ MARI и
// БЕЗ глобальной пилюли (§0.1 п.2/п.4: «Вся сеть» = 3 СПб, не все парки приложения).
// Выбран парк → только драйверы с периодом в нём; незапущенные видны лишь во «Всей
// сети» (§0.1 п.1 — логика в driversModel.matches/parkCounts).
//
// ЧЕТЫРЕ СОСТОЯНИЯ (loading/error/empty/data): раздел — под-страница со своей плиткой,
// useDaily не синглтон (fetch на каждом открытии), «скрыть всё» дало бы пустой экран.

const { data, loading, error, reload } = useDaily()

const joined = computed(() => joinDrivers(data.value && data.value.drivers, data.value && data.value.driver_periods))
const parkIds = computed(() => parkOptions()) // три фиксированных СПб

const fPark = ref('all')
const fStatus = ref('all')

// Набор под текущим парком (все статусы) — для «Всего N» и счётчиков статуса.
const scoped = computed(() => joined.value.filter((d) => matches(d, fPark.value, 'all')))
const total = computed(() => scoped.value.length)

// Выпадающий список «Парк»: Вся сеть + три СПб. Счётчик парка — драйверы с периодом
// в нём; «Вся сеть» — все.
const pCounts = computed(() => parkCounts(joined.value, parkIds.value))
const parkOpts = computed(() => [
  { val: 'all', label: L.network, count: joined.value.length },
  ...parkIds.value.map((id) => ({ val: id, label: parkLabel(id), count: pCounts.value[id] })),
])

// Слайдер «Статус»: из статусов, присутствующих под текущим парком; таб с 0 скрыт.
const sCounts = computed(() => statusCounts(scoped.value))
const statusTabs = computed(() => [
  { id: 'all', label: L.all, count: scoped.value.length },
  ...statusOptions(scoped.value).map((s) => ({ id: s, label: statusLabel(s), count: sCounts.value[s] })),
])
// Выбранный статус пропал из скоупа (сменили парк) → вернуться на «Все».
watch([scoped, fStatus], () => {
  if (fStatus.value !== 'all' && !statusOptions(scoped.value).includes(fStatus.value)) fStatus.value = 'all'
})

const list = computed(() => visibleDrivers(joined.value, fPark.value, fStatus.value))
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

    <!-- empty: ни одного драйвера в пейлоаде -->
    <div
      v-else-if="!joined.length"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty_title }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_hint }}</p>
    </div>

    <!-- data -->
    <template v-else>
      <!-- лид по центру, как на «Трендах» (крупный заголовок рисует оболочка) -->
      <p class="bc-fade-in px-4 text-center text-[1rem] leading-snug text-[var(--text-muted)]">{{ L.subtitle }}</p>

      <!-- фильтры без подписей: парк — выпадающий список (по центру), статус — слайдер -->
      <DriverParkSelect v-model="fPark" :options="parkOpts" class="bc-fade-in" />
      <DriverStatusTabs v-model="fStatus" :tabs="statusTabs" class="bc-fade-in" />

      <p class="bc-fade-in px-1 text-[0.8125rem] text-[var(--text-muted)]">{{ L.total(total) }}</p>

      <!-- плоский список карточек в одну колонку, сортировка по статусу -->
      <div v-if="list.length" class="bc-fade-in flex flex-col gap-3">
        <DriverCard v-for="d in list" :key="d.code" :driver="d" :park-ids="parkIds" />
      </div>
      <p v-else class="py-11 text-center text-[0.875rem] text-[var(--text-muted)]">{{ L.empty_filters }}</p>
    </template>
  </section>
</template>
