<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import {
  sortSignals, latestSignal, feedSignals, signalDot,
  statusOf, markState, loadReadStore, saveReadStore,
  readFor, isMarkable,
} from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'
import DailyDayProgress from './DailyDayProgress.vue'
import SignalRateSheet from './SignalRateSheet.vue'
import SignalMarkButton from './SignalMarkButton.vue'

// «Сигнал Дня» — единый блок. Сверху разбор аналитика + лента + отметка; ниже —
// «Как идёт день». ТОЛЬКО рендерит payload (ТЗ §5); цвет — только в точке статуса,
// текст монохромный (DESIGN-STANDARD §3.3/D-16).
//
// ЧТО ИЗМЕНИЛОСЬ (2026-08-04):
//   • отметить можно ЛЮБОЙ сигнал в окне 14 дней, а не только самый свежий. Раньше
//     кнопка была одна, и всё, что уезжало в ленту, становилось неотмечаемым навсегда;
//   • пул сигналов приходит СКВОЗЬ границу месяца (prop `signals`) — иначе 01.08
//     сигнал за 31.07 исчезал вместе с возможностью его отметить;
//   • прочтение и оценка развязаны: закрытие модалки больше не отменяет прочтение.
const props = defineProps({
  m: { type: Object, required: true },
  now: { type: Date, default: null },
  // Проекция payload.signal_reads — что бэк уже записал. Канон прочтения: переживает
  // перезагрузку, чистку кэша и смену устройства. С 04.08 бэк отдаёт строку на КАЖДУЮ
  // пару (парк, день) за 45 дней, а не одну на парк, — иначе лента врала бы на всех
  // днях, кроме последнего.
  reads: { type: Array, default: () => [] },
  // Пул сигналов окна + выбранного месяца (собирает DailyScreen через collectSignals).
  // Не передан → живём внутри одного набора парк:месяц, как раньше.
  signals: { type: Array, default: null },
})

const park = computed(() => (props.m && props.m.park) || '')
const pool = computed(() =>
  sortSignals(props.signals && props.signals.length ? props.signals : (props.m && props.m.signals) || []),
)
const latest = computed(() => latestSignal(pool.value))
const feed = computed(() => feedSignals(pool.value))

// Статусы на устройстве. Снимок «новизны» — на момент setup (ДО записи viewed):
// бейдж «новое» живёт весь заход, снят в следующий (ТЗ §2).
const store = ref(loadReadStore())
const snapshot = { ...store.value }
const feedOpen = ref(false)
const openRows = ref({})
const { statusOf: sendState, enqueue } = useSignalRead()

const headDate = computed(() => (latest.value ? ddmm(latest.value.date) : ''))
const localStatus = (date) => statusOf(store.value, park.value, date)
const localRead = (date) => localStatus(date) === 'read'

// Отмечено = бэк ИЛИ устройство ИЛИ подтверждение этой сессии.
function isDone(date) {
  const s = sendState(park.value, date)
  return !!readFor(props.reads, park.value, date) || localRead(date) || s === 'done' || s === 'score-debt'
}
const latestDone = computed(() => !!latest.value && isDone(latest.value.date))
const latestNew = computed(
  () => !!latest.value && statusOf(snapshot, park.value, latest.value.date) === 'none',
)

function persist(date, state) {
  markState(store.value, park.value, date, state)
  saveReadStore(store.value)
  store.value = { ...store.value }
}
onMounted(() => {
  if (latest.value && localStatus(latest.value.date) === 'none') persist(latest.value.date, 'viewed')
})

// ── КОНТУР Б защиты от дурака ────────────────────────────────────────────────
// Отметка и оценка — ДВА независимых действия, обе кнопки видны сразу. Раньше POST
// уходил только из сабмита модалки: человек, не желавший оценивать, терял вместе с
// оценкой и факт прочтения. Теперь прочтение фиксируется само по себе, а модалка
// оценки открывается только по явному нажатию и ничего не отменяет при закрытии.
const rateOpen = ref(false)
const rateDate = ref('')
const rateInitial = computed(() => {
  const entry = readFor(props.reads, park.value, rateDate.value)
  const n = entry ? Number(entry.score) : NaN
  return Number.isInteger(n) ? n : null
})

function onMark(date) {
  if (!date || isDone(date) || !isMarkable(date, props.now || new Date())) return
  // Локальный статус 'read' здесь НЕ пишем: он ставится только по подтверждению бэка
  // (useSignalRead.confirm_). Иначе упавший запрос оставит человека с «Прочитано ✓»
  // на экране и пустотой в контуре B — то есть ровно с исходной жалобой.
  enqueue({ park: park.value, signal_date: date }) // score не трогаем — это другое действие
}
// «Оценить» / «Изменить оценку». Прочтение при этом запишется само, даже если его
// ещё не отмечали: бэк на любой signal_read пишет и прочтение тоже.
function onRate(date) {
  if (!date || !isMarkable(date, props.now || new Date())) return
  rateDate.value = date
  rateOpen.value = true
}
function onRateSubmit(score) {
  if (!rateDate.value) return
  enqueue({ park: park.value, signal_date: rateDate.value, score })
  rateOpen.value = false
}

