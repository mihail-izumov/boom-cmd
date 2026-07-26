<script setup>
import { computed } from 'vue'
import { useDaily } from '../composables/useDaily.js'
import { latestByCadence } from '../composables/netSummary.js'
import { L } from '../i18n/summary.js'
import NetSummaryCard from '../components/daily/NetSummaryCard.vue'

// Раздел «Сводки сети» — под-страница, вход иконкой с Главной (мини-стек глубиной 1).
// Три карточки: день → неделя → месяц, актуальная запись каденса = max date.
// Источник — тот же дневной payload (useDaily), отдельное верхнеуровневое поле
// data.net_summary. Нет поля/каденса → карточка не рендерится; нет ничего →
// пустой стейт. Парк-контекст здесь не участвует: сводки сетевые.

const { data, loading, error, reload } = useDaily()
const cards = computed(() => latestByCadence(data.value?.net_summary))
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-1">
    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка">
      <div v-for="i in 3" :key="i" class="bc-skeleton h-32 rounded-2xl" />
    </div>

    <!-- error -->
    <div v-else-if="error" class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.error }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >{{ L.retry }}</button>
    </div>

    <!-- нет сводок -->
    <div v-else-if="!cards.length" class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_hint }}</p>
    </div>

    <!-- карточки -->
    <template v-else>
      <p class="bc-fade-in px-1 text-[0.8125rem] leading-snug text-[var(--text-muted)]">{{ L.lead }}</p>
      <NetSummaryCard
        v-for="c in cards"
        :key="c.cadence"
        :cadence="c.cadence"
        :entry="c.entry"
        class="bc-fade-in"
      />
    </template>
  </section>
</template>
