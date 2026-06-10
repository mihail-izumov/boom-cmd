<script setup>
import { computed } from 'vue'
import { PARKS } from '../data/parks.js'
import { useParkContext } from '../composables/useParkContext.js'
import ParkCard from '../components/home/ParkCard.vue'

// Главная — обзор сети.
// Home ВСЕГДА показывает всю сеть (Вся сеть + 4 парка), независимо от
// выбранного контекста (TZ-3 §5). Выбор парка лишь подсвечивает текущий
// и скоупит другие вкладки. После выбора — остаёмся на текущей вкладке
// (без автонавигации, решение владельца).

const { current, setPark } = useParkContext()

const isActive = (id) => current.value === id

function select(id) {
  setPark(id)
}
</script>

<template>
  <section class="flex flex-col gap-2 px-3 pb-6 pt-2">
    <ParkCard :park="null" :active="isActive('all')" @select="select" />
    <ParkCard
      v-for="p in PARKS"
      :key="p.id"
      :park="p"
      :active="isActive(p.id)"
      @select="select"
    />
  </section>
</template>
