<script setup>
import { ChevronDown } from 'lucide-vue-next'
import { mln, dayGenIso, pctWhole, L, SIG_VAR, GOAL_STATE } from '../../i18n/daily.js'
import { computed } from 'vue'

// Журнал прогноза — РЕНДЕР из payload (не пересчёт). Траектория прогноза по дням,
// ▲/▼ ко вчерашнему, полоса landing_pct (цвет sig), достижимость точкой.
// v1.1: широкая таблица в горизонтальный скролл (контейнер, не страница) — колонка
// достижимости больше не режется на узких экранах.
// v2.1 §5: достижимость — три состояния goalState (✓ достижима / ↑ рекордный темп /
// вне досягаемости); goal_state пишет build_daily.py, dailyModel даёт фолбэк.
const props = defineProps({ m: { type: Object, required: true } })
const rows = computed(() => props.m.journal)
const arrowChar = (a) => (a === 'up' ? '▲' : a === 'down' ? '▼' : '→')
const gsOf = (s) => GOAL_STATE[s.goalState] || GOAL_STATE.ok
</script>

<template>
  <details v-if="rows.length" open class="group">
    <summary class="flex cursor-pointer list-none items-center gap-2 py-2 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)] [&::-webkit-details-marker]:hidden">
      {{ L.journal }}
      <ChevronDown class="h-4 w-4 transition-transform group-open:rotate-180" :stroke-width="2.5" />
    </summary>
    <div class="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div class="overflow-x-auto" style="-webkit-overflow-scrolling: touch">
        <div class="min-w-[540px]">
          <div
            v-for="(s, i) in rows"
            :key="i"
            class="grid items-center gap-3 border-t border-[var(--line)] px-4 py-2 text-[0.8125rem] first:border-t-0"
            style="grid-template-columns: 84px 1fr 84px 46px 128px"
          >
            <div class="font-semibold text-[var(--text)]">{{ dayGenIso(s.date) }}</div>
            <div class="[font-variant-numeric:tabular-nums] text-[var(--text)]">{{ mln(s.landing) }} <span class="text-[var(--text-muted)]">{{ arrowChar(s.arrow) }}</span></div>
            <div class="relative h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: Math.min(100, s.landingPct * 100) + '%', background: SIG_VAR[s.sig] }" />
            </div>
            <div class="text-right font-bold [font-variant-numeric:tabular-nums] text-[var(--text)]">{{ pctWhole(s.landingPct) }}</div>
            <div class="flex items-center justify-end gap-1 whitespace-nowrap text-[0.75rem] text-[var(--text-muted)]">
              <i class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: gsOf(s).dot }" />
              {{ gsOf(s).journal }}
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="mt-2 px-1 text-[0.6875rem] leading-snug text-[var(--text-muted)]">Прогноз выручки на конец каждого дня (коэффициенты фиксированы). ▲/▼ — сдвиг ко вчерашнему.</p>
  </details>
</template>
