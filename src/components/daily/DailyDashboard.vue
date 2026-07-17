<script setup>
// Полный дашборд одного парка: композиция секций (порядок как в HTML-пультах).
import DailyLead from './DailyLead.vue'
import DailyHero from './DailyHero.vue'
import DailyKpis from './DailyKpis.vue'
import DailyWeeks from './DailyWeeks.vue'
import DailySummary from './DailySummary.vue'
import DailyJournal from './DailyJournal.vue'
import DailyMetrics from './DailyMetrics.vue'
import DailyCoef from './DailyCoef.vue'
import DailyActivities from './DailyActivities.vue'

defineProps({ m: { type: Object, required: true } })
</script>

<template>
  <div class="flex flex-col gap-3">
    <DailyLead v-if="m.lead" :m="m" />
    <DailyHero :m="m" />
    <DailyKpis :m="m" />
    <DailyWeeks :m="m" />
    <DailySummary :m="m" />
    <DailyJournal :m="m" />
    <DailyMetrics :m="m" />
    <DailyCoef :m="m" />
    <DailyActivities :m="m" />
  </div>
</template>
