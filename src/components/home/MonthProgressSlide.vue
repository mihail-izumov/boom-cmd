<script setup>
import { computed, ref, watch } from 'vue'
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
  // Счётчик-сигнал от деки: сменился — снять подсветку. Дека дёргает его при
  // свайпе и тапе в точку: выделение относится к КОНКРЕТНОЙ полосе, и таскать
  // его за собой на соседний парк — врать про то, что выбрано.
  resetToken: { type: Number, default: 0 },
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
// ПРОГНОЗ — светло-жёлтая заливка + мелкая ТОЧЕЧНАЯ сыпь: «почти как факт,
// но ещё не осязаемо». НЕДОБОР — подложка темнее трека + ПОЛОСКИ: штриховка
// жёстче точек, и зона «сколько ещё нужно» должна читаться жёстче ожидаемого.
const DOTS = 'radial-gradient(circle at 50% 50%, var(--text-muted) 0.45px, transparent 0.55px)'
const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 2px, var(--text-muted) 2px 3px)'
// Подложка недобора: чуть темнее трека, иначе у зоны не читаются верхняя и
// нижняя границы и пролёт выглядит пустым.
const SHORT_BG = 'color-mix(in srgb, var(--line) 75%, var(--surface-2))'

const L = computed(() => monthLayout(props))
const active = ref(null) // ключ подсвеченного элемента; null — подсветки нет

const factStyle = computed(() => ({ width: `${L.value.factPct}%` }))
const gapStyle = computed(() => ({
  left: `${L.value.gapStart}%`,
  width: `${L.value.gapWidth}%`,
  backgroundColor: TINT,
  backgroundImage: DOTS,
  backgroundSize: '2.5px 2.5px',
}))
const shortStyle = computed(() => ({
  left: `${L.value.shortStart}%`,
  width: `${L.value.shortWidth}%`,
  backgroundColor: SHORT_BG,
  backgroundImage: HATCH,
}))
const planMark = computed(() => markStyle(L.value.planPct))

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
// Обводим трек, когда выбранная величина равна ВСЕЙ шкале. Привязка к ключу
// 'goal' была багом: у парка без планировщика колонка называется «План и цель»
// и живёт под ключом 'plan' — обводка не включалась, хотя выбрана вся шкала.
// Правильный признак — позиция, а не имя.
const wholeScale = computed(() => activePct.value != null && activePct.value >= 99.999)
// Метка цели — ТОЛЬКО если цель не верх шкалы (её кто-то перерос). Когда цель
// и есть верх, метки нет даже при выборе: подсветку берёт на себя обводка всей
// шкалы, а метка поверх неё читалась как артефакт у правого края.
const goalMark = computed(() => (L.value.goalIsEnd ? null : markStyle(L.value.goalPct)))
function toggle(key) {
  active.value = active.value === key ? null : key
}
watch(() => props.resetToken, () => { active.value = null })

// Колонки — в порядке следования по шкале, чтобы глаз связывал подпись с элементом.
// Значения нет (цель не задана) → колонки просто нет.
//
// СОВПАВШИЕ ВЕЛИЧИНЫ СХЛОПЫВАЮТСЯ В ОДНУ КОЛОНКУ. Две подписи с одинаковым
// числом читаются как ошибка данных: в ТЦ Июнь рядом стояли «Прогноз ₽3,0 млн»
// и «План и цель ₽3,0 млн». Схлопываем ТОЛЬКО при точном равенстве — сближать
// разные числа значило бы врать. Раньше это было частным случаем «план = цель»;
// теперь правило общее и покрывает любое совпадение.
const ROLE = { forecast: 1, fact: 2, plan: 3, goal: 4 } // чей глиф побеждает в группе
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)

