<script setup>
import { computed, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { blocksOf, summaryDot, summaryInk } from '../../composables/netSummary.js'
import { cardTitle, periodLabel, L } from '../../i18n/summary.js'

// Карточка сетевой сводки (день / неделя / месяц). ТОЛЬКО рендерит payload:
// заголовок и период считаются из cadence+date, тело — три блока из данных.
//
// v2.1 по правкам владельца:
//   • обводок нет — карточка держится заливкой --surface на холсте --bg;
//   • период — БЕЙДЖ, его заливка и есть маркер статуса; отдельной цветной точки
//     больше нет, разделителей «·» тоже. Текст на бейдже монохромный: тёмный ink
//     на светлой заливке, белый — на насыщенной (DESIGN-STANDARD §3.5);
//   • у свёрнутой строки — только бейдж периода: метка первого блока («Данные»,
//     «Итог недели») повторяется у всех записей каденса и ничего не различает.
//
// Два состояния (ТЗ v2 §3.2): раскрытая карточка и свёрнутая строка. Состоянием
// владеет экран — карточка только эмитит `toggle`. Бейджа «новое» нет (ТЗ v2 §3.3),
// `data_asof` не выводится. Кнопки «Прочитал ✓» здесь нет: следующая фаза.
const props = defineProps({
  cadence: { type: String, required: true },
  entry: { type: Object, required: true },
  // раскрыта ли карточка; в ленте раскрыта только первая (актуальная)
  expanded: { type: Boolean, default: true },
  // можно ли свернуть обратно; в ленте из одной записи сворачивать нечего
  collapsible: { type: Boolean, default: false },
})
defineEmits(['toggle'])

const title = computed(() => cardTitle(props.cadence))
const period = computed(() => periodLabel(props.cadence, props.entry.date))
const badge = computed(() => ({
  background: summaryDot(props.entry.status),
  color: summaryInk(props.entry.status),
}))
const blocks = computed(() => blocksOf(props.entry))
const head = computed(() => blocks.value.find((b) => b.head) || null)
const rest = computed(() => blocks.value.filter((b) => !b.head))

// Блок 1 раскрывается независимо от карточки — состояние локальное.
const headOpen = ref(false)
</script>

<template>
  <article
    data-test="summary-card"
    :data-cadence="cadence"
    :data-open="expanded ? 'true' : 'false'"
    class="overflow-hidden rounded-2xl bg-[var(--surface)]"
  >
    <!-- свёрнутая строка ленты: только бейдж периода -->
    <button
      v-if="!expanded"
      type="button"
      data-test="summary-row"
      class="flex w-full items-center gap-2 px-4 text-left active:bg-[var(--surface-2)]"
      style="min-height: 44px"
      aria-expanded="false"
      @click="$emit('toggle')"
    >
      <span
        data-test="summary-badge"
        class="inline-block shrink-0 rounded-lg px-2 py-1 text-[0.9375rem] font-semibold leading-none"
        :style="badge"
      >{{ period }}</span>
      <span class="flex-1" aria-hidden="true" />
      <ChevronDown class="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
    </button>

    <!-- раскрытая карточка -->
    <div v-else class="p-4">
      <!-- шапка: бейдж периода (он же маркер статуса) · заголовок · сворачивание -->
      <div class="flex items-center gap-2">
        <span
          data-test="summary-badge"
          class="inline-block shrink-0 rounded-lg px-2 py-1 text-[0.9375rem] font-semibold leading-none"
          :style="badge"
        >{{ period }}</span>
        <h2 class="min-w-0 flex-1 truncate text-[1rem] font-semibold leading-snug text-[var(--text)]">{{ title }}</h2>
        <button
          v-if="collapsible"
          type="button"
          data-test="summary-collapse"
          class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] active:bg-[var(--surface-2)]"
          :aria-label="L.less"
          aria-expanded="true"
          @click="$emit('toggle')"
        >
          <ChevronDown class="h-4 w-4 rotate-180" aria-hidden="true" />
        </button>
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
          class="mt-2 flex w-full items-center justify-between gap-2 text-left text-[0.8125rem] font-medium text-[var(--text-secondary)]"
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
    </div>
  </article>
</template>
