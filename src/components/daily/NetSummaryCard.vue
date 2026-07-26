<script setup>
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { blocksOf, summaryDot, summaryInk, weekIndexOf } from '../../composables/netSummary.js'
import { cardTitle, periodLabel, L } from '../../i18n/summary.js'

// Карточка сетевой сводки (день / неделя / месяц). ТОЛЬКО рендерит payload:
// заголовок и период считаются из cadence+date, тело — три блока из данных.
//
// v2.1: обводок нет; период — БЕЙДЖ, его заливка и есть маркер статуса (отдельной
// цветной точки нет), разделителей «·» нет. Текст на бейдже монохромный: тёмный ink
// на светлой заливке, белый — на насыщенной (DESIGN-STANDARD §3.5).
// v2.3: неделя называется «Неделя 3» — по номеру внутри месяца, как в «Контроле
// Дня». Блоки («Данные», «Итог недели», «Оценка», «Фокус») больше НЕ сворачиваются
// и своей стрелки не имеют: раскрытие живёт на уровне карточки, второй уровень
// свёртки внутри неё был лишним.
//
// Два состояния (ТЗ v2 §3.2): раскрытая карточка и свёрнутая строка. Состоянием
// владеет экран — карточка только эмитит `toggle`. Бейджа «новое» нет,
// `data_asof` не выводится. Кнопки «Прочитал ✓» здесь нет: следующая фаза.
const props = defineProps({
  cadence: { type: String, required: true },
  entry: { type: Object, required: true },
  // раскрыта ли карточка; в ленте раскрыта одна — та, что выбрана
  expanded: { type: Boolean, default: true },
  // можно ли свернуть обратно; в ленте из одной записи сворачивать нечего
  collapsible: { type: Boolean, default: false },
})
defineEmits(['toggle'])

const weekIdx = computed(() => weekIndexOf(props.entry))
const title = computed(() => cardTitle(props.cadence, weekIdx.value))
const period = computed(() => periodLabel(props.cadence, props.entry.date))
// В свёрнутой строке подпись только там, где она РАЗЛИЧАЕТ записи: номер недели.
// «Сводка дня» у всех дней одинакова — её в строке нет.
const rowNote = computed(() => (props.cadence === 'week' && weekIdx.value ? title.value : ''))
const badge = computed(() => ({
  background: summaryDot(props.entry.status),
  color: summaryInk(props.entry.status),
}))
const blocks = computed(() => blocksOf(props.entry))
</script>

<template>
  <article
    data-test="summary-card"
    :data-cadence="cadence"
    :data-open="expanded ? 'true' : 'false'"
    class="overflow-hidden rounded-2xl bg-[var(--surface)]"
  >
    <!-- свёрнутая строка ленты: бейдж периода (+ номер недели, если это неделя) -->
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
      <span
        v-if="rowNote"
        class="min-w-0 flex-1 truncate text-[0.9375rem] text-[var(--text-secondary)]"
      >{{ rowNote }}</span>
      <span v-else class="flex-1" aria-hidden="true" />
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

      <!-- все три блока подряд, в порядке данных; своей свёртки у них нет -->
      <p
        v-for="b in blocks"
        :key="b.key"
        data-test="summary-block"
        class="mt-2.5 text-[0.875rem] leading-snug text-[var(--text-secondary)]"
      >
        <b v-if="b.label" class="font-semibold text-[var(--text)]">{{ b.label }}.</b>
        {{ b.rest }}
      </p>
    </div>
  </article>
</template>
