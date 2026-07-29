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
//   ПРОГНОЗ — продолжение меры: светло-жёлтая заливка + штриховка поверх
//             («тот же жёлтый = та же мера, штрих = ещё не заработано»);
//   НЕДОБОР — от прогноза до порога: ТОЧКИ. Не величина, а остаток плана;
//             без заливки пролёт читался как «тут ничего нет»;
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
// КАРЕТКА У ПОРОГА: роль обязана читаться формой, а не позицией. Когда план
// близок к цели (Питерленд 7,5 при 7,7) или совпал с ней (ТЦ Июнь), штрих
// прижимается к концу шкалы и без каретки читается как торец полосы.
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

// ПРОГНОЗ — светло-жёлтая заливка ПОД штриховкой. Заливка говорит «та же мера,
// что факт, только ещё не заработанная», штрихи держат контраст. Один светлый
// жёлтый без штрихов не годится: посчитано по WCAG — accent 35–45% на белом даёт
// 1,26–1,32:1 против факта и 1,03–1,08:1 против трека, то есть сегмент исчезает.
// Штрихи --text-muted: 3,34:1 на жёлтом, 4,54:1 на треке — они и несут границу,
// поэтому отдельный тёмный торец между фактом и прогнозом больше не нужен.
// Тон берём color-mix из токенов (приём уже узаконен DESIGN-STANDARD §6.2),
// нового hex в палитру не заводим.
const TINT = 'color-mix(in srgb, var(--accent) 40%, var(--surface))'
const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 2px, var(--text-muted) 2px 3px)'
// НЕДОБОР ДО ПЛАНА — точки. Та же краска, что у штрихов (4,54:1 на треке), но
// другой паттерн: линии и точки не спутать. Пролёт перестаёт быть «пустотой».
const DOTS = 'radial-gradient(circle at 50% 50%, var(--text-muted) 0.6px, transparent 0.7px)'

const L = computed(() => monthLayout(props))
const active = ref(null) // ключ подсвеченного элемента; null — подсветки нет

const factStyle = computed(() => ({ width: `${L.value.factPct}%` }))
const gapStyle = computed(() => ({
  left: `${L.value.gapStart}%`,
  width: `${L.value.gapWidth}%`,
  backgroundColor: TINT,
  backgroundImage: HATCH,
}))
const shortStyle = computed(() => ({
  left: `${L.value.shortStart}%`,
  width: `${L.value.shortWidth}%`,
  backgroundImage: DOTS,
  backgroundSize: '3px 3px',
}))
const planMark = computed(() => markStyle(L.value.planPct))
// Метка цели — только если цель НЕ верх шкалы (её кто-то перерос) ЛИБО цель
// выбрана тапом: пока она молчаливый верх шкалы, подсвечивать было бы нечего,
// и тап по «Цели» выглядел как сломанный (гасло всё, не загоралось ничто).
const goalMark = computed(() =>
  L.value.goalIsEnd && active.value !== 'goal' ? null : markStyle(L.value.goalPct),
)

