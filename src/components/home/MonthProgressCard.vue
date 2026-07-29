<script setup>
import { computed, ref } from 'vue'
import MonthProgressSlide from './MonthProgressSlide.vue'
import { monthCap, plural } from '../../i18n/home.js'

// Дека месяца (D-34) — свайп-карусель «где месяц» В РУБЛЯХ И ДНЯХ.
// Экран 1 — вся сеть, дальше по экрану на парк. Заголовок слайда называет,
// чьи это числа; точки внизу показывают, сколько экранов.
//
// Зачем отдельно от двух виджетов ниже: те дают ТОЛЬКО проценты по сети
// (План/Факт · Прогноз/План). Здесь ни одного процента — рубли, дни и разрез
// по паркам, которого на Главной не было вовсе.
//
// ПОЧЕМУ УБРАНЫ ПИЛЮЛИ-ПАРКИ над картой. Строка «Июль 2026: Охта Молл ·
// Питерленд · ТЦ Июнь» отвечала на вопрос «чьи это числа» — ровно то, что
// теперь говорит заголовок слайда, причём точнее: пилюли перечисляли парки, но
// числа показывали только сетевые, и связь была обманчивой. Месяц переехал в
// шапку деки. Фильтр по паркам живёт внутри разделов — на Главной он не нужен.
//
// Один парк в данных → сетевой слайд не заводим (сеть = этот парк) и точки
// прячем: карусель из одного экрана — обман интерфейса.

const props = defineProps({
  slides: { type: Array, default: () => [] }, // [{ key, title, fact, plan, forecast, goal, daysDone, daysTotal }]
  month: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

const idx = ref(0)
const track = ref(null)

const many = computed(() => props.slides.length > 1)
const current = computed(() => props.slides[Math.min(idx.value, props.slides.length - 1)] || null)
const monthLabel = computed(() => (props.month ? monthCap(props.month) : ''))

// Бейдж считает ОСТАВШИЕСЯ дни, а не пройденные: «прошло 27 из 31» — констатация,
// «осталось 4 дня» — то, чем можно распорядиться. Месяц закрыт → так и пишем:
// «осталось 0» читалось бы как ошибка, а не как завершённый месяц.
const daysBadge = computed(() => {
  const c = current.value
  if (!c || c.daysDone == null || !c.daysTotal) return ''
  const left = Math.max(0, c.daysTotal - c.daysDone)
  if (left === 0) return 'Месяц закрыт'
  return `Осталось ${left} ${plural(left, ['день', 'дня', 'дней'])}`
})

// Индекс активного экрана — из позиции прокрутки. Слушаем сам scroll, а не
// касания: так одинаково работают свайп на iOS, трекпад на десктопе и
// программная прокрутка по тапу в точку.
function onScroll(e) {
  const el = e.target
  const w = el.clientWidth || 1
  idx.value = Math.max(0, Math.min(props.slides.length - 1, Math.round(el.scrollLeft / w)))
}
function goTo(i) {
  idx.value = i
  const el = track.value
  if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
}
</script>

<template>
  <section class="rounded-[22px] bg-[var(--surface)] px-4 pb-3 pt-3 shadow-sm">
    <!-- Шапка. Главное — МЕСЯЦ: карта про месяц, а парк лишь уточняет, чей срез.
         Парк второй строкой. Остаток дней — бейджем справа. -->
    <div class="mb-2.5 flex items-start justify-between gap-2">
      <template v-if="loading">
        <span class="flex flex-col gap-1.5">
          <span class="bc-skeleton block h-[16px] w-[96px] rounded"></span>
          <span class="bc-skeleton block h-[12px] w-[68px] rounded"></span>
        </span>
        <span class="bc-skeleton h-[20px] w-[92px] rounded-full"></span>
      </template>
      <template v-else>
        <span class="flex min-w-0 flex-col">
          <h3 class="truncate text-[0.9375rem] font-bold leading-tight text-[var(--text)]">{{ monthLabel || '—' }}</h3>
          <span data-test="month-deck-scope" class="truncate text-[0.6875rem] text-[var(--text-muted)]">{{ current?.title || '' }}</span>
        </span>
        <span
          v-if="daysBadge"
          data-test="month-deck-days"
          class="shrink-0 whitespace-nowrap rounded-full bg-[var(--surface-2)] px-2 py-[3px] text-[0.6875rem] font-semibold text-[var(--text-secondary)]"
        >{{ daysBadge }}</span>
      </template>
    </div>

    <!-- Пока грузится — статичный скелетон вместо карусели: пустая лента со
         снапом ловит жесты и ведёт себя как сломанная. -->
    <div v-if="loading" class="flex flex-col gap-2">
      <span class="bc-skeleton h-3.5 w-full rounded-full"></span>
      <span class="bc-skeleton mt-1 h-[30px] w-full rounded"></span>
    </div>

    <div
      v-else
      ref="track"
      data-test="month-deck-track"
      class="bc-deck flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      role="group"
      aria-roledescription="карусель"
      aria-label="Месяц по паркам"
      @scroll.passive="onScroll"
    >
      <div
        v-for="(s, i) in slides"
        :key="s.key"
        class="w-full shrink-0 snap-center"
        role="group"
        aria-roledescription="слайд"
        :aria-label="`${s.title}, ${i + 1} из ${slides.length}`"
      >
        <MonthProgressSlide :fact="s.fact" :plan="s.plan" :forecast="s.forecast" :goal="s.goal" />
      </div>
    </div>

    <!-- Точки — сколько экранов и где мы. Тап доводит до экрана; область тапа
         растянута паддингом до 44pt по высоте строки (HIG), сама точка мелкая. -->
    <div v-if="!loading && many" class="mt-2 flex items-center justify-center gap-1.5" data-test="month-deck-dots">
      <button
        v-for="(s, i) in slides"
        :key="s.key"
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-muted)]"
        :aria-label="`Показать: ${s.title}`"
        :aria-current="i === idx ? 'true' : undefined"
        @click="goTo(i)"
      >
        <span
          class="h-[6px] w-[6px] rounded-full transition-colors"
          :class="i === idx ? 'bg-[var(--text)]' : 'bg-[var(--line)]'"
        ></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* Полосу прокрутки прячем — навигация жестом и точками. */
.bc-deck { scrollbar-width: none; }
.bc-deck::-webkit-scrollbar { display: none; }
</style>
