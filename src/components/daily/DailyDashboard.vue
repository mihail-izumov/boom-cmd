<script setup>
// Полный дашборд одного парка: композиция секций (порядок как в HTML-пультах).
import DailyLead from './DailyLead.vue'
import DailyHero from './DailyHero.vue'
import DailySignalCard from './DailySignalCard.vue'
import DailyKpis from './DailyKpis.vue'
import DailyWeeks from './DailyWeeks.vue'
import DailySummary from './DailySummary.vue'
import DailyJournal from './DailyJournal.vue'
import DailyMetrics from './DailyMetrics.vue'
import DailyCoef from './DailyCoef.vue'
import DailyActivities from './DailyActivities.vue'

// reads (D-36) — проекция payload.signal_reads: «показанный сигнал уже отмечен?».
// signals (Ф-7) — пул сигналов окна отметки СКВОЗЬ границу месяца: карточка живёт по
// окну, а не внутри одного набора парк:месяц (иначе 01.08 сигнал за 31.07 исчезал
// вместе с возможностью его отметить).
// Прокидываем сквозь дашборд, чтобы карточка не лезла за данными сама.
defineProps({
  m: { type: Object, required: true },
  reads: { type: Array, default: () => [] },
  signals: { type: Array, default: null },
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <DailyLead v-if="m.lead" :m="m" />
    <DailyHero :m="m" />
    <DailySignalCard :m="m" :reads="reads" :signals="signals" />
    <DailyKpis :m="m" />
    <DailyWeeks :m="m" />
    <DailySummary :m="m" />
    <DailyJournal :m="m" />
    <DailyMetrics :m="m" />
    <DailyCoef :m="m" />
    <DailyActivities :m="m" />
  </div>
</template>
