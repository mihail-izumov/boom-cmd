<script setup>
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { mlnRub } from '../../i18n/home.js'

// Один экран деки месяца (D-34): две дорожки + подписи. Шелл карты, свайп и точки —
// в MonthProgressCard.vue; здесь только содержимое одного парка (или всей сети).
//
// ДОРОЖКА ВРЕМЕНИ — тонкая серая: сколько дней месяца закрыто.
// ДОРОЖКА ДЕНЕГ:
//   сплошная жёлтая  — ФАКТ месяца (накоплено по закрытым дням, не за день);
//   серая ШТРИХОВКА  — сколько доберём к прогнозу при текущем темпе;
//   серая риска      — ПЛАН (обязательство, порог а не отрезок);
//   толстая тёмная   — ЦЕЛЬ (амбиция).
// Штриховка — конвенция прогресс-баров «сплошное = есть, штрих = ожидаемое»:
// прогноз становится площадью, и видно два разных дефицита — сколько доберём
// по инерции и сколько после этого всё равно не хватит до плана.
//
// СОСТОЯНИЯ ПОРОГОВ — спроектированы явно, см. блок ниже по коду:
//   цель = плану       → одна метка и одна колонка «План и цель»;
//   порог взят фактом  → галочка у колонки;
//   факт перерос цель  → шкала растягивается до факта, метка цели уходит внутрь.
//
// Дизайн: жёлтый — только заливка (DESIGN-STANDARD §3.3), всё остальное монохром.

const props = defineProps({
  fact: { type: Number, default: null },
  plan: { type: Number, default: null },
  forecast: { type: Number, default: null },
  goal: { type: Number, default: null },
  daysDone: { type: Number, default: null },
  daysTotal: { type: Number, default: null },
})

const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)

const fact = computed(() => num(props.fact))
const plan = computed(() => num(props.plan))
const forecast = computed(() => num(props.forecast))
const goal = computed(() => num(props.goal))

// Верх шкалы — максимум из всех четырёх, а не «цель»: прогноз может перерасти
// цель (хороший месяц), и фиксация на цели увела бы маркер за край.
const scaleMax = computed(() => {
  const vals = [fact.value, plan.value, forecast.value, goal.value].filter((v) => v != null && v > 0)
  return vals.length ? Math.max(...vals) : 0
})
const pos = (v) => {
  const m = scaleMax.value
  if (!m || v == null) return null
  return Math.max(0, Math.min(100, (v / m) * 100))
}

const factPct = computed(() => pos(fact.value) ?? 0)
const planPct = computed(() => pos(plan.value))
const forecastPct = computed(() => pos(forecast.value))
const goalPct = computed(() => pos(goal.value))
// landing по построению ≥ realizedRev, но отрицательную ширину не пускаем.
const forecastGap = computed(() =>
  forecastPct.value == null ? 0 : Math.max(0, forecastPct.value - factPct.value),
)
// Риску цели центрируем по значению, но у края шкалы прижимаем внутрь, иначе
// половина её 3px уедет за overflow-hidden. Считаем в JS, а не через CSS min():
// так позиция проверяема в приёмке.
const goalStyle = computed(() => ({
  left: `${goalPct.value}%`,
  transform: goalPct.value >= 99.9 ? 'translateX(-100%)' : 'translateX(-50%)',
}))

const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 3px, var(--text-muted) 3px 4px)'

const timePct = computed(() => {
  const d = num(props.daysDone), t = num(props.daysTotal)
  if (!t || d == null) return 0
  return Math.max(0, Math.min(100, (d / t) * 100))
})

// ── СОСТОЯНИЯ ПОРОГОВ (спроектированы, а не «как отрисуется») ───────────────
//
// 1. ЦЕЛЬ СОВПАЛА С ПЛАНОМ. Штатный случай, а не сбой: у парка без планировщика
//    цель приравнивается к плану решением владельца (так сейчас у ТЦ Июнь).
//    Тогда две риски встают в одну точку — верхняя прячет нижнюю, а в легенде
//    появляются две колонки с одинаковым числом, что читается как ошибка данных.
//    Решение: схлопываем в ОДНУ метку и ОДНУ колонку «План и цель». Схлопываем
//    только при ТОЧНОМ равенстве — сближать разные числа значило бы врать.
const planIsGoal = computed(
  () => plan.value != null && goal.value != null && plan.value === goal.value,
)

