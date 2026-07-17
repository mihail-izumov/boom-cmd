<script setup>
import { mln, pctSigned, L, SIG_VAR } from '../../i18n/daily.js'
import { PARKS_BY_ID } from '../../data/parks.js'

// «Вся сеть»: мини-карта по каждому парку (цель/факт/прогноз/достижимость) + сетевые суммы.
// Цели/факты суммируются; прогноз = Σ по-парковых (каждый со своим coef). Незрелые coef — чип «допущение».
const props = defineProps({ net: { type: Object, required: true } })
const nameOf = (c) => PARKS_BY_ID[c.park]?.name || c.parkName || c.park
const pctW = (c) => Math.min(100, (c.landing / (c.target || 1)) * 100)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- сетевые суммы -->
    <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div class="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div class="text-[0.75rem] text-[var(--text-muted)]">{{ L.net_target }}</div>
          <div class="text-[1.75rem] font-bold leading-none tracking-tight text-[var(--text)]">{{ mln(net.totals.target) }}</div>
        </div>
        <div>
          <div class="text-[0.75rem] text-[var(--text-muted)]">{{ L.net_forecast }}</div>
          <div class="flex items-center gap-2">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :style="{ background: SIG_VAR[net.totals.fcSig] }" />
            <span class="text-[1.375rem] font-bold leading-none tracking-tight text-[var(--text)]">{{ mln(net.totals.landing) }}</span>
            <span class="text-[0.875rem] font-semibold text-[var(--text-secondary)]">{{ pctSigned(net.totals.landDev) }}</span>
          </div>
        </div>
        <div class="ml-auto text-right">
          <div class="text-[0.75rem] text-[var(--text-muted)]">{{ L.net_earned }}</div>
          <div class="text-[1.25rem] font-bold text-[var(--text)]">{{ mln(net.totals.earned) }}</div>
        </div>
      </div>
      <p v-if="net.totals.anyAssume" class="mt-3 text-[0.6875rem] text-[var(--text-muted)]">Часть парков — на предварительных коэффициентах ({{ L.assume }}); прогноз ориентировочный.</p>
    </div>

    <!-- по паркам -->
    <div v-for="c in net.cards" :key="c.park" class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div class="mb-2 flex items-center gap-2">
        <span class="font-semibold text-[var(--text)]">{{ nameOf(c) }}</span>
        <span v-if="c.assume" class="rounded border border-dashed border-[var(--warning)] px-1.5 py-0.5 text-[0.625rem] text-[var(--text-muted)]">{{ L.assume }}</span>
        <span class="ml-auto flex items-center gap-1 text-[0.75rem] text-[var(--text-muted)]">
          <i class="inline-block h-2 w-2 rounded-full" :style="{ background: c.achievable ? 'var(--positive)' : 'var(--negative)' }" />
          {{ c.achievable ? L.achievable : L.not_achievable }}
        </span>
      </div>
      <div class="relative mb-2 h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: pctW(c) + '%', background: SIG_VAR[c.fcSig] }" />
      </div>
      <div class="flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
        <span>цель <b class="font-semibold text-[var(--text)]">{{ mln(c.target) }}</b></span>
        <span>заработано <b class="font-semibold text-[var(--text)]">{{ mln(c.earned) }}</b></span>
        <span>прогноз <b class="font-semibold text-[var(--text)]">{{ mln(c.landing) }}</b> <span class="text-[var(--text-secondary)]">{{ pctSigned(c.landDev) }}</span></span>
      </div>
    </div>
  </div>
</template>
