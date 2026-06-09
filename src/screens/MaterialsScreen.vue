<script setup>
import { Folder } from 'lucide-vue-next'
</script>

<template>
  <section
    class="flex min-h-[calc(100svh-13rem)] flex-col items-center justify-center gap-4 px-8 text-center"
  >
    <div
      class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text-muted)] ring-1 ring-[var(--line)]"
    >
      <Folder class="h-7 w-7" :stroke-width="2" />
    </div>
    <h2 class="text-[1.375rem] font-semibold text-[var(--text)]">Здесь будут материалы</h2>
    <p class="max-w-[30ch] text-[1.0625rem] leading-snug text-[var(--text-secondary)]">
      Реклама, ссылки на сайты и фото торговых точек — единая витрина.
    </p>
    <span
      class="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[0.9375rem] text-[var(--text-muted)]"
    >
      Появится на следующем этапе
    </span>
  </section>
</template>
