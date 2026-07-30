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

// Раздел «Драйверы роста» — контролы ОДИН В ОДИН как в «Задачах»:
//   • ПАРК — пилюля в шапке + bottom-sheet «Выбрать парк». Свои контролы раздел НЕ
//     заводит: `parkFilter: true` у под-страницы в App.vue, оболочка рисует те же
//     ParkFilterPill + ParkPickerSheet, что и на «Задачах»; scope читаем из общего
//     useParkContext.
//   • СПИСОК — сворачиваемые группы по статусу, ПО ДЕФОЛТУ СВЁРНУТЫ (DriverGroup =
//     паттерн ProjectSection: шеврон + подпись + круглый бейдж-счётчик).
//   • СТАТУС — горизонтальный слайдер-лента (как домены «Прогресса»).
//
// Логика §0.1: выбран парк → только драйверы с периодом в нём (matches);
// незапущенные видны лишь во «Всей сети». MARI драйверов не имеет — при его выборе
// раздел честно покажет пустой стейт по scope.

const { data, loading, error, reload } = useDaily()
const { isNetwork, current: parkCtx, currentName } = useParkContext()

const joined = computed(() =>
  joinDrivers(data.value && data.value.drivers, data.value && data.value.driver_periods),
)
// Набор парков для строк карточки — три действующих СПб (§0.1 п.2).
const parkIds = computed(() => parkOptions())

// Парк-скоуп из общего контекста: «Вся сеть» → все; парк → только с периодом в нём.
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
// Выбранный статус пропал из скоупа (сменили парк) → вернуться на «Все».
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

// Сворачивание: ПО ДЕФОЛТУ ВСЁ СВЁРНУТО (как STATUS_DEFAULT_OPEN в «Задачах»).
// Выбрал конкретный статус слайдером — его группа раскрыта (искать нечего).
const openMap = reactive({})
const toggle = (s) => (openMap[s] = !openMap[s])
const isOpen = (s) => (fStatus.value !== 'all' ? true : !!openMap[s])
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-2">
    <!-- loading: skeleton (та же shimmer-«молния», что во всех разделах) -->
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка">
      <div class="bc-skeleton mx-auto h-4 w-2/3 rounded" />
      <div class="bc-skeleton h-11 rounded-full" />
      <div v-for="i in 4" :key="i" class="bc-skeleton h-11 rounded-xl" />
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

    <!-- empty по scope: под выбранный парк драйверов нет (как в «Задачах») -->
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
      <!-- лид по центру (крупный заголовок и пилюлю парка рисует оболочка) -->
      <p class="bc-fade-in px-4 text-center text-[1rem] leading-snug text-[var(--text-muted)]">{{ L.subtitle }}</p>

      <!-- статус — слайдер-лента -->
      <DriverStatusTabs v-model="fStatus" :tabs="statusTabs" class="bc-fade-in" />

      <p class="bc-fade-in px-1 text-[0.8125rem] text-[var(--text-muted)]">{{ L.total(total) }}</p>

      <!-- сворачиваемые группы по статусу, по дефолту свёрнуты (как «Задачи») -->
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
