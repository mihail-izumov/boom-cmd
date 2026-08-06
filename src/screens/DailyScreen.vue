<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch, watchEffect } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useDaily } from '../composables/useDaily.js'
import { setSubView } from '../composables/useAppNav.js'
import { useParkContext } from '../composables/useParkContext.js'
import { useNavCaption } from '../composables/useNavCaption.js'
import { clearTrailing, setTrailing } from '../composables/useNavTrailing.js'
import { computeDaily, computeNetwork, monthsForPicker, pickMonth, setForParkMonth } from '../composables/dailyModel.js'
import { joinDrivers, matches, statusCounts, statusOptions } from '../composables/driversModel.js'
import { statusLabel } from '../i18n/drivers.js'
import { collectSignals } from '../composables/dailySignals.js'
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

const { data, loading, error, hint, reload } = useDaily()
const { current: parkCtx, isNetwork } = useParkContext()
const { setCaption, clearCaption } = useNavCaption()

const sets = computed(() => data.value?.sets || {})
const hasAny = computed(() => Object.keys(sets.value).length > 0)

// парки, у которых есть дневной слой, в порядке справочника
const parkIdsWithDaily = computed(() =>
  PARKS.map((p) => p.id).filter((id) => Object.values(sets.value).some((s) => s.park === id)),
)

// ── МЕСЯЦ (ТЗ-6) ────────────────────────────────────────────────────────────
// Месяцы конкретного парка, по возрастанию. НЕ все, что есть в данных: только с
// планом и не раньше DAILY_FIRST_MONTH (решение владельца 31.07 — «июль и далее
// каждый следующий, для которого есть план»). Апрель–июнь лежат в данных
// полными, но это база для калибровки коэффициентов, а не месяцы контроля.
const parkMonths = computed(() =>
  isNetwork.value ? [] : monthsForPicker(sets.value, parkCtx.value),
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

// Пул сигналов для карточки (Ф-7). Собирается СКВОЗЬ границу месяца: окно отметки
// (14 дней) + весь выбранный в пикере месяц. Раньше карточка жила внутри одного
// набора парк:месяц — и 01.08 сигнал за 31.07 исчезал из ленты вместе с
// возможностью его отметить. Это давало дыры на каждом переходе месяца.
const signalPool = computed(() =>
  isNetwork.value ? [] : collectSignals(sets.value, parkCtx.value, month.value),
)

const monthLabel = computed(() => (model.value ? monthTitle(model.value.month) : ''))

// ── Строка-сводка драйверов → раздел «Драйверы роста» (задание 06.08 §3.3) ──
// Чип парка в разделе предвыбран сам: он читает ОБЩИЙ `useParkContext`, а мы уходим
// с дашборда конкретного парка — то есть контекст уже стоит на нужном парке.
// Отдельного «предвыбора» здесь нет намеренно: второй источник истины по парку
// разъехался бы с пилюлей в шапке при первом же возврате.
// `origin` — чтобы кнопка «Назад» вернула в «Контроль дня», а не на Главную:
// экран под keep-alive, поэтому раскрытые недели и выбранный месяц переживут переход.
function openDrivers() {
  setSubView('drivers', { to: 'daily', label: L.title })
}

// Чипы статусов под кнопкой — правка владельца 06.08 «взять из раздела».
// Считаем ТЕМ ЖЕ driversModel и по тому же правилу scope, что сам раздел: выбран парк
// → драйверы с периодом в нём. Иначе на соседних экранах жили бы два разных ответа на
// вопрос «сколько драйверов», и разъехались бы они молча.
//
// ⚠ Это НЕ те же цифры, что «работают N» в строке-сводке, и так и должно быть:
// сводка считает строки daily_activities выбранного МЕСЯЦА, чипы — паспорта драйверов
// парка целиком, без привязки к месяцу.
const driverStatuses = computed(() => {
  if (isNetwork.value) return []
  const joined = joinDrivers(data.value?.drivers, data.value?.driver_periods)
  const scoped = joined.filter((d) => matches(d, parkCtx.value, 'all'))
  if (!scoped.length) return []
  const counts = statusCounts(scoped)
  return statusOptions(scoped).map((s) => ({ id: s, label: statusLabel(s), count: counts[s] }))
})

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

// ── Плавающая кнопка «+» и её гашение у низа страницы ───────────────────────
// Наблюдаем за нижней кнопкой «Добавить отчёт»: видна — плавающая не нужна.
// IntersectionObserver, а не слушатель скролла: он не будит рендер на каждый кадр
// прокрутки, а на длинной странице это заметно на телефоне.
const bottomCta = ref(null)
const bottomCtaVisible = ref(false)
let io = null
function watchBottomCta(el) {
  if (io) { io.disconnect(); io = null }
  bottomCtaVisible.value = false
  if (!el || typeof IntersectionObserver === 'undefined') return
  io = new IntersectionObserver(([e]) => { bottomCtaVisible.value = !!(e && e.isIntersecting) })
  io.observe(el)
}
watch(bottomCta, (el) => watchBottomCta(el), { flush: 'post' })
onBeforeUnmount(() => { if (io) { io.disconnect(); io = null } })

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
      <p v-if="hint" data-test="net-hint" class="text-[0.9375rem] font-medium text-[var(--text)]">{{ hint }}</p>
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
      <DailyDashboard
        :m="model"
        :reads="data?.signal_reads || []"
        :signals="signalPool"
        :driver-statuses="driverStatuses"
        class="bc-fade-in"
        @open-drivers="openDrivers"
      />
    </template>

    <!-- «Отчёт дня» (D-12): вход в единственную пишущую страницу.
         Показываем всегда (кроме загрузки) — форма не зависит от дневного слоя. -->
    <button
      v-if="!loading"
      ref="bottomCta"
      type="button"
      class="mt-1 flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--surface)] shadow-sm transition-opacity active:opacity-90"
      @click="setSubView('daily-report')"
    >
      <span class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)]">
        <Plus class="h-[18px] w-[18px] text-[var(--accent-ink)]" :stroke-width="2.5" aria-hidden="true" />
      </span>
      <span class="text-[1rem] font-semibold text-[var(--text)]">Добавить отчёт</span>
    </button>

    <!-- Плавающий вход в «Отчёт дня» (правка владельца 06.08): экран длинный, а
         отчёт сдают ежедневно — прокручивать до низа ради этого не нужно.
         Гаснет, когда до нижней кнопки уже долистали: две кнопки об одном на одном
         экране — это шум, а не подстраховка. `fixed` привязан к мобильной колонке
         (max-w-[430px] по центру, как AppShell), отступ снизу — высота таб-бара
         плюс safe-area. Обёртка не ловит клики, чтобы не перекрывать контент. -->
    <div
      v-if="!loading"
      class="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[430px] justify-center px-4"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 4.75rem)"
      aria-hidden="true"
    >
      <button
        v-show="!bottomCtaVisible"
        data-test="daily-fab"
        type="button"
        class="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg transition-opacity duration-150 active:opacity-90"
        aria-label="Добавить отчёт"
        @click="setSubView('daily-report')"
      >
        <Plus class="h-7 w-7 text-[var(--accent-ink)]" :stroke-width="2.75" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
