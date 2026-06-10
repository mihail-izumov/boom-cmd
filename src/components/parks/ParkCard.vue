<script setup>
// Карточка парка на под-странице «Парки» (TZ-3.1 §2).
// НЕКЛИКАБЕЛЬНЫЙ контейнер — справочная инфо. Когда появится стата (Ф5+),
// карточка станет кнопкой; решение «куда тап» примем тогда.
// Сейчас тапа нет вообще, фокус-обводки нет.

defineProps({
  park: { type: Object, required: true },
})
</script>

<template>
  <section
    class="flex w-full flex-col gap-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
  >
    <div class="flex items-baseline gap-2">
      <h2 class="text-[1.125rem] font-semibold leading-snug text-[var(--text)]">{{ park.name }}</h2>
      <span v-if="park.city" class="text-[0.875rem] text-[var(--text-muted)]">{{ park.city }}</span>
    </div>
    <p class="text-[0.8125rem] text-[var(--text-muted)]">Сводка появится позже</p>
  </section>
</template>
