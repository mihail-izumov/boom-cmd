<script setup>
import { Construction } from 'lucide-vue-next'

// Слой 3 — заглушка. По заданию: «Слой 3 — НЕ делать (данных под него ещё
// нет)». Карточка только сигналит, что глубина появится позже.
</script>

<template>
  <article class="flex flex-col gap-2 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-3">
    <div class="flex items-center gap-2 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
      <Construction class="h-4 w-4" :stroke-width="2" aria-hidden="true" />
      <span>Слой 3 — детализация</span>
    </div>
    <p class="text-[0.9375rem] leading-snug text-[var(--text-secondary)]">
      В разработке. Глубина появится, когда подключим источники с
      детализацией (аппараты, призы, динамика).
    </p>
  </article>
</template>
