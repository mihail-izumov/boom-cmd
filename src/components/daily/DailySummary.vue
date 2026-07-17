<script setup>
import { mln, pctSigned, L, SIG_VAR } from '../../i18n/daily.js'
import { sigClass } from '../../composables/dailyModel.js'

// Сводка по неделям (полоса+суммы+дельта) · строка «Месяц» (прогноз к цели) ·
// распределение полных дней по sigClass (выше/близко/ниже). Полосы цветные, текст монохром.
const props = defineProps({ m: { type: Object, required: true } })
const wSig = (w) => sigClass(w.ratio)
</script>

<template>
  <section>
    <h2 class="mb-3 mt-4 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{{ L.summary }}</h2>
    <div class="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div
        v-for="w in m.weeks"
        :key="w.idx"
        class="grid items-center gap-3 border-t border-[var(--line)] px-4 py-2.5 text-[0.8125rem] first:border-t-0"
        style="grid-template-columns: 96px 1fr 92px 64px"
      >
        <div class="font-semibold text-[var(--text)]">
          Неделя {{ w.idx }}<span class="block text-[0.6875rem] font-normal text-[var(--text-muted)]">{{ w.from }}–{{ w.to }}</span>
        </div>
        <div class="relative h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: w.faWidth + '%', background: SIG_VAR[wSig(w)] }" />
        </div>
        <div class="text-right [font-variant-numeric:tabular-nums] text-[var(--text-muted)]">
          <template v-if="w.hasFact"><b class="font-semibold text-[var(--text)]">{{ mln(w.fact) }}</b></template>
          <template v-else><span class="text-[var(--text-muted)]">ждём</span></template>
          <span class="block text-[0.625rem]">план {{ mln(w.plan) }}</span>
        </div>
        <div class="text-right font-bold [font-variant-numeric:tabular-nums] text-[var(--text-secondary)]">{{ w.hasFact ? pctSigned(w.delta / (w.partOfPlan || 1)) : '—' }}</div>
      </div>

      <!-- Месяц -->
      <div class="grid items-center gap-3 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-[0.8125rem] font-bold" style="grid-template-columns: 96px 1fr 92px 64px">
        <div class="text-[var(--text)]">{{ L.month }}</div>
        <div class="relative h-3 overflow-hidden rounded-full bg-[var(--surface)]">
          <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: m.landPct + '%', background: SIG_VAR[m.fcSig] }" />
        </div>
        <div class="text-right [font-variant-numeric:tabular-nums] text-[var(--text)]">
          {{ mln(m.landing) }}<span class="block text-[0.625rem] font-normal text-[var(--text-muted)]">цель {{ mln(m.T) }}</span>
        </div>
        <div class="text-right [font-variant-numeric:tabular-nums] text-[var(--text)]">{{ pctSigned(m.landDev) }}</div>
      </div>

      <!-- распределение дней -->
      <div v-if="m.dayStats" class="border-t border-[var(--line)] px-4 py-3">
        <div class="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{{ L.days_by_plan }} <span class="font-normal">· факт — {{ m.dayStats.total }} дн</span></div>
        <div class="flex h-4 gap-0.5 overflow-hidden rounded-lg bg-[var(--surface-2)]">
          <i v-if="m.dayStats.good" :style="{ width: m.dayStats.pctGood + '%', background: 'var(--positive)' }" />
          <i v-if="m.dayStats.warn" :style="{ width: m.dayStats.pctWarn + '%', background: 'var(--warning)' }" />
          <i v-if="m.dayStats.bad" :style="{ width: m.dayStats.pctBad + '%', background: 'var(--negative)' }" />
        </div>
        <div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-[var(--text-muted)]">
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background: var(--positive)" /><b class="font-semibold text-[var(--text)]">{{ m.dayStats.good }}</b> {{ L.above }} · {{ m.dayStats.pctGood }}%</span>
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background: var(--warning)" /><b class="font-semibold text-[var(--text)]">{{ m.dayStats.warn }}</b> {{ L.close }} · {{ m.dayStats.pctWarn }}%</span>
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background: var(--negative)" /><b class="font-semibold text-[var(--text)]">{{ m.dayStats.bad }}</b> {{ L.below }} · {{ m.dayStats.pctBad }}%</span>
        </div>
      </div>
    </div>
  </section>
</template>