// 2. ПОРОГ ВЗЯТ ФАКТОМ. Достижение — полноценное состояние, его надо показать,
//    а не оставлять читателю сравнение позиций. Отмечаем галочкой у колонки.
//    Взятие ПРОГНОЗОМ отдельным знаком не метим: штриховка, дотянувшаяся до
//    риски, уже говорит «дойдём», а второй индикатор на то же самое размывал бы
//    разницу между «сделано» и «должно получиться».
const done = (v) => v != null && fact.value != null && fact.value >= v

// Колонки — в порядке следования по шкале, чтобы глаз связывал подпись с меткой
// без легенды. Значения нет (цель не задана) → колонки просто нет.
const columns = computed(() => {
  const raw = planIsGoal.value
    ? [
        { key: 'fact', label: 'Факт', value: fact.value, glyph: 'fill' },
        { key: 'forecast', label: 'Прогноз', value: forecast.value, glyph: 'hatch' },
        { key: 'planGoal', label: 'План и цель', value: goal.value, glyph: 'end', done: done(goal.value) },
      ]
    : [
        { key: 'fact', label: 'Факт', value: fact.value, glyph: 'fill' },
        { key: 'forecast', label: 'Прогноз', value: forecast.value, glyph: 'hatch' },
        { key: 'plan', label: 'План', value: plan.value, glyph: 'solid', done: done(plan.value) },
        { key: 'goal', label: 'Цель', value: goal.value, glyph: 'end', done: done(goal.value) },
      ]
  return raw.filter((c) => c.value != null).sort((a, b) => a.value - b.value)
})

// Полоса с метками сама по себе недоступна — дублируем смысл строкой, включая
// состояние «взято»: без него скринридер получит числа, но не результат.
const aria = computed(() =>
  columns.value.length
    ? columns.value.map((c) => `${c.label} ${mlnRub(c.value)}${c.done ? ' — взято' : ''}`).join(', ')
    : 'Данных по месяцу нет',
)
</script>

<template>
  <div>
    <div class="h-1 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden="true">
      <div
        class="h-full rounded-full bg-[var(--text-muted)] transition-[width] duration-500"
        :style="{ width: timePct + '%' }"
      ></div>
    </div>

    <div class="relative mt-2 h-3.5 overflow-hidden rounded-full bg-[var(--surface-2)]" role="img" :aria-label="aria">
      <!-- ФАКТ. Жёлтый на треке — всего 1,36:1 (посчитано по WCAG), на границу
           заливки полагаться нельзя, поэтому конец факта помечен тёмной риской:
           смысл несёт она, заливка только подкрепляет. -->
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-500"
        :style="{ width: factPct + '%' }"
      ></div>
      <!-- ПРОГНОЗ — штрихованный отрезок «доберём при текущем темпе» -->
      <div
        v-if="forecastGap"
        class="absolute inset-y-0 transition-[left,width] duration-500"
        :style="{ left: factPct + '%', width: forecastGap + '%', backgroundImage: HATCH }"
      ></div>
      <div
        class="absolute inset-y-0 w-[2px] -translate-x-full bg-[var(--text)] transition-[left] duration-500"
        :style="{ left: factPct + '%' }"
      ></div>
      <div
        v-if="forecastPct != null"
        class="absolute inset-y-0 w-[2px] -translate-x-full bg-[var(--graphite)]"
        :style="{ left: forecastPct + '%' }"
      ></div>
      <!-- ПЛАН — порог. Совпал с целью → не рисуем: метку ставит цель (см. §1). -->
      <div
        v-if="planPct != null && !planIsGoal"
        class="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-[var(--text-muted)]"
        :style="{ left: planPct + '%' }"
      ></div>
      <!-- ЦЕЛЬ — «финиш»: самая тёмная и толстая -->
      <div v-if="goalPct != null" class="absolute inset-y-0 w-[3px] bg-[var(--text)]" :style="goalStyle"></div>
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
          <!-- Порог взят фактом. Монохромная галочка, не зелёная: цвет в этой карте
               несёт только жёлтый-заливка, светофор живёт в «Контроле Дня». -->
          <Check
            v-if="c.done"
            class="h-3 w-3 shrink-0 text-[var(--text)]"
            :stroke-width="3"
            aria-hidden="true"
          />
        </span>
        <span class="text-[0.8125rem] font-semibold leading-none text-[var(--text)]">{{ mlnRub(c.value) }}</span>
      </div>
      <!-- Цели нет → колонок три. Пустой распорки не добавляем: колонки flex-1,
           они честно разъезжаются, а фантомная четвёртая читалась бы как «потеряли». -->
    </div>
  </div>
</template>
