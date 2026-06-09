<script setup>
import { computed } from 'vue'

// Лейбл — чип-заливка из чистого LEGO-набора (§3.4), стабильно по хешу строки.
// Текст монохромный по правилу §3.5:
//   на --negative/--info — белый (--ink-on-color);
//   на --warning/--positive — тёмный --accent-ink (на зелёном white 3.42:1 < 4.5).

const props = defineProps({
  label: { type: String, required: true },
})

const PALETTE = [
  { bg: 'var(--negative)', fg: 'var(--ink-on-color)' },
  { bg: 'var(--info)', fg: 'var(--ink-on-color)' },
  { bg: 'var(--warning)', fg: 'var(--accent-ink)' },
  { bg: 'var(--positive)', fg: 'var(--accent-ink)' },
]

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h * 31) + s.charCodeAt(i)) >>> 0
  }
  return h
}

const palette = computed(() => PALETTE[hash(props.label) % PALETTE.length])
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 text-[0.75rem] font-medium leading-tight"
    :style="{ backgroundColor: palette.bg, color: palette.fg }"
  >{{ label }}</span>
</template>
