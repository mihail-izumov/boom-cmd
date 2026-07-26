<script setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watchEffect } from 'vue'
import { useDaily } from '../composables/useDaily.js'
import { CADENCES, entryKey, feedByCadence, monthsOf } from '../composables/netSummary.js'
import { CADENCE_SEG, L } from '../i18n/summary.js'
import { clearTrailing, setTrailing } from '../composables/useNavTrailing.js'
import NetSummaryCard from '../components/daily/NetSummaryCard.vue'
import SummaryMonthPicker from '../components/daily/SummaryMonthPicker.vue'

// Раздел «Сводки сети» — под-страница, вход плиткой с Главной (мини-стек глубиной 1).
// Источник — тот же дневной payload (useDaily), отдельное верхнеуровневое поле
// data.net_summary. Парк-контекст здесь не участвует: сводки сетевые.
//
// v2.2: селектор месяца (пилюля + bottom-sheet, механика парк-фильтра). В списке
// только месяцы, по которым есть хоть одна запись любого каденса; умолчание —
// самый свежий. Месяц сужает ВСЕ каденсы разом, поэтому в сегменте «Месяц» сводка
// ровно одна — отсюда и единственное число в подписи.
// v2.3: селектор переехал в правый верхний угол шапки (useNavTrailing) — туда же,
// где на других разделах стоит парк-фильтр.
//
// v2 (ТЗ §3.1–3.2): сегментированный переключатель «Дни / Недели / Месяц» под
// лид-текстом (таб-бар по HIG занят навигацией, туда каденс не выносим), внутри
// сегмента — ЛЕНТА всех записей каденса: новое сверху, актуальная раскрыта,
// прошлые свёрнуты в строку с бейджем периода. Обводок в разделе нет (v2.1):
// карточки держатся заливкой. Автоскролла нет намеренно: обратная хронология уже
// даёт фокус на актуальном, а автоскролл на длинной ленте читается как баг.

const { data, loading, error, reload } = useDaily()

// Месяцы, по которым есть хоть одна запись; новые сверху. Выбранный месяц —
// ref, но действующим считается только тот, что есть в списке: данные могут
// перезагрузиться, и выбор из прошлой загрузки не должен показать пустоту.
// Нет выбора — берём самый свежий месяц.
const months = computed(() => monthsOf(data.value?.net_summary))
const picked = ref(null)
const month = computed(() =>
  months.value.includes(picked.value) ? picked.value : months.value[0] || null,
)

const feeds = computed(() => feedByCadence(data.value?.net_summary, month.value))
const total = computed(() => CADENCES.reduce((a, c) => a + feeds.value[c].length, 0))

const cadence = ref('day') // умолчание — «Дни»
const entries = computed(() => feeds.value[cadence.value] || [])

// Раскрытие — аккордеон (v2.3): открыта РОВНО одна запись, открытие соседней
// закрывает предыдущую, чтобы длинные сводки не мешали друг другу. Состояние
// хранится по паре «месяц + каденс»: переключение сегмента или месяца не тащит
// за собой чужой ключ и не оставляет ленту полностью свёрнутой.
//   значения: undefined — умолчание «раскрыта первая», '' — свёрнуты все,
//   иначе — ключ раскрытой записи.
const openBy = ref({})
const scope = computed(() => `${month.value || '—'}:${cadence.value}`)
const keyOf = (entry, i) => entryKey(cadence.value, entry, i)
function isOpen(entry, i) {
  const cur = openBy.value[scope.value]
  return cur === undefined ? i === 0 : cur === keyOf(entry, i)
}
function toggle(entry, i) {
  openBy.value = { ...openBy.value, [scope.value]: isOpen(entry, i) ? '' : keyOf(entry, i) }
}

// Селектор месяца живёт в правом верхнем углу шапки (v2.3) — там же, где на других
// разделах парк-фильтр. Слот освобождаем, когда экран уходит: он общий на всю
// оболочку.
const active = ref(true)
onActivated(() => { active.value = true })
onDeactivated(() => { active.value = false; clearTrailing() })
onBeforeUnmount(clearTrailing)
watchEffect(() => {
  if (!active.value || !months.value.length) {
    clearTrailing()
    return
  }
  setTrailing(SummaryMonthPicker, {
    months: months.value,
    modelValue: month.value,
    'onUpdate:modelValue': (m) => { picked.value = m },
  })
})
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-1">
    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка">
      <div v-for="i in 3" :key="i" class="bc-skeleton h-32 rounded-2xl" />
    </div>

    <!-- error -->
    <div v-else-if="error" class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.error }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >{{ L.retry }}</button>
    </div>

    <!-- сводок нет вовсе -->
    <div v-else-if="!months.length" class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_hint }}</p>
    </div>

    <!-- лид + сегменты + лента каденса -->
    <template v-else>
      <p
        data-test="summary-lead"
        class="bc-fade-in whitespace-pre-line px-4 pb-1 text-center text-[1rem] leading-snug text-[var(--text-muted)]"
      >{{ L.lead }}</p>

      <div
        data-test="summary-segments"
        role="tablist"
        :aria-label="L.seg_aria"
        class="bc-fade-in flex gap-1 rounded-xl bg-[var(--surface-2)] p-1"
      >
        <button
          v-for="c in CADENCES"
          :key="c"
          type="button"
          role="tab"
          :data-test="`summary-seg-${c}`"
          :aria-selected="cadence === c ? 'true' : 'false'"
          class="flex-1 rounded-lg text-[0.9375rem] transition-colors"
          style="min-height: 44px"
          :class="cadence === c
            ? 'bg-[var(--surface)] font-semibold text-[var(--text)] shadow-sm'
            : 'font-medium text-[var(--text-secondary)] active:bg-[var(--surface)]'"
          @click="cadence = c"
        >{{ CADENCE_SEG[c] }}</button>
      </div>

      <!-- лента каденса: новое сверху, актуальная раскрыта, прошлые свёрнуты -->
      <template v-if="entries.length">
        <NetSummaryCard
          v-for="(e, i) in entries"
          :key="keyOf(e, i)"
          :cadence="cadence"
          :entry="e"
          :expanded="isOpen(e, i)"
          :collapsible="entries.length > 1"
          class="bc-fade-in"
          @toggle="toggle(e, i)"
        />
      </template>

      <!-- в каденсе записей нет — тот же пустой стейт, что у раздела -->
      <div
        v-else
        data-test="summary-empty-cadence"
        class="flex min-h-[30svh] flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty }}</p>
        <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_hint }}</p>
      </div>
    </template>
  </section>
</template>
