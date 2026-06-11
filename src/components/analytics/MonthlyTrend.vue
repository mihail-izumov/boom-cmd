<script setup>
import { computed } from 'vue'
import { monthLabel } from '../../i18n/analytics.js'

// Помесячный мини-чарт на чистом SVG (без зависимостей; ответ владельца №1).
// Варианты:
//   • 'bar'      — столбики, тонкие grid-линии, hatched ghost-плейсхолдеры
//                  для null (фантомный бар диагональной штриховкой);
//   • 'line'     — полилиния с РАЗРЫВАМИ на null (никаких «точек-пустышек»);
//   • 'sparkline'— тонкая линия без подписей и шкалы (для KPI-плиток).
//
// Цвета — только токены: --text-secondary (марки), --text-muted (подписи),
// --line (рамки/grid/штриховка), --surface-2 (фон штриховки).
// Монохром по §3.5 (цвет в марках — только в Слое 3, когда будет сигнал).

const props = defineProps({
  series: { type: Array, required: true }, // [{ month: 'YYYY-MM', value: number|null }]
  variant: { type: String, default: 'bar' }, // 'bar' | 'line' | 'sparkline'
  height: { type: Number, default: 96 },
  format: { type: Function, default: null }, // подпись макс. оси Y (только bar)
})

const W = 320
const PADX = 8
const PADY_TOP = 8

// Уникальный id паттерна для штриховки — чтобы несколько чартов на одной
// странице не схлопывали свои <defs>.
const uid = Math.random().toString(36).slice(2, 9)
const hatchId = `mt-hatch-${uid}`

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

// Фантомный бар «нет данных» — фиксированная доля высоты (читаемо, но
// явно ниже реальных значений, чтобы не путать с маленьким значением).
const NULL_BAR_FRACTION = 0.35

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
    let y
    let h
    if (isNull) {
      h = Math.max(10, innerH.value * NULL_BAR_FRACTION)
      y = baselineY.value - h
    } else {
      y = yFor(p.value)
      h = baselineY.value - y
    }
    return { x, y, w: bw, h, xCenter, month: p.month, value: p.value, isNull }
  })
})

// Полилиния с разрывами на null.
const linePath = computed(() => {
  const n = props.series.length
  if (n === 0) return ''
  let d = ''
  let started = false
  for (let i = 0; i < n; i++) {
    const p = props.series[i]
    if (p.value === null || !Number.isFinite(p.value)) {
      started = false
      continue
    }
    const x = xFor(i, n)
    const y = yFor(p.value)
    d += (started ? ' L' : ' M') + ` ${x.toFixed(1)} ${y.toFixed(1)}`
    started = true
  }
  return d.trim()
})

// Точки линии (только для non-null) — лёгкий маркер на каждом значении
// в line-варианте. На sparkline маркеров не делаем (тонкая линия).
const linePoints = computed(() => {
  if (props.variant !== 'line') return []
  const n = props.series.length
  return props.series
    .map((p, i) => {
      if (p.value === null || !Number.isFinite(p.value)) return null
      return { x: xFor(i, n), y: yFor(p.value), month: p.month, value: p.value }
    })
    .filter(Boolean)
})

const monthTicks = computed(() => {
  const n = props.series.length
  if (n === 0) return []
  const step = n <= 4 ? 1 : n <= 8 ? 2 : 3
  return props.series.map((p, i) => ({
    label: monthLabel(p.month).split(' ')[0],
    x: xFor(i, n),
    show: i === 0 || i === n - 1 || i % step === 0,
    isNull: p.value === null || !Number.isFinite(p.value),
  }))
})

// Грид-линии для bar-варианта (макс и середина).
const showGrid = computed(() => props.variant === 'bar' && !allNull.value)
const midY = computed(() => PADY_TOP + innerH.value / 2)

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
      <defs v-if="variant === 'bar'">
        <!-- Диагональная штриховка для «нет данных» — фантомный бар. -->
        <pattern
          :id="hatchId"
          patternUnits="userSpaceOnUse"
          width="6" height="6"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill="var(--surface-2)" />
          <line
            x1="0" y1="0" x2="0" y2="6"
            stroke="var(--line)" stroke-width="1.5"
          />
        </pattern>
      </defs>

      <!-- Грид: макс / середина / baseline. Только в bar. -->
      <template v-if="showGrid">
        <line
          :x1="PADX" :x2="W - PADX"
          :y1="PADY_TOP" :y2="PADY_TOP"
          stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"
        />
        <line
          :x1="PADX" :x2="W - PADX"
          :y1="midY" :y2="midY"
          stroke="var(--line)" stroke-width="1" stroke-dasharray="2 3" opacity="0.4"
        />
      </template>
      <line
        :x1="PADX" :x2="W - PADX"
        :y1="baselineY" :y2="baselineY"
        stroke="var(--line)" stroke-width="1"
      />

      <!-- bar / sparkline-bars: больше не используем bars для sparkline. -->
      <template v-if="variant === 'bar'">
        <template v-for="(b, i) in bars" :key="i">
          <rect
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            :fill="b.isNull ? `url(#${hatchId})` : 'var(--text-secondary)'"
            rx="2"
          />
        </template>
      </template>

      <!-- sparkline и line: тонкая полилиния, разрывы на null. -->
      <template v-if="variant === 'line' || variant === 'sparkline'">
        <path
          v-if="linePath"
          :d="linePath"
          fill="none"
          stroke="var(--text-secondary)"
          :stroke-width="variant === 'sparkline' ? 1.5 : 1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          v-for="(pt, i) in linePoints"
          :key="i"
          :cx="pt.x"
          :cy="pt.y"
          r="2.4"
          fill="var(--text)"
        />
      </template>

      <!-- Подписи месяцев — не для sparkline. -->
      <template v-if="variant !== 'sparkline'">
        <text
          v-for="t in monthTicks.filter((x) => x.show)"
          :key="t.x"
          :x="t.x"
          :y="height - 4"
          text-anchor="middle"
          :fill="t.isNull ? 'color-mix(in srgb, var(--text-muted) 65%, transparent)' : 'var(--text-muted)'"
          font-size="10"
        >{{ t.label }}</text>
      </template>

      <!-- Empty-state: все null → подпись в центре. -->
      <text
        v-if="allNull && variant !== 'sparkline'"
        :x="W / 2"
        :y="PADY_TOP + innerH / 2 + 4"
        text-anchor="middle"
        fill="var(--text-muted)"
        font-size="12"
      >нет данных за период</text>
    </svg>
    <p v-if="yLabel" class="mt-0.5 text-right text-[0.6875rem] text-[var(--text-muted)]">макс. {{ yLabel }}</p>
  </div>
</template>
