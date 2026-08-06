<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { driversSummary, L } from '../../i18n/daily.js'

// Строка-сводка драйверов над таблицей дней (задание 06.08 §3.1, D-75).
//
// Ровно ОДНА строка вместо прежнего блока-списка: «Контроль дня» отвечает на «что
// изменилось в ЭТОМ парке в ЭТОМ месяце», а «что вообще идёт в сети и с какого
// числа» — это раздел «Драйверы роста», и он принят 30.07. Держать список в двух
// местах значит гарантированно их рассинхронить, поэтому здесь — сводка и переход.
//
// Приглушённая, кликабельная целиком (44pt по высоте — тач-таргет HIG).
// Текст монохромный серый: --text-muted на --surface = 5.18:1 (посчитано по WCAG).
const props = defineProps({ m: { type: Object, required: true } })
const emit = defineEmits(['open'])

const d = computed(() => props.m.drivers || null)
// Скрываем в двух случаях: драйверов нет вовсе (пустая вкладка daily_activities) и
// новые поля ещё не приехали (боевой Apps Script до v3.14) — см. computeDrivers.ready.
const show = computed(() => !!(d.value && d.value.ready && d.value.total > 0))
const text = computed(() => driversSummary(d.value, props.m.month))
</script>

<template>
  <button
    v-if="show"
    type="button"
    data-test="drivers-summary"
    class="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 text-left transition-opacity active:opacity-90"
    style="min-height: 44px"
    :aria-label="L.drivers_aria"
    @click="emit('open')"
  >
    <span class="shrink-0 text-[0.8125rem] font-semibold text-[var(--text)]">{{ L.drivers_row }}</span>
    <span class="min-w-0 flex-1 text-[0.75rem] leading-snug text-[var(--text-muted)]">{{ text }}</span>
    <ChevronRight class="h-4 w-4 shrink-0 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
  </button>
</template>
