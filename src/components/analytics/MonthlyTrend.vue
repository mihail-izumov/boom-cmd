<script setup>
import { computed } from 'vue'
import { monthLabel } from '../../i18n/analytics.js'

// Помесячный мини-чарт на чистом SVG (без зависимостей; ответ владельца №1).
// Поддерживает три вида: 'bar' (столбики), 'line' (полилиния), 'sparkline'
// (компактный, без подписей — для KPI-плиток).
// Цвета — только токены: --text-muted для оси/подписей, --text для активной
// линии/баров (монохром по §3.5). Цвет в марках появится в Слое 3, когда
// будет содержательный сигнал (рост/падение); сейчас оставляем нейтрально.

const props = defineProps({
  series: { type: Array, required: true }, // [{ month: 'YYYY-MM', value: number|null }]
  variant: { type: String, default: 'bar' }, // 'bar' | 'line' | 'sparkline'
  height: { type: Number, default: 96 },
  // подпись Y (формат), по умолчанию без неё
  format: { type: Function, default: null },
})

const W = 320
const PADX = 8
const PADY_TOP = 8
const PADY_BOT_SPARK = 4

const innerW = computed(() => W - PADX * 2)
const innerH = computed(() => {
  if (props.variant === 'sparkline') return props.height - PADY_TOP - PADY_BOT_SPARK
  return props.height - PADY_TOP - 18 // место под подписи месяцев
})

const validIdx = computed(() => props.series.map((p, i) => (p.value !== null && Number.isFinite(p.value) ? i : -1)).filter((i) => i >= 0))
const allNull = computed(() => validIdx.value.length === 0)
const maxV = computed(() => {
  if (allNull.value) return 1
  const vs = props.series.map((p) => (p.value === null ? -Infinity : p.value))
  const m = Math.max(...vs.filter((v) => Number.isFinite(v)))
  return m > 0 ? m : 1
})
const minV = computed(() => {
  if (allNull.value) return 0
  const vs = props.series.map((p) => (p.value === null ? Infinity : p.value))
  const m = Math.min(...vs.filter((v) => Number.isFinite(v)))
  return m < 0 ? m : 0 // прижимаем к нулю, чтобы столбики читались
})

function xFor(i, n) {
  if (n <= 1) return innerW.value / 2 + PADX
  return PADX + (innerW.value * i) / (n - 1)
}
function yFor(v) {
  const span = maxV.value - minV.value || 1
  const norm = (v - minV.value) / span
  return PADY_TOP + innerH.value * (1 - norm)
}

const bars = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  const gap = props.variant === 'sparkline' ? 2 : 4
  const slot = innerW.value / n
  const bw = Math.max(2, slot - gap)
  return props.series.map((p, i) => {
    const xCenter = PADX + slot * (i + 0.5)
    const x = xCenter - bw / 2
    const isNull = p.value === null || !Number.isFinite(p.value)
    const y = isNull ? PADY_TOP + innerH.value : yFor(p.value)
    const h = isNull ? 0 : PADY_TOP + innerH.value - y
    return { x, y, w: bw, h, month: p.month, value: p.value, isNull }
  })
})

const linePath = computed(() => {
  const n = props.series.length
  if (n === 0) return ''
  let d = ''
  let started = false
  for (let i = 0; i < n; i++) {
    const p = props.series[i]
    if (p.value === null || !Number.isFinite(p.value)) continue
    const x = xFor(i, n)
    const y = yFor(p.value)
    d += (started ? ' L' : 'M') + ` ${x.toFixed(1)} ${y.toFixed(1)}`
    started = true
  }
  return d
})

const linePoints = computed(() => {
  const n = props.series.length
  return props.series
    .map((p, i) => (p.value === null || !Number.isFinite(p.value) ? null : { x: xFor(i, n), y: yFor(p.value), month: p.month, value: p.value }))
    .filter(Boolean)
})

const monthTicks = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  // показываем подпись первого, последнего и через раз между ними, чтобы не наезжали
  const step = n <= 4 ? 1 : n <= 8 ? 2 : 3
  return props.series.map((p, i) => ({
    label: monthLabel(p.month).split(' ')[0], // короткий месяц без года
    x: xFor(i, n),
    show: i === 0 || i === n - 1 || i % step === 0,
  }))
})

const yLabel = computed(() => {
  if (allNull.value || !props.format) return null
  return props.format(maxV.value)
})
</script>

<template>
  <div class="w-full">
    <svg
      :viewBox="`0 0 ${W} ${height}`"
      class="block w-full"
      :style="{ height: height + 'px' }"
      role="img"
      :aria-label="`Помесячный тренд за ${series.length} мес`"
    >
      <template v-if="!allNull">
        <!-- бары -->
        <template v-if="variant === 'bar' || variant === 'sparkline'">
          <rect
            v-for="(b, i) in bars"
            :key="i"
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            :fill="b.isNull ? 'var(--surface-2)' : 'var(--text-secondary)'"
            :rx="variant === 'sparkline' ? 1 : 2"
          />
        </template>
        <!-- линия -->
        <template v-if="variant === 'line'">
          <path
            :d="linePath"
            fill="none"
            stroke="var(--text-secondary)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            v-for="(pt, i) in linePoints"
            :key="i"
            :cx="pt.x"
            :cy="pt.y"
            r="2.5"
            fill="var(--text)"
          />
        </template>
      </template>
      <template v-else>
        <text :x="W / 2" :y="height / 2 + 4" text-anchor="middle"
          fill="var(--text-muted)" font-size="12">нет данных</text>
      </template>

      <!-- подписи месяцев (не для sparkline) -->
      <template v-if="variant !== 'sparkline'">
        <text
          v-for="t in monthTicks.filter((x) => x.show)"
          :key="t.x"
          :x="t.x"
          :y="height - 4"
          text-anchor="middle"
          fill="var(--text-muted)"
          font-size="10"
        >{{ t.label }}</text>
      </template>
    </svg>
    <p v-if="yLabel" class="mt-0.5 text-right text-[0.6875rem] text-[var(--text-muted)]">макс. {{ yLabel }}</p>
  </div>
</template>
