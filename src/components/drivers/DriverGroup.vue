<script setup>
import { ChevronRight } from 'lucide-vue-next'
import { statusLabel } from '../../i18n/drivers.js'
import DriverCard from './DriverCard.vue'

// Сворачиваемая группа-статус — тот же паттерн, что ProjectSection на «Задачах»:
// шапка-кнопка ≥44pt (шеврон + подпись статуса + круглый бейдж-счётчик, фон --line),
// по дефолту свёрнута. Цветной точки статуса в шапке нет — статус несёт подпись
// (DESIGN-STANDARD §3.4); цвет живёт в бейдже на карточке.

// NET-33: та же группа обслуживает и деление по статусу (сеть), и деление
// «работают / применимы» под выбранным парком. Отличаются только подпись (`label`)
// и режим карточки (`mode`); механика сворачивания одна — второй компонент с той же
// механикой разъехался бы с этим при первой же правке.
defineProps({
  status: { type: String, required: true },
  label: { type: String, default: '' },
  mode: { type: String, default: '' },
  drivers: { type: Array, default: () => [] },
  parkIds: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
})
defineEmits(['toggle'])
</script>

<template>
  <section v-if="drivers.length" class="flex flex-col gap-2">
    <button
      type="button"
      class="flex items-center gap-2 rounded-xl px-1 py-1 text-left active:bg-[var(--surface-2)]"
      style="min-height: 44px"
      :aria-expanded="open"
      :aria-controls="`drv-group-${status}`"
      @click="$emit('toggle', status)"
    >
      <ChevronRight
        class="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150"
        :class="open ? 'rotate-90' : 'rotate-0'"
        :stroke-width="2"
        aria-hidden="true"
      />
      <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ label || statusLabel(status) }}</h2>
      <span
        class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--line)] px-1.5 text-[0.8125rem] font-medium leading-none text-[var(--text-secondary)]"
      >{{ drivers.length }}</span>
    </button>

    <div v-show="open" :id="`drv-group-${status}`" class="flex flex-col gap-3">
      <DriverCard v-for="d in drivers" :key="d.code" :driver="d" :park-ids="parkIds" :mode="mode" />
    </div>
  </section>
</template>
