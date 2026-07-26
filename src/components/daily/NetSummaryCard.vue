<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import {
  blocksOf, summaryDot, loadReadStore, saveReadStore,
  summaryStatusOf, markSummaryState,
} from '../../composables/netSummary.js'
import { cardTitle, L } from '../../i18n/summary.js'

// Карточка сетевой сводки (день / неделя / месяц). ТОЛЬКО рендерит payload:
// заголовок считается из cadence+date, тело — три блока из данных.
// Цвет — только в точке статуса, текст монохромный (DESIGN-STANDARD §3.3, D-16).
// Кнопки «Прочитал ✓» здесь нет: это фаза 2 (ТЗ §9), сейчас только показ.
const props = defineProps({
  cadence: { type: String, required: true },
  entry: { type: Object, required: true },
})

const title = computed(() => cardTitle(props.cadence, props.entry.date))
const blocks = computed(() => blocksOf(props.entry))
const head = computed(() => blocks.value.find((b) => b.head) || null)
const rest = computed(() => blocks.value.filter((b) => !b.head))

// Статусы прочитанности на устройстве. Снимок «новизны» — на момент setup (ДО
// записи viewed): бейдж «новое» живёт весь заход, снят в следующий (как у сигнала).
const store = ref(loadReadStore())
const snapshot = { ...store.value }
const isNew = computed(() => summaryStatusOf(snapshot, props.cadence, props.entry.date) === 'none')
const headOpen = ref(false)

onMounted(() => {
  if (summaryStatusOf(store.value, props.cadence, props.entry.date) === 'none') {
    markSummaryState(store.value, props.cadence, props.entry.date, 'viewed')
    saveReadStore(store.value)
    store.value = { ...store.value }
  }
})
</script>

<template>
  <article data-test="summary-card" :data-cadence="cadence" class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <!-- шапка: точка статуса · заголовок из cadence+date · бейдж «новое» -->
    <div class="flex items-start gap-2">
      <span
        data-test="summary-dot"
        class="mt-[7px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        :style="{ background: summaryDot(entry.status) }"
        aria-hidden="true"
      />
      <h2 class="min-w-0 flex-1 text-[1rem] font-semibold leading-snug text-[var(--text)]">{{ title }}</h2>
      <span
        v-if="isNew"
        data-test="summary-new"
        class="shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--accent-ink)]"
      >{{ L.new }}</span>
    </div>

    <!-- блоки 2 и 3 (Оценка/Движение, Фокус/Вывод) — видны сразу -->
    <p
      v-for="b in rest"
      :key="b.key"
      data-test="summary-block"
      class="mt-2.5 text-[0.875rem] leading-snug text-[var(--text-secondary)]"
    >
      <b v-if="b.label" class="font-semibold text-[var(--text)]">{{ b.label }}.</b>
      {{ b.rest }}
    </p>

    <!-- блок 1 (Данные / Итог) — свёрнут по умолчанию, тап раскрывает -->
    <template v-if="head">
      <button
        type="button"
        data-test="summary-head-toggle"
        class="mt-1 flex w-full items-center justify-between gap-2 border-t border-[var(--line)] pt-1 text-left text-[0.8125rem] font-medium text-[var(--text-secondary)]"
        style="min-height: 44px"
        :aria-expanded="headOpen ? 'true' : 'false'"
        @click="headOpen = !headOpen"
      >
        <span>{{ head.label || L.more }}</span>
        <ChevronDown class="h-4 w-4 shrink-0 transition-transform" :class="headOpen ? 'rotate-180' : ''" aria-hidden="true" />
      </button>
      <p
        v-if="headOpen"
        data-test="summary-head-body"
        class="pb-1 text-[0.875rem] leading-snug text-[var(--text-secondary)]"
      >{{ head.rest }}</p>
    </template>
  </article>
</template>
