<script setup>
import { computed } from 'vue'
import { ChartColumnBig, ExternalLink, Folder, Gauge, Layers, Target } from 'lucide-vue-next'
import HomeWidget from '../components/home/HomeWidget.vue'
import InstallPwaBanner from '../components/home/InstallPwaBanner.vue'
import { useDaily } from '../composables/useDaily.js'
import { computeNetwork } from '../composables/dailyModel.js'
import { PARKS, PARKS_BY_ID } from '../data/parks.js'
import { setActive, setSubView } from '../composables/useAppNav.js'
import { mlnRub, mlnSigned, pctDelta, pctWhole, monthCap, L } from '../i18n/home.js'

// Home — командная дека. Два ВИДЖЕТА (два столбца): «Контроль Дня» (План/Факт %,
// серая стрелка тренда, Накопленный хвост млн со знаком) и «Цели и планы» (Прогноз
// выручки млн, Текущий темп %). Над ними — «<Месяц Год>: <парки>» (какие парки в
// данных). Ниже — карта-сетка из трёх серых плиток. Внизу — графитовая ссылка b00m.fun.
// Данные — сетевой агрегат computeNetwork из daily-пейлоада. Пока грузится — переливы
// (bc-skeleton) вместо значений; имена парков — с фолбэком на справочник parks.js.

const NM_DAILY = 'Контроль\nДня'
const NM_GOALS = 'Цели и\nпланы'

const { data, loading } = useDaily()
const sets = computed(() => data.value?.sets || {})
const parkIdsWithDaily = computed(() =>
  PARKS.map((p) => p.id).filter((id) => Object.values(sets.value).some((s) => s.park === id)),
)
const net = computed(() => computeNetwork(sets.value, parkIdsWithDaily.value))
const t = computed(() => net.value.totals)
const ready = computed(() => net.value.cards.length > 0)

const parkNames = computed(() =>
  net.value.cards.map((c) => c.parkName || PARKS_BY_ID[c.park]?.name).filter(Boolean),
)
const monthLabel = computed(() => (t.value.month ? monthCap(t.value.month) : ''))

const planFact = computed(() => (ready.value ? pctWhole(t.value.onPlanAvg) : '—'))
const planFactTrend = computed(() => (ready.value ? t.value.trendPlanFact || null : null))
const tail = computed(() => (ready.value ? mlnSigned(-t.value.tailCumSum) : '—'))
const pace = computed(() => (ready.value ? pctDelta(t.value.landDev) : '—'))
const forecastTrend = computed(() => (ready.value ? t.value.trendForecast || null : null))
const forecastSub = computed(() => (ready.value ? mlnRub(t.value.landing) : '—'))

function goDaily() { setSubView('daily') }
function goGoals() { setSubView('goals') }
function goAnalytics() { setActive('analytics') }
function goProjects() { setActive('projects') }
function goMaterials() { setActive('materials') }
</script>

<template>
  <section class="flex flex-col px-4 pb-6 pt-0">
    <!-- <Месяц Год>: парки в данных. Пока грузится — переливы. -->
    <div v-if="loading || (ready && parkNames.length)" class="mb-3 flex flex-nowrap items-center justify-center gap-[7px]">
      <template v-if="loading">
        <span class="bc-skeleton h-[15px] w-[78px] shrink-0 rounded"></span>
        <span class="bc-skeleton h-[22px] w-[74px] shrink-0 rounded-full"></span>
        <span class="bc-skeleton h-[22px] w-[74px] shrink-0 rounded-full"></span>
      </template>
      <template v-else>
        <span class="shrink-0 text-[0.75rem] font-bold text-[var(--text-secondary)]">{{ monthLabel }}:</span>
        <span
          v-for="p in parkNames"
          :key="p"
          class="shrink-0 whitespace-nowrap rounded-full border border-[var(--line)] px-[9px] py-[3px] text-[0.6875rem] font-semibold text-[var(--text-muted)]"
        >{{ p }}</span>
      </template>
    </div>

    <!-- два виджета -->
    <div class="flex gap-3">
      <HomeWidget
        class="flex-1"
        :icon="Gauge"
        :name="NM_DAILY"
        :metric-label="L.planfact"
        :value-main="planFact"
        :trend="planFactTrend"
        :sub-label="L.tail"
        :sub-value="tail"
        :loading="loading"
        @select="goDaily"
      />
      <HomeWidget
        class="flex-1"
        :icon="Target"
        :name="NM_GOALS"
        :metric-label="L.pace"
        :value-main="pace"
        :trend="forecastTrend"
        :sub-label="L.forecast"
        :sub-value="forecastSub"
        :loading="loading"
        @select="goGoals"
      />
    </div>

    <!-- карта-сетка: три серые плитки-приложения -->
    <div class="mt-3.5 rounded-[22px] bg-[var(--surface)] px-2.5 pb-3.5 pt-[18px] shadow-sm">
      <div class="flex justify-around">
        <button type="button" class="flex w-[92px] flex-col items-center gap-2.5" @click="goAnalytics">
          <span class="flex h-[66px] w-[66px] items-center justify-center rounded-[18px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><ChartColumnBig class="h-[30px] w-[30px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="text-[0.84rem] font-medium text-[var(--text)]">Аналитика</span>
        </button>
        <button type="button" class="flex w-[92px] flex-col items-center gap-2.5" @click="goProjects">
          <span class="flex h-[66px] w-[66px] items-center justify-center rounded-[18px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><Layers class="h-[30px] w-[30px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="text-[0.84rem] font-medium text-[var(--text)]">Проекты</span>
        </button>
        <button type="button" class="flex w-[92px] flex-col items-center gap-2.5" @click="goMaterials">
          <span class="flex h-[66px] w-[66px] items-center justify-center rounded-[18px] bg-[var(--surface-2)] text-[var(--text-secondary)]"><Folder class="h-[30px] w-[30px]" :stroke-width="2" aria-hidden="true" /></span>
          <span class="text-[0.84rem] font-medium text-[var(--text)]">Материалы</span>
        </button>
      </div>
    </div>

    <!-- графитовая ссылка -->
    <a
      href="https://b00m.fun"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-3.5 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[var(--graphite)] text-[var(--ink-on-color)] transition-opacity active:opacity-90"
    >
      <span class="text-[1rem] font-semibold">b00m.fun</span>
      <ExternalLink class="h-[18px] w-[18px]" :stroke-width="2" aria-hidden="true" />
    </a>

    <InstallPwaBanner />
  </section>
</template>
