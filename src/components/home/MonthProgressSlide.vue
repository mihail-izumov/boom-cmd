<script setup>
import { computed, ref } from 'vue'
import { Check } from 'lucide-vue-next'
import { mlnRub } from '../../i18n/home.js'
import { monthLayout, markStyle } from '../../composables/monthLayout.js'

// Один экран деки месяца (D-34). Шелл карты, свайп, шапка и точки — в
// MonthProgressCard.vue; здесь только полоса и подписи.
//
// ЭТО BULLET CHART (Stephen Few), а не четыре риски в ряд. Роли разные, и
// кодироваться должны разными средствами, иначе читатель сравнивает штрихи:
//   ФАКТ    — сама МЕРА, сплошная жёлтая полоса (накоплено по закрытым дням);
//   ПРОГНОЗ — продолжение меры ШТРИХОВКОЙ («сплошное = есть, штрих = ожидаемое»);
//   ПЛАН    — ПОРОГ: штрих, ПЕРЕСЕКАЮЩИЙ полосу сверху и снизу. Именно так в
//             bullet chart рисуется target: он выше меры и поэтому виден сразу,
//             а не теряется среди сегментов;
//   ЦЕЛЬ    — ЭТАЛОН = ВЕРХ ШКАЛЫ. Отдельной метки нет: длина полосы и есть цель.
//             Расстояние от штриха плана до конца полосы = разрыв «план → цель».
//
// Почему у цели метку убрали: раньше она была третьей риской у правого края,
// сливалась с планом и требовала расшифровки. Эталон в bullet chart задаёт
// ДЛИНУ шкалы, а не рисуется внутри неё. Метка возвращается ТОЛЬКО когда цель
// кто-то перерос (прогноз/факт выше цели) и она оказалась внутри шкалы.
//
// ВНУТРЕННИЕ КРАЯ ПРЯМЫЕ: скругление только у трека снаружи, иначе на стыке
// заливки и штриховки появляется светлый серп и полоса читается разорванной.
//
// ПОДСВЕТКА ПО ТАПУ: тап по чипу легенды приглушает всё, кроме выбранного
// элемента. Повторный тап снимает. Легенда — единственный способ связать
// подпись с элементом, поэтому она интерактивна, а не декоративна.
//
// Геометрия — monthLayout.js (чистая функция, инварианты И-1…И-7 в приёмке).
// Здесь НЕТ собственной арифметики процентов.
//
// Дизайн: жёлтый — только заливка (DESIGN-STANDARD §3.3), остальное монохром.

const props = defineProps({
  fact: { type: Number, default: null },
  plan: { type: Number, default: null },
  forecast: { type: Number, default: null },
  goal: { type: Number, default: null },
})

const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 3px, var(--text-muted) 3px 4px)'

const L = computed(() => monthLayout(props))
const active = ref(null) // ключ подсвеченного элемента; null — подсветки нет

const factStyle = computed(() => ({ width: `${L.value.factPct}%` }))
const gapStyle = computed(() => ({
  left: `${L.value.gapStart}%`,
  width: `${L.value.gapWidth}%`,
  backgroundImage: HATCH,
}))
const factMark = computed(() => markStyle(L.value.factPct))
const planMark = computed(() => markStyle(L.value.planPct))
// Метка цели — только если цель НЕ верх шкалы (её кто-то перерос).
const goalMark = computed(() => (L.value.goalIsEnd ? null : markStyle(L.value.goalPct)))

// Приглушение: выбран элемент → все остальные тускнеют. Полоса не перестраивается,
// меняется только акцент, поэтому глаз не теряет масштаб.
const dim = (key) => (active.value && active.value !== key ? 'opacity-25' : '')
function toggle(key) {
  active.value = active.value === key ? null : key
}

