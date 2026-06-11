<script setup>
import { computed } from 'vue'
import { monthLabel } from '../../i18n/analytics.js'

// Помесячный мини-чарт на чистом SVG (без зависимостей; ответ владельца №1).
// Поддерживает три вида: 'bar' (столбики), 'line' (полилиния), 'sparkline'
// (компактный, без подписей — для KPI-плиток).
// Цвета — только токены: --text/--text-secondary для марок, --text-muted
// для подписей, --line для placeholder’ов пустых месяцев. Монохром по §3.5
// (цвет в марках появится в Слое 3, когда будет содержательный сигнал).
//
// Пустой период (null значение) рисуется НЕ как пустой слот, а явным
// плейсхолдером (как в BI-дашбордах): тонкая риска у baseline + маленькая
// полупрозрачная точка над ней. Видно, что слот существует, но данных нет.

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

const innerW = computed(() => W - PADX * 2)
const innerH = computed(() => {
  if (props.variant === 'sparkline') return props.height - PADY_TOP - 4
  return props.height - PADY_TOP - 18 // место под подписи месяцев
})
const baselineY = computed(() => PADY_TOP + innerH.value)

const validValues = computed(() =>
  props.series
    .map((p) => p.value)
    .filter((v) => v !== null && Number.isFinite(v)),
)
const allNull = computed(() => validValues.value.length === 0)

const maxV = computed(() => {
  if (allNull.value) return 1
  const m = Math.max(...validValues.value)
  return m > 0 ? m : 1
})
const minV = computed(() => {
  if (allNull.value) return 0
  const m = Math.min(...validValues.value)
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

const NULL_BAR_H = 3 // высота риски-плейсхолдера у baseline

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
    const y = isNull ? baselineY.value - NULL_BAR_H : yFor(p.value)
    const h = isNull ? NULL_BAR_H : baselineY.value - y
    // точка-плейсхолдер выше риски (для bar; на sparkline только риска).
    const dotY = isNull && props.variant !== 'sparkline'
      ? baselineY.value - NULL_BAR_H - 6
      : null
    return { x, y, w: bw, h, xCenter, dotY, month: p.month, value: p.value, isNull }
  })
})

const linePath = computed(() => {
  const n = props.series.length
  if (n === 0) return ''
  let d = ''
  let started = false
  for (let i = 0; i < n; i++) {
    const p = props.series[i]
    if (p.value === null || !Number.isFinite(p.value)) {
      started = false // линия разрывается на пропусках
      continue
    }
    const x = xFor(i, n)
    const y = yFor(p.value)
    d += (started ? ' L' : ' M') + ` ${x.toFixed(1)} ${y.toFixed(1)}`
    started = true
  }
  return d.trim()
})

const linePoints = computed(() => {
  const n = props.series.length
  return props.series.map((p, i) => {
    const x = xFor(i, n)
    const isNull = p.value === null || !Number.isFinite(p.value)
    return {
      x,
      y: isNull ? baselineY.value : yFor(p.value),
      isNull,
      month: p.month,
      value: p.value,
    }
  })
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
    isNull: p.value === null || !Number.isFinite(p.value),
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
      <!-- Baseline-нить для контекста (видна, если есть пропуски). -->
      <line
        :x1="PADX" :x2="W - PADX"
        :y1="baselineY" :y2="baselineY"
        stroke="var(--line)" stroke-width="1"
      />

      <!-- бары / sparkline -->
      <template v-if="variant === 'bar' || variant === 'sparkline'">
        <template v-for="(b, i) in bars" :key="i">
          <rect
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            :fill="b.isNull ? 'var(--line)' : 'var(--text-secondary)'"
            :opacity="b.isNull ? 0.75 : 1"
            :rx="variant === 'sparkline' ? 1 : 2"
          />
          <!-- маленькая точка-маркер «нет данных» (только bar, не sparkline) -->
          <circle
            v-if="b.isNull && b.dotY !== null"
            :cx="b.xCenter"
            :cy="b.dotY"
            r="1.6"
            fill="var(--text-muted)"
            opacity="0.55"
          />
        </template>
      </template>

      <!-- линия с разрывами на пропусках -->
      <template v-if="variant === 'line'">
        <path
          v-if="linePath"
          :d="linePath"
          fill="none"
          stroke="var(--text-secondary)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <template v-for="(pt, i) in linePoints" :key="i">
          <!-- реальная точка -->
          <circle
            v-if="!pt.isNull"
            :cx="pt.x"
            :cy="pt.y"
            r="2.6"
            fill="var(--text)"
          />
          <!-- плейсхолдер «нет данных» на baseline -->
          <circle
            v-else
            :cx="pt.x"
            :cy="baselineY"
            r="2.6"
            fill="none"
            stroke="var(--text-muted)"
            stroke-width="1"
            opacity="0.65"
          />
        </template>
      </template>

      <!-- подписи месяцев (не для sparkline) -->
      <template v-if="variant !== 'sparkline'">
        <text
          v-for="t in monthTicks.filter((x) => x.show)"
          :key="t.x"
          :x="t.x"
          :y="height - 4"
          text-anchor="middle"
          :fill="t.isNull ? 'color-mix(in srgb, var(--text-muted) 70%, transparent)' : 'var(--text-muted)'"
          font-size="10"
        >{{ t.label }}</text>
      </template>
    </svg>
    <p v-if="yLabel" class="mt-0.5 text-right text-[0.6875rem] text-[var(--text-muted)]">макс. {{ yLabel }}</p>
  </div>
</template>
