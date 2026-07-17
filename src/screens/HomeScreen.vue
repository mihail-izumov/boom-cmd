<script setup>
import { computed } from 'vue'
import { ChartColumnBig, ExternalLink, Folder, Gauge, Layers, Target } from 'lucide-vue-next'
import HomeWidget from '../components/home/HomeWidget.vue'
import InstallPwaBanner from '../components/home/InstallPwaBanner.vue'
import { useDaily } from '../composables/useDaily.js'
import { computeNetwork } from '../composables/dailyModel.js'
import { PARKS } from '../data/parks.js'
import { setActive, setSubView } from '../composables/useAppNav.js'
import { mlnNum, mlnSigned, pct1, pctWhole, monthCap, L } from '../i18n/home.js'

// Home — командная дека. Сверху два ВИДЖЕТА (два столбца, белые карты, без стрелок
// входа): «Контроль Дня» (План/Факт % + серая стрелка тренда + Накопленный хвост млн
// со знаком) и «Цели и планы» (Прогноз выручки млн + Текущий темп %). Над ними — строка
// «Июль 2026: <парки>» (какие парки в данных, не вся сеть). Ниже — карта-сетка из трёх
// серых плиток-приложений (Аналитика/Проекты/Материалы). Внизу — графитовая ссылка
// b00m.fun. Бейдж «БУМБАСТИК» рендерит NavigationBar (eyebrow над «Мастерплан»).
//
// Данные виджетов — сетевой агрегат computeNetwork из daily-пейлоада (те же числа, что
// в «Контроль дня»): onPlanAvg (План/Факт), tailCumSum (хвост), landing (прогноз),
// landDev (темп = landing/цель). Нет данных → «—», строка тегов скрыта. Read-only.

const { data } = useDaily()
const sets = computed(() => data.value?.sets || {})
const parkIdsWithDaily = computed(() =>
  PARKS.map((p) => p.id).filter((id) => Object.values(sets.value).some((s) => s.park === id)),
)
const net = computed(() => computeNetwork(sets.value, parkIdsWithDaily.value))
const t = computed(() => net.value.totals)
const hasData = computed(() => net.value.cards.length > 0 && t.value.target > 0)

const parkNames = computed(() => net.value.cards.map((c) => c.parkName).filter(Boolean))
const monthLabel = computed(() => (t.value.month ? monthCap(t.value.month) : ''))

const planFact = computed(() => (hasData.value ? pctWhole(t.value.onPlanAvg) : '—'))
const planFactTrend = computed(() => {
  if (!hasData.value || t.value.onPlanAvg == null) return null
  return t.value.onPlanAvg >= 1 ? 'up' : 'down'
})
const tail = computed(() => (hasData.value ? mlnSigned(t.value.tailCumSum) : '—'))
const forecastMain = computed(() => (hasData.value ? `₽ ${mlnNum(t.value.landing)}` : '—'))
const pace = computed(() => (hasData.value ? pct1(1 + t.value.landDev) : '—'))

function goDaily() { setSubView('daily') }
function goGoals() { setSubView('goals') }
function goAnalytics() { setActive('analytics') }
function goProjects() { setActive('projects') }
function goMaterials() { setActive('materials') }
</script>

<template>
  <section class="flex flex-col px-4 pb-6 pt-0">
    <!-- Июль 2026: + парки в данных (не вся сеть); не кликабельно, одна строка -->
    <div v-if="hasData && parkNames.length" class="mb-3 flex flex-nowrap items-center gap-[7px]">
      <span class="shrink-0 text-[0.75rem] font-bold text-[var(--text-secondary)]">{{ monthLabel }}:</span>
      <span
        v-for="p in parkNames"
        :key="p"
        class="shrink-0 whitespace-nowrap rounded-full border border-[var(--line)] px-[9px] py-[3px] text-[0.6875rem] font-semibold text-[var(--text-muted)]"
      >{{ p }}</span>
    </div>

    <!-- два виджета -->
    <div class="flex gap-3">
      <HomeWidget
        class="flex-1"
        :icon="Gauge"
        :name="L.daily"
        :metric-label="L.planfact"
        :value-main="planFact"
        :trend="planFactTrend"
        :sub-label="L.tail"
        :sub-value="tail"
        @select="goDaily"
      />
      <HomeWidget
        class="flex-1"
        :icon="Target"
        :name="L.goals"
        :metric-label="L.forecast"
        :value-main="forecastMain"
        :value-unit="hasData ? 'млн' : ''"
        :sub-label="L.pace"
        :sub-value="pace"
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

    <!-- графитовая ссылка: ширина карты, адрес по центру, иконка сразу за адресом -->
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