// ── ПОДСВЕТКА ───────────────────────────────────────────────────────────────
// Подсвечиваем НАКОПЛЕННУЮ ДЛИНУ от нуля, а не отдельный сегмент. Причина: чип
// «Прогноз» показывает ₽4,5 млн — это ВСЯ выручка месяца по прогнозу, а не
// прирост 0,4 млн над фактом. Подсветка одного лишь приростного сегмента врала
// бы: число и подсвеченная длина обязаны совпадать. Поэтому гасим по ПОЗИЦИИ:
// всё, что начинается ЗА выбранной величиной, тускнеет; всё до неё горит.
// Высота полосы при этом НЕ меняется — размеры элементов постоянны, иначе
// перестраивается масштаб и глаз теряет опору.
const activePct = computed(() => {
  const l = L.value
  if (active.value === 'fact') return l.factPct
  if (active.value === 'forecast') return l.forecastPct
  if (active.value === 'plan') return l.planPct
  if (active.value === 'goal') return l.goalPct
  return null
})
// СЕГМЕНТ гаснет, если НАЧИНАЕТСЯ на выбранной величине или позже: он лежит
// целиком за ней. Отрезок, начавшийся раньше, входит в подсвеченную длину.
const dimFrom = (startPct) => {
  const a = activePct.value
  if (a == null || startPct == null) return ''
  return startPct > a - 1e-9 ? 'opacity-10' : ''
}
// МЕТКА гаснет только если стоит СТРОГО за величиной: метка самой выбранной
// величины обязана гореть. Для сегментов это правило не годится — там граница
// «на самой величине» означает «уже за ней».
const dimAt = (pct) => {
  const a = activePct.value
  if (a == null || pct == null) return ''
  return pct > a + 1e-9 ? 'opacity-10' : ''
}
const isOn = (key) => active.value === key
const trackClass = computed(() => ['h-3', isOn('goal') ? 'ring-2 ring-[var(--text)]' : ''])
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
    <div class="relative pb-1 pt-[7px]" role="img" :aria-label="aria">
      <div
        data-test="track"
        class="relative overflow-hidden rounded-full bg-[var(--surface-2)] transition-all duration-300"
        :class="trackClass"
      >
        <!-- ФАКТ — мера. Тёмного торца на конце БОЛЬШЕ НЕТ: границу несёт
             штриховка прогноза (3,34:1 на жёлтом), а лишняя чёрная риска
             читалась как ещё одна метка и спорила с порогом. -->
        <div
          class="absolute inset-y-0 left-0 bg-[var(--accent)] transition-all duration-500"
          :class="dimFrom(0)"
          :style="factStyle"
        ></div>
        <!-- НЕДОБОР ДО ПЛАНА — точки. Рисуем ПЕРВЫМ: он лежит под всем и просто
             заполняет пролёт от прогноза до порога, чтобы тот не читался пустым. -->
        <div
          v-if="L.shortWidth"
          data-test="seg-short"
          class="absolute inset-y-0 transition-all duration-500"
          :class="dimFrom(L.shortStart)"
          :style="shortStyle"
        ></div>
        <!-- ПРОГНОЗ — светло-жёлтая заливка со штриховкой поверх -->
        <div
          v-if="L.gapWidth"
          data-test="seg-forecast"
          class="absolute inset-y-0 transition-all duration-500"
          :class="dimFrom(L.gapStart)"
          :style="gapStyle"
        ></div>
        <!-- ЦЕЛЬ внутри шкалы — только когда её перерос прогноз или факт -->
        <div
          v-if="goalMark"
          data-test="mark-goal"
          class="absolute inset-y-0 w-[3px] bg-[var(--text)] transition-opacity"
          :class="dimAt(L.goalPct)"
          :style="goalMark"
        ></div>
      </div>
      <!-- ПЛАН — порог bullet chart: пересекает полосу сверху и снизу. Живёт НАД
           треком (вне его overflow), поэтому виден целиком. -->
      <div
        v-if="planMark"
        data-test="mark-plan"
        class="absolute inset-y-0 rounded-[1px] bg-[var(--text)] transition-all duration-300"
        :class="[dimAt(L.planPct), isOn('plan') ? 'w-[4px]' : 'w-[2.5px]']"
        :style="planMark"
      ></div>
      <!-- КАРЕТКА ПОРОГА. Без неё роль плана угадывалась по позиции: когда план
           близок к цели (Питерленд 7,5 при цели 7,7) или совпал с ней (ТЦ Июнь),
           штрих прижимался к концу шкалы и читался как утолщённый торец полосы,
           а не как метка. Позиция — переменная, форма — постоянная, поэтому роль
           обязана кодироваться формой (DESIGN-STANDARD §7.1). Треугольник сверху
           не двигает метку ни на пиксель, он делает её опознаваемой всегда. -->
      <div
        v-if="planMark"
        data-test="caret-plan"
        class="absolute top-0 h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[var(--text)] transition-opacity"
        :class="dimAt(L.planPct)"
        :style="planMark"
      ></div>
    </div>

    <div class="mt-2 flex items-start justify-between gap-1">
      <button
        v-for="c in columns"
        :key="c.key"
        type="button"
        data-test="legend-chip"
        class="flex min-w-0 flex-1 flex-col items-start gap-[3px] rounded-lg py-0.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--text-muted)]"
        :aria-pressed="active === c.key ? 'true' : 'false'"
        :aria-label="`Подсветить: ${c.label}`"
        @click="toggle(c.key)"
      >
        <span class="flex items-center gap-[5px]">
          <!-- Чип-глиф: все одного размера, внутри — то же средство, которым
               элемент нарисован на полосе (§7.6 DESIGN-STANDARD).
               ВАЖНО: у порога и эталона фон --surface-2 — это КУСОК ТРЕКА.
               Без фона они читались пустыми чекбоксами: обводка + тонкая линия
               внутри белого квадрата = «галочку забыли поставить». -->
          <i
            class="flex h-[14px] w-[14px] shrink-0 items-center overflow-hidden rounded-[4px] border transition-colors"
            :class="[
              active === c.key ? 'border-[var(--text)]' : 'border-[var(--line)]',
              c.glyph === 'cross' || c.glyph === 'end' ? 'bg-[var(--surface-2)]' : '',
            ]"
            aria-hidden="true"
          >
            <i v-if="c.glyph === 'fill'" class="h-full w-full bg-[var(--accent)]"></i>
            <i
              v-else-if="c.glyph === 'hatch'"
              class="h-full w-full"
              :style="{ backgroundColor: TINT, backgroundImage: HATCH }"
            ></i>
            <!-- ПОРОГ: стрелка вниз — та же каретка, что стоит над штрихом на
                 полосе. Стрелка нагляднее полоски: полоска в квадрате читалась
                 как «ещё один сегмент», стрелка сразу говорит «метка, указатель». -->
            <i
              v-else-if="c.glyph === 'cross'"
              class="mx-auto h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[var(--text)]"
            ></i>
            <!-- ЭТАЛОН: обводка по ПЕРИМЕТРУ изнутри, без штриха. Цель — это не
                 точка на шкале, а вся её протяжённость, и рамка говорит ровно
                 это: «весь объём целиком». -->
            <i v-else class="h-full w-full" :style="{ boxShadow: 'inset 0 0 0 1.5px var(--text)' }"></i>
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
