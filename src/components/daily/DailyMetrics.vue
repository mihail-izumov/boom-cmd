<script setup>
import { ChevronDown } from 'lucide-vue-next'
import { computed } from 'vue'
import { ths, L } from '../../i18n/daily.js'
import { formatInt } from '../../i18n/analytics.js'

// Метрики по дням — АДАПТИВНЫЕ колонки (только те, у кого есть значения). Свёрнут.
const props = defineProps({ m: { type: Object, required: true } })
const cols = computed(() => props.m.metColumns)
const rows = computed(() => props.m.metRows)

function fmt(key, v) {
  if (v == null) return '—'
  if (key === 'chk') return formatInt(Math.round(v))
  if (key === 'pps') return v.toFixed(2).replace('.', ',')
  return formatInt(v)
}
const legend = computed(() => {
  const k = cols.value.map((c) => c.key)
  if (k.includes('pps')) return 'Попол/сессию — пополнений на кассовую сессию с пополнением (≈ попол/визит ~1,1). Ср.чек = выручка ÷ чеки.'
  if (k.includes('new')) return 'Новые гости — новые посетители за день (лидирующая метрика растущего парка). Чеки/сессии/ср.чек — нет в отчётах (долг).'
  return 'Ср.чек, сессии, пополнения — N/A (нет дневной выгрузки, в долге).'
})
</script>

<template>
  <details v-if="rows.length" class="group">
    <summary class="flex cursor-pointer list-none items-center gap-2 py-2 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)] [&::-webkit-details-marker]:hidden">
      {{ L.metrics }}
      <ChevronDown class="h-4 w-4 transition-transform group-open:rotate-180" :stroke-width="2.5" />
    </summary>
    <div class="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <table class="w-full border-collapse text-[0.8125rem] [font-variant-numeric:tabular-nums]">
        <thead>
          <tr class="text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">
            <th class="whitespace-nowrap px-3 py-2 text-left font-semibold">день</th>
            <th class="px-3 py-2 text-right font-semibold">выручка</th>
            <th v-for="c in cols" :key="c.key" class="whitespace-nowrap px-3 py-2 text-right font-semibold">{{ c.label }}</th>
            <th class="whitespace-nowrap px-3 py-2 text-right font-semibold">нал / безнал</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" class="border-t border-[var(--line)]" :class="r.weekend ? 'bg-[var(--surface-2)]' : ''">
            <td class="whitespace-nowrap px-3 py-1.5 text-left text-[var(--text)]">
              {{ r.dd }} <span class="text-[0.6875rem] text-[var(--text-muted)]">{{ r.dowRu }}</span>
              <span v-if="r.partial" class="ml-1 rounded border border-dashed border-[var(--line)] px-1 text-[0.625rem] text-[var(--text-muted)]">неполн.</span>
            </td>
            <td class="px-3 py-1.5 text-right text-[var(--text)]">{{ ths(r.rev) }}</td>
            <td v-for="c in r.cells" :key="c.key" class="px-3 py-1.5 text-right text-[var(--text-secondary)]">{{ fmt(c.key, c.value) }}</td>
            <td class="whitespace-nowrap px-3 py-1.5 text-right text-[var(--text-secondary)]">
              <template v-if="r.cashPct != null">{{ r.cashPct }} / {{ r.cashlessPct }}%</template>
              <span v-else class="text-[var(--text-muted)]">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="mt-2 px-1 text-[0.6875rem] leading-snug text-[var(--text-muted)]">{{ legend }}</p>
  </details>
</template>
