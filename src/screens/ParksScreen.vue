<script setup>
import { PARKS } from '../data/parks.js'
import ParkCard from '../components/parks/ParkCard.vue'

// Справочная под-страница «Парки» (TZ-3.1 §2).
// Список 4 парков без «Все парки» (это справочник, а не выбор контекста).
// Выбор парка делается беджем на рабочих страницах (Проекты).
</script>

<template>
  <section class="flex flex-col gap-2 px-3 pb-6 pt-2">
    <ParkCard v-for="p in PARKS" :key="p.id" :park="p" />
  </section>
</template>
