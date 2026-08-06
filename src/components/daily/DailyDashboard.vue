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
import DailyDrivers from './DailyDrivers.vue'

// reads (D-36) — проекция payload.signal_reads: «показанный сигнал уже отмечен?».
// signals (Ф-7) — пул сигналов окна отметки СКВОЗЬ границу месяца: карточка живёт по
// окну, а не внутри одного набора парк:месяц (иначе 01.08 сигнал за 31.07 исчезал
// вместе с возможностью его отметить).
// Прокидываем сквозь дашборд, чтобы карточка не лезла за данными сама.
defineProps({
  m: { type: Object, required: true },
  reads: { type: Array, default: () => [] },
  signals: { type: Array, default: null },
  // Чипы статусов драйверов парка — считает экран (общий driversModel с разделом).
  driverStatuses: { type: Array, default: () => [] },
})

// Переход в раздел «Драйверы роста» этого парка (§3.3). Дашборд его не выполняет,
// а прокидывает наверх: навигация — дело экрана, не секции.
const emit = defineEmits(['open-drivers'])
</script>

<template>
  <div class="flex flex-col gap-3">
    <DailyLead v-if="m.lead" :m="m" />
    <DailyHero :m="m" />
    <DailySignalCard :m="m" :reads="reads" :signals="signals" />
    <DailyKpis :m="m" />
    <!-- вход в «Драйверы роста» стоит НАД таблицей дней (§3.1) -->
    <DailyDrivers :m="m" :statuses="driverStatuses" @open="emit('open-drivers')" />
    <DailyWeeks :m="m" @open-drivers="emit('open-drivers')" />
    <DailySummary :m="m" />
    <DailyJournal :m="m" />
    <DailyMetrics :m="m" />
    <DailyCoef :m="m" />
  </div>
</template>
