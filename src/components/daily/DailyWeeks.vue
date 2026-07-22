<script setup>
import { ChevronDown } from 'lucide-vue-next'
import { mln, ths, thsSigned, dayGen, actCode, L, SIG_VAR } from '../../i18n/daily.js'

// Недели Пн–Вс: раскрывающийся блок с таблицей дней (план/факт/надо/прогресс).
// Прогресс — цветная заливка (sig); числа монохромные.
// v2.2 §3: бейджи активностей у дней — короткий код (display-only).
const props = defineProps({ m: { type: Object, required: true } })
const monthGen = (dd) => dayGen(dd, props.m.month)
</script>

<template>
  <section>
    <h2 class="mb-3 mt-2 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{{ L.by_weeks }}</h2>
    <details
      v-for="w in m.weeks"
      :key="w.idx"
      :open="w.rows.some((r) => r.status != null)"
      class="mb-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"
    >
      <summary class="flex cursor-pointer list-none flex-col gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-[var(--text)]">Неделя {{ w.idx }}</span>
          <span class="text-[0.75rem] text-[var(--text-muted)]">{{ w.from }}–{{ w.to }} {{ monthGen(w.to).split(' ')[1] }}</span>
          <ChevronDown class="ml-auto h-4 w-4 text-[var(--text-muted)]" :stroke-width="2" />
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem]">
          <span><span class="text-[var(--text-muted)]">план </span><b class="font-semibold text-[var(--text)]">{{ mln(w.plan) }}</b></span>
          <span v-if="w.hasFact"><span class="text-[var(--text-muted)]">факт </span><b class="font-semibold text-[var(--text)]">{{ mln(w.fact) }}</b></span>
          <span v-else><span class="text-[var(--text-muted)]">надо </span><b class="font-semibold text-[var(--text)]">{{ mln(w.need) }}</b></span>
          <span v-if="w.hasFact"><span class="text-[var(--text-muted)]">откл. </span><b class="font-semibold text-[var(--text-secondary)]">{{ thsSigned(w.delta) }}</b></span>
        </div>
      </summary>

      <div class="border-t border-[var(--line)]">
        <div class="overflow-x-auto" style="-webkit-overflow-scrolling: touch">
        <table class="w-full min-w-[460px] border-collapse text-[0.8125rem] [font-variant-numeric:tabular-nums]">
          <thead>
            <tr class="text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">
              <th class="px-3 py-2 text-left font-semibold">день</th>
              <th class="px-3 py-2 text-right font-semibold">план</th>
              <th class="px-3 py-2 text-right font-semibold">факт</th>
              <th class="px-3 py-2 text-right font-semibold">надо</th>
              <th class="px-3 py-2 text-right font-semibold" style="width: 84px">прогресс</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in w.rows" :key="r.dd" class="border-t border-[var(--line)]" :class="r.weekend ? 'bg-[var(--surface-2)]' : ''">
              <td class="px-3 py-1.5 text-left text-[var(--text)]">
                {{ r.dd }} <span class="text-[0.6875rem] text-[var(--text-muted)]">{{ r.dowRu }}</span>
                <span v-for="c in r.acts" :key="c" class="ml-1 rounded bg-[var(--text)] px-1 text-[0.625rem] font-bold text-[var(--ink-on-color)]">{{ actCode(c) }}</span>
              </td>
              <td class="px-3 py-1.5 text-right text-[var(--text-secondary)]">{{ ths(r.plan) }}</td>
              <td class="px-3 py-1.5 text-right text-[var(--text)]">
                <template v-if="r.full">{{ ths(r.fact) }}<span v-if="r.chk" class="ml-1 text-[0.6875rem] text-[var(--text-muted)]">чек {{ Math.round(r.chk) }}</span><span v-if="r.outlier" class="ml-1 rounded border border-dashed border-[var(--line)] px-1 text-[0.625rem] text-[var(--text-muted)]">событие</span></template>
                <template v-else-if="r.status === 'partial'">{{ ths(r.fact) }} <span class="rounded border border-dashed border-[var(--line)] px-1 text-[0.625rem] text-[var(--text-muted)]">неполн.</span></template>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
              <td class="px-3 py-1.5 text-right font-medium text-[var(--text-secondary)]">
                <template v-if="!r.full">{{ ths(r.need) }}</template>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
              <td class="px-3 py-1.5">
                <div v-if="r.full" class="relative h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: r.progWidth + '%', background: SIG_VAR[r.sig] }" />
                </div>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <div v-if="w.leftDays > 0 && w.hasFact" class="border-t border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[0.75rem] text-[var(--text-muted)]">
          Осталось в неделе {{ w.leftDays }} дн — «надо» с хвостом: <b class="font-semibold text-[var(--text)]">{{ mln(w.need) }}</b>.
        </div>
      </div>
    </details>
  </section>
</template>
