<script setup>
import { computed } from 'vue'
import { useDaily } from '../composables/useDaily.js'
import { sortReviews } from '../composables/reviews.js'
import { L } from '../i18n/reviews.js'
import { ddmm } from '../i18n/daily.js'
import { dowTitle } from '../i18n/summary.js'

// «Журнал разборов» (D-19) — под-страница, вход ТОЛЬКО плиткой-счётчиком с
// Главной (мини-стек глубиной 1, по образцу «Парков»). Источник — тот же
// daily-payload (useDaily), верхнеуровневый массив payload.reviews из вкладки
// `reviews` дневной таблицы. ТОЛЬКО рендер: сортировка/валидация — reviews.js,
// свежие сверху. 4 состояния: loading / error / empty / список.
// Парк-контекст не участвует: разборы — общесистемные (parkFilter: false).
const { data, loading, error, reload } = useDaily()
const rows = computed(() => sortReviews(data.value && data.value.reviews))
</script>

<template>
  <section class="flex flex-col gap-3 px-3 pb-6 pt-1">
    <!-- loading -->
    <div v-if="loading" class="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка">
      <div v-for="i in 4" :key="i" class="bc-skeleton h-14 rounded-2xl" />
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

    <!-- разборов нет -->
    <div v-else-if="!rows.length" class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center">
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.empty }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.empty_hint }}</p>
    </div>

    <!-- журнал: свежие сверху, дата · «Разбор полёта» · день недели -->
    <template v-else>
      <p
        data-test="reviews-lead"
        class="bc-fade-in whitespace-pre-line px-4 pb-1 text-center text-[1rem] leading-snug text-[var(--text-muted)]"
      >{{ L.lead }}</p>

      <ul class="bc-fade-in flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <li
          v-for="r in rows"
          :key="r.date"
          data-test="review-row"
          class="flex items-center gap-3 border-t border-[var(--line)] px-4 first:border-t-0"
          style="min-height: 52px"
        >
          <span class="w-[3rem] shrink-0 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">{{ ddmm(r.date) }}</span>
          <span class="min-w-0 flex-1 truncate text-[0.9375rem] text-[var(--text)]">{{ r.title || L.row }}</span>
          <span class="shrink-0 text-[0.75rem] text-[var(--text-muted)]">{{ dowTitle(r.date) }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
