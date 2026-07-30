<script setup>
import { computed, ref } from 'vue'
import { useDaily } from '../../composables/useDaily.js'
import {
  joinDrivers,
  parkOptions,
  visibleDrivers,
  parkCounts,
  statusCounts,
} from '../../composables/driversModel.js'
import {
  STATUS_FILTER_ORDER,
  STATUS_LABEL,
  parkLabel,
  L,
} from '../../i18n/drivers.js'
import DriverCard from './DriverCard.vue'

// Раздел «Драйверы роста». Данные — из дневного пейлоада (useDaily): верхнеуровневые
// drivers + driver_periods. Два ряда чипов-фильтров (парк, статус) — по образцу
// «Задач» (тач-таргет ≥44pt, монохром, активный = заливка --text). Нет драйверов →
// секция не рендерится вовсе (гейт приёмки: пустые вкладки → раздел скрыт).
//
// Секция самодостаточна (сама читает useDaily, как HomeScreen) — drop-in в любой
// экран/под-страницу: <DriversSection />. Если удобнее прокидывать данные сверху —
// замените useDaily здесь на props { drivers, periods }.

const { data } = useDaily()

const joined = computed(() =>
  joinDrivers(data.value && data.value.drivers, data.value && data.value.driver_periods),
)
const parkIds = computed(() => parkOptions(joined.value))
const pCounts = computed(() => parkCounts(joined.value, parkIds.value))
const sCounts = computed(() => statusCounts(joined.value))

const fPark = ref('all')
const fStatus = ref('all')

const parkChips = computed(() => [
  { val: 'all', label: L.all, count: pCounts.value.all },
  ...parkIds.value.map((id) => ({ val: id, label: parkLabel(id), count: pCounts.value[id] })),
])
const statusChips = computed(() => [
  { val: 'all', label: L.all, count: sCounts.value.all },
  ...STATUS_FILTER_ORDER.filter((s) => sCounts.value[s] > 0).map((s) => ({
    val: s,
    label: STATUS_LABEL[s],
    count: sCounts.value[s],
  })),
])

const list = computed(() => visibleDrivers(joined.value, fPark.value, fStatus.value))
</script>

<template>
  <section v-if="joined.length" class="flex flex-col gap-3 px-3 pb-6 pt-2">
    <!-- Крупный заголовок раздела рисует оболочка (NavigationBar, large-title-collapse),
         здесь — только поясняющая строка: раздел про «что подключено», не «что сработало». -->
    <p class="text-[0.8125rem] leading-snug text-[var(--text-muted)]">{{ L.subtitle }}</p>

    <!-- фильтры: два ряда чипов со счётчиками (тач ≥44pt) -->
    <div class="flex flex-col gap-2">
      <div class="flex flex-col gap-1.5">
        <span class="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ L.filter_park }}</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in parkChips"
            :key="'park-' + c.val"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-4 text-[0.8125rem] font-medium transition-colors"
            style="min-height: 44px"
            :class="fPark === c.val
              ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]'
              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] active:bg-[var(--surface-2)]'"
            :aria-pressed="fPark === c.val"
            @click="fPark = c.val"
          >
            {{ c.label }}
            <span class="text-[0.6875rem]" :class="fPark === c.val ? 'opacity-70' : 'text-[var(--text-muted)]'">{{ c.count }}</span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ L.filter_status }}</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in statusChips"
            :key="'st-' + c.val"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border px-4 text-[0.8125rem] font-medium transition-colors"
            style="min-height: 44px"
            :class="fStatus === c.val
              ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]'
              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)] active:bg-[var(--surface-2)]'"
            :aria-pressed="fStatus === c.val"
            @click="fStatus = c.val"
          >
            {{ c.label }}
            <span class="text-[0.6875rem]" :class="fStatus === c.val ? 'opacity-70' : 'text-[var(--text-muted)]'">{{ c.count }}</span>
          </button>
        </div>
      </div>
    </div>

    <p class="text-[0.75rem] text-[var(--text-muted)]">{{ L.count(list.length, joined.length) }}</p>

    <div v-if="list.length" class="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
      <DriverCard v-for="d in list" :key="d.code" :driver="d" :park-ids="parkIds" />
    </div>
    <p v-else class="py-11 text-center text-[0.875rem] text-[var(--text-muted)]">{{ L.empty_filters }}</p>
  </section>
</template>
