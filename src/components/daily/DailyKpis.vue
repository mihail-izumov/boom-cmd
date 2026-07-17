<script setup>
import { computed } from 'vue'
import { mln, ths, thsSigned, pctWhole, pctSigned, L, SIG_VAR } from '../../i18n/daily.js'
import { sigClass } from '../../composables/dailyModel.js'

// Ряд KPI. Значения монохромные; сигнал — маленькая цветная точка (не цветной текст).
const props = defineProps({ m: { type: Object, required: true } })

const tiles = computed(() => {
  const m = props.m
  const out = [
    { label: L.kpi_earned, value: mln(m.realizedRev), note: `${pctWhole(m.T ? m.realizedRev / m.T : null)} цели — ${m.realizedCount} дн из ${m.DIM}`, sig: null },
    {
      label: L.kpi_onplan,
      value: m.onPlan == null ? '—' : pctWhole(m.onPlan),
      note: m.onPlan == null ? 'нет факта' : m.onPlan >= 1 ? 'опережаем план по прошедшим дням' : 'отстаём по прошедшим дням',
      sig: m.onPlan == null ? null : sigClass(m.onPlan),
    },
    {
      label: L.kpi_tail,
      value: thsSigned(-m.tailCum),
      note: m.tailCum > 0 ? `по +${ths(m.spread)} к плану каждого из оставшихся дней` : `идём с запасом (≈ −${ths(m.spread)}/день)`,
      sig: m.tailCum > 0 ? 'bad' : 'good',
    },
  ]
  if (m.futureCount && m.needPerDay > 0) {
    out.push({
      label: L.kpi_pace,
      value: `${ths(m.needPerDay)}/день`,
      note: `текущий ~${ths(m.currentPace)}/день · нужен ${pctSigned(m.paceGap)}`,
      sig: m.paceGap > 0.05 ? 'bad' : m.paceGap > 0.001 ? 'warn' : 'good',
    })
  }
  return out
})
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <div v-for="(t, i) in tiles" :key="i" class="flex flex-col gap-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <span class="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ t.label }}</span>
      <span class="flex items-center gap-1.5">
        <i v-if="t.sig" class="inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: SIG_VAR[t.sig] }" />
        <span class="text-[1.25rem] font-semibold leading-tight text-[var(--text)]">{{ t.value }}</span>
      </span>
      <span class="text-[0.75rem] leading-snug text-[var(--text-muted)]">{{ t.note }}</span>
    </div>
  </div>
</template>