// Колонки — в порядке следования по шкале, чтобы глаз связывал подпись с элементом.
// Значения нет (цель не задана) → колонки просто нет.
const columns = computed(() => {
  const l = L.value
  const raw = l.planIsGoal
    ? [
        { key: 'fact', label: 'Факт', value: props.fact, glyph: 'fill' },
        { key: 'forecast', label: 'Прогноз', value: props.forecast, glyph: 'hatch' },
        { key: 'plan', label: 'План и цель', value: props.goal, glyph: 'end', done: l.reachedGoal },
      ]
    : [
        { key: 'fact', label: 'Факт', value: props.fact, glyph: 'fill' },
        { key: 'forecast', label: 'Прогноз', value: props.forecast, glyph: 'hatch' },
        { key: 'plan', label: 'План', value: props.plan, glyph: 'cross', done: l.reachedPlan },
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
    <!-- Внешний контейнер с воздухом сверху и снизу: штрих плана ВЫШЕ полосы,
         поэтому он не может жить внутри трека с overflow-hidden. -->
    <div class="relative py-1" role="img" :aria-label="aria">
      <div class="relative h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <!-- ФАКТ — мера. Жёлтый на треке даёт 1,36:1 (посчитано по WCAG), на
             границу заливки полагаться нельзя: конец меры помечен тёмным торцом. -->
        <div
          class="absolute inset-y-0 left-0 bg-[var(--accent)] transition-all duration-500"
          :class="dim('fact')"
          :style="factStyle"
        ></div>
        <!-- ПРОГНОЗ — продолжение меры штриховкой -->
        <div
          v-if="L.gapWidth"
          class="absolute inset-y-0 transition-all duration-500"
          :class="dim('forecast')"
          :style="gapStyle"
        ></div>
        <div
          class="absolute inset-y-0 w-[2px] bg-[var(--text)] transition-all duration-500"
          :class="dim('fact')"
          :style="factMark"
        ></div>
        <!-- ЦЕЛЬ внутри шкалы — только когда её перерос прогноз или факт -->
        <div
          v-if="goalMark"
          data-test="mark-goal"
          class="absolute inset-y-0 w-[3px] bg-[var(--text)] transition-opacity"
          :class="dim('goal')"
          :style="goalMark"
        ></div>
      </div>
      <!-- ПЛАН — порог bullet chart: пересекает полосу сверху и снизу. Живёт НАД
           треком (вне его overflow), поэтому виден целиком. -->
      <div
        v-if="planMark"
        data-test="mark-plan"
        class="absolute inset-y-0 w-[2.5px] rounded-[1px] bg-[var(--text)] transition-opacity"
        :class="dim('plan')"
        :style="planMark"
      ></div>
    </div>

    <div class="mt-2 flex items-start justify-between gap-1">
      <button
        v-for="c in columns"
        :key="c.key"
        type="button"
        data-test="legend-chip"
        class="flex min-w-0 flex-1 flex-col items-start gap-[3px] rounded-lg py-0.5 text-left transition-colors"
        :aria-pressed="active === c.key ? 'true' : 'false'"
        :aria-label="`Подсветить: ${c.label}`"
        @click="toggle(c.key)"
      >
        <span class="flex items-center gap-[5px]">
          <!-- Чип-глиф: все одного размера, квадрат с обводкой. Внутри — то же,
               чем элемент нарисован на полосе, чтобы легенду не расшифровывать. -->
          <i
            class="flex h-[14px] w-[14px] shrink-0 items-center overflow-hidden rounded-[4px] border transition-colors"
            :class="active === c.key ? 'border-[var(--text)] bg-[var(--surface-2)]' : 'border-[var(--line)]'"
            aria-hidden="true"
          >
            <i v-if="c.glyph === 'fill'" class="h-full w-full bg-[var(--accent)]"></i>
            <i v-else-if="c.glyph === 'hatch'" class="h-full w-full" :style="{ backgroundImage: HATCH }"></i>
            <!-- план: штрих через весь чип по центру — как порог через полосу -->
            <i v-else-if="c.glyph === 'cross'" class="mx-auto h-full w-[2px] bg-[var(--text)]"></i>
            <!-- цель: штрих у правого края — «конец шкалы» -->
            <i v-else class="ml-auto h-full w-[2px] bg-[var(--text)]"></i>
          </i>
          <span class="truncate text-[0.625rem] text-[var(--text-muted)]">{{ c.label }}</span>
          <!-- Порог взят фактом. Галочка монохромная: цвет здесь несёт только
               жёлтая заливка, светофор живёт в «Контроле Дня». -->
          <Check v-if="c.done" class="h-3 w-3 shrink-0 text-[var(--text)]" :stroke-width="3" aria-hidden="true" />
        </span>
        <span class="text-[0.8125rem] font-semibold leading-none text-[var(--text)]">{{ mlnRub(c.value) }}</span>
      </button>
    </div>
  </div>
</template>
