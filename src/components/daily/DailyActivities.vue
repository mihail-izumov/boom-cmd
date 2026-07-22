<script setup>
import { computed } from 'vue'
import { pctSigned, dayGen, actCode, L, SIG_VAR } from '../../i18n/daily.js'

// Активности/гипотезы: бейдж кода + дни + результат к плану по этим дням.
// v2.2 §3: бейдж — короткий код (суффикс после последнего дефиса), display-only.
const props = defineProps({ m: { type: Object, required: true } })
const monthGen = computed(() => dayGen('', props.m.month).trim()) // «июля»
function resultText(a) {
  if (typeof a.result === 'number') return pctSigned(a.result) + ' к плану'
  return a.result === 'ongoing' ? 'идёт' : 'впереди'
}
</script>

<template>
  <section v-if="m.activities.length">
    <h2 class="mb-3 mt-4 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{{ L.activities }}</h2>
    <div class="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div v-for="(a, i) in m.activities" :key="i" class="flex items-center gap-3 border-t border-[var(--line)] px-4 py-2.5 text-[0.8125rem] first:border-t-0">
        <span class="shrink-0 rounded-md bg-[var(--text)] px-2 py-0.5 text-[0.6875rem] font-bold text-[var(--ink-on-color)]">{{ actCode(a.code) }}</span>
        <div class="flex-1">
          <div class="text-[var(--text)]">{{ a.name }}</div>
          <div class="text-[0.6875rem] text-[var(--text-muted)]">дни: {{ a.days.join(', ') }} {{ monthGen }}</div>
        </div>
        <span class="flex shrink-0 items-center gap-1.5 text-right font-semibold [font-variant-numeric:tabular-nums] text-[var(--text)]">
          <i class="inline-block h-2 w-2 rounded-full" :style="{ background: SIG_VAR[a.sig] }" />
          {{ resultText(a) }}
        </span>
      </div>
    </div>
  </section>
</template>
