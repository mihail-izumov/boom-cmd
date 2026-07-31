<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, watchEffect } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useDaily } from '../composables/useDaily.js'
import { setSubView } from '../composables/useAppNav.js'
import { useParkContext } from '../composables/useParkContext.js'
import { useNavCaption } from '../composables/useNavCaption.js'
import { clearTrailing, setTrailing } from '../composables/useNavTrailing.js'
import { computeDaily, computeNetwork, monthsForPark, pickMonth, setForParkMonth } from '../composables/dailyModel.js'
import { updatedDateLabel } from '../i18n/analytics.js'
import { monthTitle, L } from '../i18n/daily.js'
import { PARKS } from '../data/parks.js'

import DailyDashboard from '../components/daily/DailyDashboard.vue'
import DailyNetwork from '../components/daily/DailyNetwork.vue'
import SummaryMonthPicker from '../components/daily/SummaryMonthPicker.vue'

// Экран под-страницы «Контроль дня». 4 состояния (loading/error/empty/data).
// Парк-контекст — глобальная пилюля (useParkContext): конкретный парк → дашборд,
// MARI → пустой стейт, «Вся сеть» → обзор 3 парков. Месяц по умолчанию — последний.
// Caption «данные от …» = updated (фолбэк — max дата полного дня); «сегодня» НЕ ставим.

const { data, loading, error, reload } = useDaily()
const { current: parkCtx, isNetwork } = useParkContext()
const { setCaption, clearCaption } = useNavCaption()

const sets = computed(() => data.value?.sets || {})
const hasAny = computed(() => Object.keys(sets.value).length > 0)

// парки, у которых есть дневной слой, в порядке справочника
const parkIdsWithDaily = computed(() =>
  PARKS.map((p) => p.id).filter((id) => Object.values(sets.value).some((s) => s.park === id)),
)

// ── МЕСЯЦ (ТЗ-6) ────────────────────────────────────────────────────────────
// Месяцы конкретного парка, по возрастанию (как отдаёт monthsForPark).
const parkMonths = computed(() =>
  isNetwork.value ? [] : monthsForPark(sets.value, parkCtx.value),
)
// Пикеру — новые сверху (как на Сводках).
const monthOptions = computed(() => [...parkMonths.value].reverse())

// Выбор пользователя. Живёт до смены парка: если в новом парке такого месяца нет,
// `month` сам падает на дефолт (проверка `includes` ниже), сбрасывать вручную нечего.
const picked = ref(null)

// Действующий месяц: выбор пользователя приоритетнее, иначе общее правило pickMonth
// (текущий календарный → последний не позже него → последний доступный).
// Управляющие вносят день ежедневно, поэтому «сейчас» обязано открываться само,
// а не оказываться на месяц назад или на пустом будущем.
const month = computed(() =>
  parkMonths.value.includes(picked.value) ? picked.value : pickMonth(parkMonths.value),
)

const currentSet = computed(() => {
  if (isNetwork.value || !month.value) return null
  return setForParkMonth(sets.value, parkCtx.value, month.value)
})

const model = computed(() => (currentSet.value ? computeDaily(currentSet.value) : null))
const net = computed(() => (isNetwork.value ? computeNetwork(sets.value, parkIdsWithDaily.value) : null))

const monthLabel = computed(() => (model.value ? monthTitle(model.value.month) : ''))

// парк выбран, но дневного слоя нет (например MARI)
const parkEmpty = computed(() => !isNetwork.value && hasAny.value && !currentSet.value)

// ── caption «данные от …» ──
function maxFullDate() {
  const scope = isNetwork.value ? Object.values(sets.value) : (currentSet.value ? [currentSet.value] : [])
  let mx = null
  for (const s of scope) for (const d of s.days || []) if (d.status === 'full' && (!mx || d.date > mx)) mx = d.date
  return mx
}
const updatedLabel = computed(() => {
  const upd = updatedDateLabel(data.value?.updated)
  if (upd) return `данные от ${upd}`
  const mx = updatedDateLabel(maxFullDate())
  return mx ? `данные от ${mx}` : ''
})

const active = ref(true)
let isActive = false
function syncCaption() { if (isActive) setCaption(updatedLabel.value) }
onMounted(() => { isActive = true; syncCaption() })
onActivated(() => { isActive = true; active.value = true; syncCaption() })
onDeactivated(() => { isActive = false; active.value = false; clearCaption(); clearTrailing() })
watch(updatedLabel, () => syncCaption())

// ── Пикер месяцев в правом верхнем углу шапки (ТЗ-6 §2.2) ───────────────────
// Слот общий на всю оболочку — освобождаем, когда экран уходит, иначе пикер
// «Контроля дня» останется висеть над чужим разделом.
// На «Всей сети» пикера НЕТ: сетевой обзор собирает по парку его собственный
// месяц (у отстающего парка последний закрытый может отличаться), и один общий
// селектор над ним означал бы месяц, которого у части парков нет.
// Один месяц у парка → пикер не показываем: кнопка без выбора.
onBeforeUnmount(clearTrailing)
watchEffect(() => {
  if (!active.value || isNetwork.value || monthOptions.value.length < 2) {
    clearTrailing()
    return
  }
  setTrailing(SummaryMonthPicker, {
    months: monthOptions.value,
    modelValue: month.value,
    'onUpdate:modelValue': (m) => { picked.value = m },
  })
})
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-1">
    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка">
      <div class="bc-skeleton h-28 rounded-2xl" />
      <div class="grid grid-cols-2 gap-2">
        <div v-for="i in 4" :key="i" class="bc-skeleton h-24 rounded-2xl" />
      </div>
      <div class="bc-skeleton h-40 rounded-2xl" />
      <p class="px-1 text-[0.875rem] text-[var(--text-muted)]">Загрузка…</p>
    </div>

    <!-- error -->
    <div v-else-if="error" class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">Не удалось загрузить дневной слой</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button type="button" class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90" style="min-height: 44px" @click="reload">Повторить</button>
    </div>

    <!-- нет данных вообще -->
    <div v-else-if="!hasAny" class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">Дневного слоя пока нет</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">Данные появятся, когда контур загрузит выручку по дням.</p>
    </div>

    <!-- парк без дневного слоя (MARI) -->
    <div v-else-if="parkEmpty" class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty_park }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_park_hint }}</p>
    </div>

    <!-- «Вся сеть» -->
    <template v-else-if="isNetwork && net">
      <DailyNetwork :net="net" class="bc-fade-in" />
    </template>

    <!-- конкретный парк -->
    <template v-else-if="model">
      <p class="bc-fade-in px-1 text-[0.8125rem] capitalize text-[var(--text-muted)]">{{ monthLabel }}</p>
      <DailyDashboard :m="model" :reads="data?.signal_reads || []" class="bc-fade-in" />
    </template>

    <!-- «Отчёт дня» (D-12): вход в единственную пишущую страницу.
         Показываем всегда (кроме загрузки) — форма не зависит от дневного слоя. -->
    <button
      v-if="!loading"
      type="button"
      class="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--surface)] shadow-sm transition-opacity active:opacity-90"
      @click="setSubView('daily-report')"
    >
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)]">
        <Plus class="h-[18px] w-[18px] text-[var(--accent-ink)]" :stroke-width="2.5" aria-hidden="true" />
      </span>
      <span class="text-[1rem] font-semibold text-[var(--text)]">Добавить отчёт</span>
    </button>
  </section>
</template>
