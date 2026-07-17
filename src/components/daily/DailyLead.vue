<script setup>
import { computed } from 'vue'
import { mln, ths, pctSigned, L } from '../../i18n/daily.js'

// «Главный рычаг цели» — опережающий индикатор (новые гости). Текст монохромный;
// направление несёт сам текст (↑/↓) и знак процента. Левый акцент-кант — сигнальная заливка.
const props = defineProps({ m: { type: Object, required: true } })
const lead = computed(() => props.m.lead)
const falling = computed(() => lead.value && lead.value.prev_avg != null && lead.value.cur_avg < lead.value.prev_avg)
const arrow = computed(() => {
  const l = lead.value
  if (!l || l.prev_avg == null) return ''
  return l.cur_avg < l.prev_avg ? '↓ падает' : l.cur_avg > l.prev_avg ? '↑ растёт' : '→ ровно'
})
const trend = computed(() => {
  const l = lead.value
  if (!l) return ''
  return l.prev_avg != null ? `${l.prev_label} ${l.prev_avg}/день → ${l.cur_label} ${l.cur_avg}/день` : `${l.cur_label} ${l.cur_avg}/день`
})
const capName = computed(() => {
  const n = lead.value?.name || ''
  return n ? n[0].toUpperCase() + n.slice(1) : ''
})
</script>

<template>
  <div
    v-if="lead && m.currentPace > 0"
    class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
    :style="{ borderLeftWidth: '4px', borderLeftColor: falling ? 'var(--negative)' : 'var(--warning)' }"
  >
    <div class="mb-2 text-[1rem] font-bold text-[var(--text)]">{{ L.lever }} — приток «{{ lead.name }}»</div>
    <p class="mb-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
      Чтобы выйти на <b class="font-semibold text-[var(--text)]">{{ mln(m.T) }}</b>, остаток месяца должен давать
      <b class="font-semibold text-[var(--text)]">{{ ths(m.needPerDay) }}/день</b> против текущих
      <b class="font-semibold text-[var(--text)]">{{ ths(m.currentPace) }}/день</b> — это
      <b class="font-semibold text-[var(--text)]">{{ pctSigned(m.paceGap) }}</b> к темпу, стабильно до конца месяца.
    </p>
    <p class="mb-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
      <b class="font-semibold text-[var(--text)]">{{ capName }}</b> — опережающий индикатор выручки (связь r={{ lead.corr }}), и он
      <b class="font-semibold text-[var(--text)]">{{ arrow }}</b>: {{ trend }}. Прогноз приземления при текущем темпе —
      <b class="font-semibold text-[var(--text)]">{{ mln(m.landing) }}</b>, а не цель.
    </p>
    <p class="border-t border-[var(--line)] pt-2 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
      <b class="font-semibold text-[var(--text)]">Что нужно от команды:</b> развернуть приток новых гостей и поднять средний чек — ключевой рычаг, чтобы закрыть разрыв до {{ mln(m.T) }}.
    </p>
  </div>
</template>
