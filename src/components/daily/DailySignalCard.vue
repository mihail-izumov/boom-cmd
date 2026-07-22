<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import {
  sortSignals, latestSignal, feedSignals, signalDot,
  statusOf, markState, loadReadStore, saveReadStore,
} from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'

// Полоса B (v3): карточка «Сигнал дня» + свёрнутая лента месяца + «Прочитал».
// ТОЛЬКО рендерит payload (props.signals) — ничего не пересчитывает (ТЗ §5).
// Цвет — только в точке статуса, текст монохромный (DESIGN-STANDARD §3.3/D-16).
const props = defineProps({
  signals: { type: Array, default: () => [] },
  park: { type: String, default: '' },
})

const sorted = computed(() => sortSignals(props.signals))
const latest = computed(() => latestSignal(sorted.value))
const feed = computed(() => feedSignals(sorted.value))

// Статусы прочитанности на устройстве. Снимок «новизны» — на момент setup (ДО
// записи viewed): бейдж «новое» живёт весь заход и снимается в следующий (ТЗ §2).
const store = ref(loadReadStore())
const snapshot = { ...store.value }
const feedOpen = ref(false)
const openRows = ref({})
const { posting, postError, markRead } = useSignalRead()

const headDate = computed(() => (latest.value ? ddmm(latest.value.date) : ''))
const statusFor = (date) => statusOf(store.value, props.park, date)
const latestRead = computed(() => !!latest.value && statusFor(latest.value.date) === 'read')
const latestNew = computed(() => !!latest.value && statusOf(snapshot, props.park, latest.value.date) === 'none')

function persist(date, state) {
  markState(store.value, props.park, date, state)
  saveReadStore(store.value)
  store.value = { ...store.value } // триггерим реактивность
}

onMounted(() => {
  // актуальный сигнал помечаем viewed после рендера (бейдж — по снимку выше)
  if (latest.value && statusFor(latest.value.date) === 'none') persist(latest.value.date, 'viewed')
})

async function onRead() {
  if (!latest.value || latestRead.value || posting.value) return
  const okres = await markRead({ park: props.park, signal_date: latest.value.date })
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
  <article v-if="latest" class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <!-- шапка: заголовок + бейдж «новое» · подпись «разбор аналитика от DD.MM» -->
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2">
        <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.signal_title }}</h2>
        <span
          v-if="latestNew && !latestRead"
          class="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--accent-ink)]"
        >{{ L.signal_new }}</span>
      </div>
      <span class="shrink-0 pt-0.5 text-[0.75rem] text-[var(--text-muted)]">{{ L.signal_by }} {{ headDate }}</span>
    </div>

    <!-- тело: точка статуса + headline + action -->
    <div class="mt-2 flex items-start gap-2">
      <span class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: signalDot(latest.status) }" />
      <div class="min-w-0">
        <p class="text-[0.9375rem] font-semibold leading-snug text-[var(--text)]">{{ latest.headline }}</p>
        <p v-if="latest.action" class="mt-1 text-[0.875rem] leading-snug text-[var(--text-secondary)]">{{ latest.action }}</p>
      </div>
    </div>

    <!-- кнопка «Прочитал» → POST signal_read -->
    <button
      type="button"
      data-test="signal-read"
      :disabled="latestRead || posting"
      class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-4 text-[0.9375rem] font-medium text-[var(--text)] transition-opacity active:opacity-90 disabled:opacity-100"
      style="min-height: 44px"
      @click="onRead"
    >
      <span>{{ latestRead ? L.signal_read_done : L.signal_read }}</span>
      <span aria-hidden="true">✓</span>
    </button>

    <!-- ошибка отправки: красная плашка (паттерн формы), текст монохромный -->
    <p
      v-if="postError"
      class="mt-2 rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))"
    >{{ L.signal_error }}</p>

    <!-- лента месяца (свёрнута; кнопки «Прочитал» у строк нет) -->
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
  </article>
</template>
