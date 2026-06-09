<script setup>
import { computed } from 'vue'
import { ESTIMATE_RU, t } from '../../i18n/roadmap.js'

// Estimate-бейдж: чип-заливка нейтральная, текст монохромный (§3.5).
// verbose=true — показываем и русскую расшифровку рядом (для модалки).

const props = defineProps({
  estimate: { type: String, default: null },
  verbose: { type: Boolean, default: false },
})

const ru = computed(() => (props.estimate ? t(ESTIMATE_RU, props.estimate) : ''))
const ariaLabel = computed(() =>
  props.estimate ? `Оценка: ${props.estimate}${ru.value ? ' · ' + ru.value : ''}` : '',
)
</script>

<template>
  <span
    v-if="estimate"
    class="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.8125rem] text-[var(--text-secondary)]"
    :aria-label="ariaLabel"
  >
    <span class="font-medium tracking-wide">{{ estimate }}</span>
    <span v-if="verbose" class="text-[var(--text-muted)]">· {{ ru }}</span>
  </span>
</template>
