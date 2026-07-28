<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import {
  sortSignals, latestSignal, feedSignals, signalDot,
  statusOf, markState, loadReadStore, saveReadStore,
} from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'
import DailyDayProgress from './DailyDayProgress.vue'
import SignalRateSheet from './SignalRateSheet.vue'

// v3.1: «Сигнал Дня» — единый блок. Сверху разбор аналитика из payload (m.signals,
// если есть) + лента месяца + кнопка «Прочитала»; ниже — «Как идёт день» (авто-
// интерпретация, живёт всегда). ТОЛЬКО рендерит payload (ТЗ §5); цвет — только в
// точке статуса, текст монохромный (DESIGN-STANDARD §3.3/D-16).
const props = defineProps({
  m: { type: Object, required: true },
  now: { type: Date, default: null },
})

const signals = computed(() => (props.m && props.m.signals) || [])
const park = computed(() => (props.m && props.m.park) || '')
const sorted = computed(() => sortSignals(signals.value))
const latest = computed(() => latestSignal(sorted.value))
const feed = computed(() => feedSignals(sorted.value))

// Статусы прочитанности на устройстве. Снимок «новизны» — на момент setup
// (ДО записи viewed): бейдж «новое» живёт весь заход, снят в следующий (ТЗ §2).
const store = ref(loadReadStore())
const snapshot = { ...store.value }
const feedOpen = ref(false)
const openRows = ref({})
const { posting, postError, markRead } = useSignalRead()

const headDate = computed(() => (latest.value ? ddmm(latest.value.date) : ''))
const statusFor = (date) => statusOf(store.value, park.value, date)
const latestRead = computed(() => !!latest.value && statusFor(latest.value.date) === 'read')
const latestNew = computed(() => !!latest.value && statusOf(snapshot, park.value, latest.value.date) === 'none')

function persist(date, state) {
  markState(store.value, park.value, date, state)
  saveReadStore(store.value)
  store.value = { ...store.value }
}
onMounted(() => {
  if (latest.value && statusFor(latest.value.date) === 'none') persist(latest.value.date, 'viewed')
})
// v3.2: «Прочитала» открывает модалку оценки пользы (0–10); POST уходит из
// сабмита модалки одним телом signal_read + score. Закрытие без отправки =
// отмена: прочтение не фиксируется, кнопка остаётся активной.
const rateOpen = ref(false)
function onRead() {
  if (!latest.value || latestRead.value || posting.value) return
  rateOpen.value = true
}
async function onRateSubmit(score) {
  if (!latest.value || latestRead.value || posting.value) return
  const okres = await markRead({ park: park.value, signal_date: latest.value.date, score })
  rateOpen.value = false
  if (okres) persist(latest.value.date, 'read')
}
function toggleFeed() { feedOpen.value = !feedOpen.value }
function toggleRow(date) {
  openRows.value = { ...openRows.value, [date]: !openRows.value[date] }
  if (statusFor(date) === 'none') persist(date, 'viewed') // tap снимает «новое»
}
function rowMarker(date) {
  const s = statusFor(date)
  return s === 'read' ? 'read' : s === 'none' ? 'new' : 'open'
}
</script>

<template>
  <article class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <!-- шапка: «Сигнал Дня» + бейдж «новое» · «разбор аналитика от DD.MM» -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2">
        <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.signal_title }}</h2>
        <span v-if="latest && latestNew && !latestRead" class="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--accent-ink)]">{{ L.signal_new }}</span>
      </div>
      <span v-if="latest" class="shrink-0 pt-0.5 text-[0.75rem] text-[var(--text-muted)]">{{ L.signal_by }} {{ headDate }}</span>
    </div>

    <!-- разбор аналитика (если есть сигнал) -->
    <template v-if="latest">
      <div class="mt-2 flex items-start gap-2">
        <span class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: signalDot(latest.status) }" />
        <div class="min-w-0">
          <p class="text-[0.9375rem] font-semibold leading-snug text-[var(--text)]">{{ latest.headline }}</p>
          <p v-if="latest.action" class="mt-1 text-[0.875rem] leading-snug text-[var(--text-secondary)]">{{ latest.action }}</p>
        </div>
      </div>

      <button
        type="button"
        data-test="signal-read"
        :disabled="latestRead || posting"
        class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-4 text-[0.9375rem] font-medium text-[var(--text)] transition-opacity active:opacity-90 disabled:opacity-100"
        style="min-height: 44px"
        @click="onRead"
      >
        <span v-if="latestRead">{{ L.signal_read_done }} ✓</span>
        <span v-else>{{ L.signal_read }}</span>
      </button>

      <p v-if="postError" class="mt-2 rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]" style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))">{{ L.signal_error }}</p>

      <!-- v3.2: модалка «Оцените пользу Сигнала?» (ползунок 0–10) -->
      <SignalRateSheet :open="rateOpen" :posting="posting" @close="rateOpen = false" @submit="onRateSubmit" />

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
            <button type="button" class="flex w-full items-start gap-2 py-2 text-left" style="min-height: 44px" @click="toggleRow(s.date)">
              <span class="w-[2.6rem] shrink-0 pt-0.5 text-[0.75rem] tabular-nums text-[var(--text-muted)]">{{ ddmm(s.date) }}</span>
              <span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: signalDot(s.status) }" />
              <span class="min-w-0 flex-1 text-[0.8125rem] leading-snug text-[var(--text)]">{{ s.headline }}</span>
              <span class="shrink-0 pt-0.5">
                <span v-if="rowMarker(s.date) === 'new'" class="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[0.5625rem] font-semibold text-[var(--accent-ink)]">{{ L.signal_new }}</span>
                <span v-else-if="rowMarker(s.date) === 'read'" class="text-[0.75rem] text-[var(--text-muted)]" aria-label="прочитано">✓</span>
              </span>
            </button>
            <p v-if="openRows[s.date] && s.action" class="pb-2 pl-[3.1rem] pr-1 text-[0.8125rem] leading-snug text-[var(--text-secondary)]">{{ s.action }}</p>
          </li>
        </ul>
      </div>
    </template>

    <!-- нет сигнала: аналитик ещё не оставил разбор -->
    <p v-else class="mt-2 text-[0.875rem] leading-snug text-[var(--text-muted)]">{{ L.signal_empty }}</p>

    <!-- «Как идёт день» — влит в блок «Сигнал Дня» (v3.1) -->
    <div class="mt-3 border-t border-[var(--line)] pt-3">
      <DailyDayProgress :m="m" :now="now" />
    </div>
  </article>
</template>
