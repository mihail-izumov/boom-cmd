<script setup>
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { mlnRub } from '../../i18n/home.js'
import { monthLayout, markStyle } from '../../composables/monthLayout.js'

// Один экран деки месяца (D-34). Шелл карты, свайп, шапка и точки — в
// MonthProgressCard.vue; здесь только полоса и подписи.
//
// ПОЛОСА (одна, не две):
//   сплошная жёлтая — ФАКТ месяца (накоплено по закрытым дням, не за день);
//   серая ШТРИХОВКА — сколько доберём к прогнозу при текущем темпе;
//   серая риска     — ПЛАН (обязательство, порог а не отрезок);
//   толстая тёмная  — ЦЕЛЬ (амбиция).
// Штриховка — конвенция прогресс-баров «сплошное = есть, штрих = ожидаемое»:
// прогноз становится площадью, и видно два дефицита сразу — сколько доберём по
// инерции и сколько после этого всё равно не хватит до плана.
//
// Дорожка «время» СНЯТА: она соревновалась с денежной за внимание, а остаток
// дней важнее пройденных — он переехал бейджем в шапку деки.
//
// ВНУТРЕННИЕ КРАЯ ПРЯМЫЕ. Скругление есть только у трека (снаружи); заливка и
// штриховка стыкуются под 90°, иначе между сегментами появляется светлый серп
// и полоса читается как разорванная.
//
// СОСТОЯНИЯ ПОРОГОВ — спроектированы, а не «как отрисуется»:
//   цель = плану      → одна метка и одна колонка «План и цель»;
//   порог взят фактом → галочка у колонки;
//   факт перерос цель → шкала растягивается до факта, метка уходит внутрь.
//
// Геометрия — monthLayout.js (чистая функция, инварианты в verify-daily.mjs).
// Здесь НЕТ собственной арифметики процентов: единственный источник — она.
//
// Дизайн: жёлтый — только заливка (DESIGN-STANDARD §3.3), всё остальное монохром.

const props = defineProps({
  fact: { type: Number, default: null },
  plan: { type: Number, default: null },
  forecast: { type: Number, default: null },
  goal: { type: Number, default: null },
})

const L = computed(() => monthLayout(props))

const factStyle = computed(() => ({ width: `${L.value.factPct}%` }))
const gapStyle = computed(() => ({
  left: `${L.value.gapStart}%`,
  width: `${L.value.gapWidth}%`,
  backgroundImage: HATCH,
}))
const factMark = computed(() => markStyle(L.value.factPct))
const forecastMark = computed(() => markStyle(L.value.forecastPct))
const planMark = computed(() => (L.value.planIsGoal ? null : markStyle(L.value.planPct)))
const goalMark = computed(() => markStyle(L.value.goalPct))

const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 3px, var(--text-muted) 3px 4px)'

// Колонки — в порядке следования по шкале, чтобы глаз связывал подпись с меткой
// без легенды. Значения нет (цель не задана) → колонки просто нет.
const columns = computed(() => {
  const l = L.value
  const raw = l.planIsGoal
    ? [
        { key: 'fact', label: 'Факт', value: props.fact, glyph: 'fill' },
        { key: 'forecast', label: 'Прогноз', value: props.forecast, glyph: 'hatch' },
        { key: 'planGoal', label: 'План и цель', value: props.goal, glyph: 'end', done: l.reachedGoal },
      ]
    : [
        { key: 'fact', label: 'Факт', value: props.fact, glyph: 'fill' },
        { key: 'forecast', label: 'Прогноз', value: props.forecast, glyph: 'hatch' },
        { key: 'plan', label: 'План', value: props.plan, glyph: 'solid', done: l.reachedPlan },
        { key: 'goal', label: 'Цель', value: props.goal, glyph: 'end', done: l.reachedGoal },
      ]
  return raw.filter((c) => c.value != null).sort((a, b) => a.value - b.value)
})

// Полоса с метками сама по себе недоступна — дублируем смысл строкой, включая
// «взято»: без него скринридер получит числа, но не результат.
const aria = computed(() =>
  columns.value.length
    ? columns.value.map((c) => `${c.label} ${mlnRub(c.value)}${c.done ? ' — взято' : ''}`).join(', ')
    : 'Данных по месяцу нет',
)
</script>

<template>
  <div>
    <div class="relative h-3.5 overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" :aria-label="aria">
      <!-- ФАКТ. Жёлтый на треке — 1,36:1 (посчитано по WCAG), на границу заливки
           полагаться нельзя, поэтому конец факта помечен тёмной риской: смысл
           несёт она, заливка подкрепляет. Скругления у заливки НЕТ — стык со
           штриховкой должен быть прямым. -->
      <div
        class="absolute inset-y-0 left-0 bg-[var(--accent)] transition-[width] duration-500"
        :style="factStyle"
      ></div>
      <!-- ПРОГНОЗ — штрихованный отрезок «доберём при текущем темпе» -->
      <div
        v-if="L.gapWidth"
        class="absolute inset-y-0 transition-[left,width] duration-500"
        :style="gapStyle"
      ></div>
      <div class="absolute inset-y-0 w-[2px] bg-[var(--text)] transition-[left] duration-500" :style="factMark"></div>
      <div v-if="forecastMark" class="absolute inset-y-0 w-[2px] bg-[var(--graphite)]" :style="forecastMark"></div>
      <!-- ПЛАН — порог. Совпал с целью → не рисуем: метку ставит цель. -->
      <div v-if="planMark" class="absolute inset-y-0 w-[2px] bg-[var(--text-muted)]" :style="planMark"></div>
      <!-- ЦЕЛЬ — «финиш»: самая тёмная и толстая -->
      <div v-if="goalMark" class="absolute inset-y-0 w-[3px] bg-[var(--text)]" :style="goalMark"></div>
    </div>

    <div class="mt-2.5 flex items-start justify-between gap-1">
      <div v-for="c in columns" :key="c.key" class="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span class="flex items-center gap-[5px]">
          <!-- Глиф ПОВТОРЯЕТ метку на шкале — иначе легенду приходится расшифровывать -->
          <i
            v-if="c.glyph === 'fill'"
            class="flex h-[9px] w-[8px] shrink-0 justify-end bg-[var(--accent)]"
            aria-hidden="true"
          ><i class="h-full w-[2px] bg-[var(--text)]"></i></i>
          <i
            v-else-if="c.glyph === 'hatch'"
            class="flex h-[9px] w-[9px] shrink-0 justify-end"
            :style="{ backgroundImage: HATCH }"
            aria-hidden="true"
          ><i class="h-full w-[2px] bg-[var(--graphite)]"></i></i>
          <i v-else-if="c.glyph === 'solid'" class="h-[9px] w-[2px] shrink-0 bg-[var(--text-muted)]" aria-hidden="true"></i>
          <i v-else class="h-[9px] w-[3px] shrink-0 bg-[var(--text)]" aria-hidden="true"></i>
          <span class="truncate text-[0.625rem] text-[var(--text-muted)]">{{ c.label }}</span>
          <!-- Порог взят фактом. Галочка монохромная, не зелёная: цвет в этой
               карте несёт только жёлтый-заливка, светофор живёт в «Контроле Дня». -->
          <Check v-if="c.done" class="h-3 w-3 shrink-0 text-[var(--text)]" :stroke-width="3" aria-hidden="true" />
        </span>
        <span class="text-[0.8125rem] font-semibold leading-none text-[var(--text)]">{{ mlnRub(c.value) }}</span>
      </div>
    </div>
  </div>
</template>
