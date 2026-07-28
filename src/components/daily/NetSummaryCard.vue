<script setup>
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { asofOf, renderBlocks, summaryDot, summaryInk, weekIndexOf } from '../../composables/netSummary.js'
import { asofLabel, cardTitle, periodLabel, L } from '../../i18n/summary.js'

// Карточка сетевой сводки (день / неделя / месяц). ТОЛЬКО рендерит payload:
// заголовок, период и разбивка на абзацы считаются из данных, ничего не сочиняем.
//
// v2.1: обводок нет; период — БЕЙДЖ, его заливка и есть маркер статуса (отдельной
// цветной точки нет), разделителей «·» нет. Текст на бейдже монохромный: тёмный ink
// на светлой заливке, белый — на насыщенной (DESIGN-STANDARD §3.5).
// v2.3: блоки внутри карточки не сворачиваются, раскрытие живёт на уровне карточки.
// v2.4: бейдж периода идёт ПОСЛЕ названия.
// v2.5:
//   • ОДНА шапка-строка на оба состояния (свёрнуто/раскрыто) — потому стрелка
//     никогда не переезжает: раскрытие только доливает тело под ней;
//   • заголовок дня — реальный день недели («Пятница»), по образцу «Неделя 3»;
//   • под заголовком — срез формы «данные на 25.07» (снимает вопрос «почему
//     сводка за 24.07, если прислали 25-го»); времени не показываем;
//   • последний блок разложен на абзацы: сетевой итог отдельной строкой,
//     финальная директива — отдельным абзацем (разбивку делает рендер, данные
//     остаются одним абзацем в контракте).
// v2.6 (ЗАДАНИЕ-фронт-рендер-сводок): длинные недельные и месячные блоки режутся
// на строки по под-меткам («Главное:», «Факт недели:»). Опора только
// типографическая — жирная под-метка и отступ, без буллетов и иконок.
const props = defineProps({
  cadence: { type: String, required: true },
  entry: { type: Object, required: true },
  // раскрыта ли карточка; в ленте раскрыта одна — та, что выбрана
  expanded: { type: Boolean, default: true },
  // можно ли свернуть; в ленте из одной записи сворачивать нечего — тогда и стрелки нет
  collapsible: { type: Boolean, default: false },
})
defineEmits(['toggle'])

const title = computed(() =>
  cardTitle(props.cadence, { weekIdx: weekIndexOf(props.entry), date: props.entry.date }),
)
const period = computed(() => periodLabel(props.cadence, props.entry.date))
const asof = computed(() => asofLabel(asofOf(props.entry)))
const badge = computed(() => ({
  background: summaryDot(props.entry.status),
  color: summaryInk(props.entry.status),
}))
const blocks = computed(() => renderBlocks(props.entry))
</script>

<template>
  <article
    data-test="summary-card"
    :data-cadence="cadence"
    :data-open="expanded ? 'true' : 'false'"
    class="overflow-hidden rounded-2xl bg-[var(--surface)]"
  >
    <!-- Шапка — одна и та же в обоих состояниях: название · бейдж периода · стрелка.
         Заголовок обёрнут вокруг кнопки (валидный паттерн аккордеона), поэтому
         стрелка стоит на месте и при раскрытии не съезжает. -->
    <h2 class="m-0">
      <button
        v-if="collapsible"
        type="button"
        data-test="summary-row"
        class="flex w-full items-center gap-2 px-4 text-left active:bg-[var(--surface-2)]"
        style="min-height: 44px"
        :aria-expanded="expanded ? 'true' : 'false'"
        :aria-label="expanded ? L.less : L.more"
        @click="$emit('toggle')"
      >
        <span class="min-w-0 truncate text-[1rem] font-semibold text-[var(--text)]">{{ title }}</span>
        <span
          data-test="summary-badge"
          class="inline-block shrink-0 rounded-lg px-2 py-1 text-[0.9375rem] font-semibold leading-none"
          :style="badge"
        >{{ period }}</span>
        <span class="flex-1" aria-hidden="true" />
        <ChevronDown
          class="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform"
          :class="expanded ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
      <div v-else data-test="summary-row" class="flex w-full items-center gap-2 px-4" style="min-height: 44px">
        <span class="min-w-0 truncate text-[1rem] font-semibold text-[var(--text)]">{{ title }}</span>
        <span
          data-test="summary-badge"
          class="inline-block shrink-0 rounded-lg px-2 py-1 text-[0.9375rem] font-semibold leading-none"
          :style="badge"
        >{{ period }}</span>
      </div>
    </h2>

    <!-- Тело: срез формы + блоки. Появляется под неподвижной шапкой. -->
    <div v-if="expanded" class="px-4 pb-4">
      <p
        v-if="asof"
        data-test="summary-asof"
        class="text-[0.75rem] leading-none text-[var(--text-muted)]"
      >{{ asof }}</p>

      <p
        v-for="b in blocks"
        :key="b.key"
        data-test="summary-block"
        :data-kind="b.kind || 'text'"
        class="mt-2.5 text-[0.875rem] leading-snug"
        :class="b.kind === 'total' ? 'font-medium text-[var(--text)]' : 'text-[var(--text-secondary)]'"
      >
        <b v-if="b.label" class="font-semibold text-[var(--text)]">{{ b.label }}{{ b.sep || '.' }}</b>
        {{ b.rest }}
      </p>
    </div>
  </article>
</template>
