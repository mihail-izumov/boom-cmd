<script setup>
import { computed } from 'vue'
import { L } from '../../i18n/daily.js'

// Панель коэффициентов дней недели: значение + источник (факт/админы), дни на логике
// админов — чип «допущение». Полоса нейтральная (не сигнал); метка «1.00» — средний день.
const props = defineProps({ m: { type: Object, required: true } })
const midPos = computed(() => (props.m.maxCoef ? (1 / props.m.maxCoef) * 100 : 0))
const cleanN = computed(() => props.m.calib?.clean_n ?? null)
const note = computed(() => props.m.calib?.note || '')
</script>

<template>
  <section>
    <h2 class="mb-3 mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">
      {{ L.coef }}
      <span v-if="cleanN" class="rounded border border-dashed border-[var(--warning)] px-1.5 py-0.5 text-[0.625rem] font-normal normal-case tracking-normal text-[var(--text-muted)]">{{ cleanN }} дн · уточнятся с историей</span>
    </h2>
    <div class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div v-for="(r, i) in m.coefRows" :key="i" class="grid items-center gap-3 py-1 text-[0.8125rem]" style="grid-template-columns: 28px 1fr 44px 96px">
        <span class="text-[var(--text)]">{{ r.dowRu }}</span>
        <div class="relative h-2.5 rounded-full bg-[var(--surface-2)]">
          <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: (r.coef ? (r.coef / m.maxCoef) * 100 : 0) + '%', background: 'var(--text-muted)', opacity: 0.4 }" />
          <span class="absolute -bottom-0.5 -top-0.5 w-px bg-[var(--text-muted)]" :style="{ left: midPos + '%' }" />
        </div>
        <span class="text-right [font-variant-numeric:tabular-nums] text-[var(--text)]">{{ r.coef != null ? r.coef.toFixed(2).replace('.', ',') : '—' }}</span>
        <span class="flex items-center justify-end gap-1 text-[0.6875rem] text-[var(--text-muted)]">
          {{ r.src === 'данные' ? `факт (n=${r.n})` : `админы (n=${r.n})` }}
          <span v-if="r.assume" class="rounded border border-dashed border-[var(--warning)] px-1 text-[0.625rem] text-[var(--text-muted)]">{{ L.assume }}</span>
        </span>
      </div>
      <p v-if="note" class="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--text-muted)]">{{ note }}</p>
    </div>
  </section>
</template>
