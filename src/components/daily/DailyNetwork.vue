<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { mln, pctSigned, L, SIG_VAR, GOAL_STATE, ddmm } from '../../i18n/daily.js'
import { signalDot } from '../../composables/dailySignals.js'
import { PARKS_BY_ID } from '../../data/parks.js'
import { useParkContext } from '../../composables/useParkContext.js'

// «Вся сеть»: сетевые суммы + мини-карта по каждому парку.
// v1.1: устойчивая сетка в суммах (без flex-wrap+ml-auto); карты парков кликабельны
// (тап → setPark(c.park) → полный дашборд парка). Карта сумм не кликабельна.
const props = defineProps({ net: { type: Object, required: true } })
const { setPark } = useParkContext()
const nameOf = (c) => PARKS_BY_ID[c.park]?.name || c.parkName || c.park
const pctW = (c) => Math.min(100, (c.landing / (c.target || 1)) * 100)
// v2.1 §5: три состояния достижимости — по каждой карточке парка из её модели
const gsOf = (c) => GOAL_STATE[c.goalState] || GOAL_STATE.ok
// v3: миниатюры «Сигналы дня» — только парки, у которых есть актуальный сигнал
const signalCards = computed(() => props.net.cards.filter((c) => c.signal))
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- сетевые суммы (не кликабельны) -->
    <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div>
        <div class="text-[0.75rem] text-[var(--text-muted)]">{{ L.net_target }}</div>
        <div class="text-[1.75rem] font-bold leading-none tracking-tight text-[var(--text)]">{{ mln(net.totals.target) }}</div>
      </div>
      <div class="mt-3 grid grid-cols-2 items-start gap-4">
        <div class="min-w-0">
          <div class="text-[0.75rem] text-[var(--text-muted)]">{{ L.net_forecast }}</div>
          <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: SIG_VAR[net.totals.fcSig] }" />
            <span class="text-[1.375rem] font-bold leading-none tracking-tight text-[var(--text)]">{{ mln(net.totals.landing) }}</span>
            <span class="text-[0.875rem] font-semibold text-[var(--text-secondary)]">{{ pctSigned(net.totals.landDev) }}</span>
          </div>
        </div>
        <div class="min-w-0 text-right">
          <div class="text-[0.75rem] text-[var(--text-muted)]">{{ L.net_earned }}</div>
          <div class="mt-1 text-[1.25rem] font-bold leading-none text-[var(--text)]">{{ mln(net.totals.earned) }}</div>
        </div>
      </div>
      <p v-if="net.totals.anyAssume" class="mt-3 text-[0.6875rem] leading-snug text-[var(--text-muted)]">Часть парков — на предварительных коэффициентах ({{ L.assume }}); прогноз ориентировочный.</p>
    </div>

    <!-- по паркам — кликабельные карты (тап → детали парка) -->
    <button
      v-for="c in net.cards"
      :key="c.park"
      type="button"
      class="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-colors active:bg-[var(--surface-2)]"
      @click="setPark(c.park)"
    >
      <div class="mb-2 flex items-center gap-2">
        <span class="font-semibold text-[var(--text)]">{{ nameOf(c) }}</span>
        <span v-if="c.assume" class="rounded border border-dashed border-[var(--warning)] px-1.5 py-0.5 text-[0.625rem] text-[var(--text-muted)]">{{ L.assume }}</span>
        <ChevronRight class="ml-auto h-5 w-5 shrink-0 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
      </div>
      <div class="mb-2 flex items-center gap-1.5 text-[0.75rem] text-[var(--text-muted)]">
        <span class="inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: gsOf(c).dot }" />
        {{ gsOf(c).label }}
      </div>
      <div class="relative mb-2 h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: pctW(c) + '%', background: SIG_VAR[c.fcSig] }" />
      </div>
      <div class="flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem] text-[var(--text-muted)]">
        <span>цель <b class="font-semibold text-[var(--text)]">{{ mln(c.target) }}</b></span>
        <span>заработано <b class="font-semibold text-[var(--text)]">{{ mln(c.earned) }}</b></span>
        <span>прогноз <b class="font-semibold text-[var(--text)]">{{ mln(c.landing) }}</b> <span class="text-[var(--text-secondary)]">{{ pctSigned(c.landDev) }}</span></span>
      </div>
    </button>

    <!-- v3: сигналы дня по паркам (миниатюры). Полосы A и кнопки «Прочитал» на сети нет. -->
    <section v-if="signalCards.length" class="mt-1">
      <h2 class="mb-1 px-1 text-[0.8125rem] font-semibold text-[var(--text-secondary)]">{{ L.net_signals }}</h2>
      <div class="flex flex-col gap-2">
        <button
          v-for="c in signalCards"
          :key="`sig-${c.park}`"
          type="button"
          data-test="net-signal"
          class="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
          @click="setPark(c.park)"
        >
          <div class="flex items-center gap-2">
            <span class="inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: signalDot(c.signal.status) }" />
            <span class="font-semibold text-[var(--text)]">{{ nameOf(c) }}</span>
            <span class="ml-auto shrink-0 text-[0.75rem] text-[var(--text-muted)]">{{ L.signal_from }} {{ ddmm(c.signal.date) }}</span>
          </div>
          <p class="mt-1 text-[0.8125rem] leading-snug text-[var(--text)]">{{ c.signal.headline }}</p>
        </button>
      </div>
    </section>
  </div>
</template>