function toggleFeed() { feedOpen.value = !feedOpen.value }
function toggleRow(date) {
  openRows.value = { ...openRows.value, [date]: !openRows.value[date] }
  if (localStatus(date) === 'none') persist(date, 'viewed') // tap снимает «новое»
}
function rowMarker(date) {
  if (isDone(date)) return 'read'
  return localStatus(date) === 'none' ? 'new' : 'open'
}
</script>

<template>
  <article class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <!-- шапка: «Сигнал Дня» + бейдж «новое» · «разбор аналитика от DD.MM» -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2">
        <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.signal_title }}</h2>
        <span v-if="latest && latestNew && !latestDone" class="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--accent-ink)]">{{ L.signal_new }}</span>
      </div>
      <span v-if="latest" class="shrink-0 pt-0.5 text-[0.75rem] text-[var(--text-muted)]">{{ L.signal_by }} {{ headDate }}</span>
    </div>

    <template v-if="latest">
      <div class="mt-2 flex items-start gap-2">
        <span class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: signalDot(latest.status) }" />
        <div class="min-w-0">
          <p class="text-[0.9375rem] font-semibold leading-snug text-[var(--text)]">{{ latest.headline }}</p>
          <p v-if="latest.action" class="mt-1 text-[0.875rem] leading-snug text-[var(--text-secondary)]">{{ latest.action }}</p>
        </div>
      </div>

      <div class="mt-3">
        <SignalMarkButton
          :park="park" :date="latest.date" :reads="reads"
          :local-read="localRead(latest.date)" :now="now"
          @mark="onMark" @rate="onRate"
        />
      </div>

      <SignalRateSheet :open="rateOpen" :initial="rateInitial" @close="rateOpen = false" @submit="onRateSubmit" />

      <div v-if="feed.length" class="mt-3 border-t border-[var(--line)] pt-1">
        <button
          type="button"
          data-test="signal-feed-toggle"
          class="flex w-full items-center justify-between gap-2 text-left text-[0.8125rem] font-medium text-[var(--text-secondary)]"
          style="min-height: 44px"
          :aria-expanded="feedOpen ? 'true' : 'false'"
          @click="toggleFeed"
        >
          <span>{{ L.signal_feed }}</span>
          <ChevronDown class="h-4 w-4 shrink-0 transition-transform" :class="feedOpen ? 'rotate-180' : ''" aria-hidden="true" />
        </button>
        <ul v-if="feedOpen" class="flex flex-col">
          <li v-for="s in feed" :key="s.date" data-test="signal-feed-row" class="border-t border-[var(--line)] first:border-t-0">
            <!-- Раскрытие строки и отметка — РАЗНЫЕ элементы: вложенный <button>
                 внутри <button> невалиден, а тач-таргеты обоих должны быть ≥44pt (HIG). -->
            <button type="button" class="flex w-full items-start gap-2 py-2 text-left" style="min-height: 44px" @click="toggleRow(s.date)">
              <span class="w-[2.6rem] shrink-0 pt-0.5 text-[0.75rem] tabular-nums text-[var(--text-muted)]">{{ ddmm(s.date) }}</span>
              <span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: signalDot(s.status) }" />
              <span class="min-w-0 flex-1 text-[0.8125rem] leading-snug text-[var(--text)]">{{ s.headline }}</span>
              <span class="shrink-0 pt-0.5">
                <span v-if="rowMarker(s.date) === 'new'" class="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[0.5625rem] font-semibold text-[var(--accent-ink)]">{{ L.signal_new }}</span>
                <span v-else-if="rowMarker(s.date) === 'read'" class="text-[0.75rem] text-[var(--text-muted)]" aria-label="прочитано">✓</span>
              </span>
            </button>
            <div v-if="openRows[s.date]" class="pb-3 pl-[3.1rem] pr-1">
              <p v-if="s.action" class="text-[0.8125rem] leading-snug text-[var(--text-secondary)]">{{ s.action }}</p>
              <!-- Та же кнопка, что у свежего сигнала: именно её отсутствие здесь и
                   делало пропущенные дни неотмечаемыми навсегда. Дата отмечаемого
                   сигнала — слева в строке, поэтому в кнопке её не дублируем. -->
              <div class="mt-2">
                <SignalMarkButton
                  :park="park" :date="s.date" :reads="reads"
                  :local-read="localRead(s.date)" :now="now"
                  @mark="onMark" @rate="onRate"
                />
              </div>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <!-- нет сигнала: аналитик ещё не оставил разбор -->
    <p v-else class="mt-2 text-[0.875rem] leading-snug text-[var(--text-muted)]">{{ L.signal_empty }}</p>

    <!-- «Как идёт день» — влит в блок «Сигнал Дня» -->
    <div class="mt-3 border-t border-[var(--line)] pt-3">
      <DailyDayProgress :m="m" :now="now" />
    </div>
  </article>
</template>