const columns = computed(() => {
  const l = L.value
  const base = [
    { key: 'fact', name: 'факт', value: props.fact, glyph: 'fill' },
    { key: 'forecast', name: 'прогноз', value: props.forecast, glyph: 'hatch' },
    { key: 'plan', name: 'план', value: props.plan, glyph: 'cross', done: l.reachedPlan },
    { key: 'goal', name: 'цель', value: props.goal, glyph: 'end', done: l.reachedGoal },
  ].filter((c) => c.value != null)

  const groups = new Map()
  for (const c of base) {
    if (!groups.has(c.value)) groups.set(c.value, [])
    groups.get(c.value).push(c)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, items]) => {
      const names = items.map((x) => x.name)
      // «План и цель» · «Прогноз, план и цель» — перечисление с «и» перед последним
      const label = names.length === 1
        ? cap(names[0])
        : cap(`${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`)
      const lead = items.reduce((a, b) => (ROLE[b.key] > ROLE[a.key] ? b : a))
      return {
        key: lead.key, label, value, glyph: lead.glyph,
        done: items.some((x) => x.done),
      }
    })
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
    <div class="relative pb-1 pt-[10px]" role="img" :aria-label="aria">
      <div
        data-test="track"
        class="relative h-3 overflow-hidden rounded-full bg-[var(--surface-2)]"
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
        <!-- ВЫБРАНА ВСЯ ШКАЛА — обводим её изнутри, последним слоем поверх сегментов -->
        <div
          v-if="wholeScale"
          data-test="scale-ring"
          class="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-[var(--text)]"
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
        class="absolute bottom-[1px] top-[7px] w-[2px] rounded-[1px] bg-[var(--text)] transition-opacity"
        :class="dimAt(L.planPct)"
        :style="planMark"
      ></div>
      <!-- КАРЕТКА ПОРОГА. Без неё роль плана угадывалась по позиции: когда план
           близок к цели (Питерленд 7,5 при цели 7,7) или совпал с ней (ТЦ Июнь),
           штрих прижимался к концу шкалы и читался как утолщённый торец полосы,
           а не как метка. Позиция — переменная, форма — постоянная, поэтому роль
           обязана кодироваться формой (DESIGN-STANDARD §7.1). Треугольник сверху
           не двигает метку ни на пиксель, он делает её опознаваемой всегда. -->
      <svg
        v-if="planMark"
        data-test="caret-plan"
        class="absolute top-0 h-[5px] w-[9px] transition-opacity"
        :class="dimAt(L.planPct)"
        :style="planMark"
        viewBox="0 0 9 5"
        aria-hidden="true"
      >
        <!-- Треугольник рисуем SVG'шкой, а не CSS-бордерами: у бордерного
             треугольника углы скруглить нечем, и он выбивался из стиля
             остальных элементов (у штриха и чипов углы мягкие). -->
        <path
          d="M1.6 1.2 H7.4 L4.5 3.8 Z"
          fill="var(--text)"
          stroke="var(--text)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <div class="mt-2 flex items-start justify-between gap-1">
      <button
        v-for="c in columns"
        :key="c.key"
        type="button"
        data-test="legend-chip"
        class="flex min-w-0 flex-1 flex-col items-start gap-[3px] rounded-lg px-1 py-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--text-muted)]"
        :class="active === c.key ? 'bg-[var(--surface-2)]' : ''"
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
            class="flex h-[14px] w-[14px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border transition-colors"
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
              :style="{ backgroundColor: TINT, backgroundImage: DOTS, backgroundSize: '2.5px 2.5px' }"
            ></i>
            <!-- ПОРОГ: полоски — та же фактура, что у зоны недобора на полосе.
                 Чип обозначает не саму риску, а путь до плана: именно эта зона
                 «сколько ещё нужно» и есть содержание колонки. -->
            <i
              v-else-if="c.glyph === 'cross'"
              class="h-full w-full"
              :style="{ backgroundColor: SHORT_BG, backgroundImage: HATCH }"
            ></i>
            <!-- ЭТАЛОН: рамка внутри чипа. Цель — не точка на шкале, а вся её
                 протяжённость, рамка говорит ровно это. Квадрат МЕНЬШЕ чипа и
                 со своим скруглением: во всю ширину его углы срезала обводка
                 чипа и он выглядел обкусанным. -->
            <i v-else class="h-2 w-2 rounded-[2px] border-[1.5px] border-[var(--text)]"></i>
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
