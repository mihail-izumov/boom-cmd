<script setup>
import { computed } from 'vue'
import { parkLabelForCard, parkLabelForDetail } from '../../i18n/projects.js'

// Парк-бейдж — показываем ТОЛЬКО для парк-специфичных проектов (parks !== "all"),
// чтобы не шуметь общесетевыми (PRODUCT-PRINCIPLES §3/§4, TZ-2-Projects §5/§7).
// На карточке: правило 1 / «A · B» / «N парков» (parkLabelForCard).
// В модалке: явное «Вся сеть» или полный перечень (verbose=true → parkLabelForDetail).

const props = defineProps({
  parks: { type: [String, Array], default: 'all' },
  verbose: { type: Boolean, default: false },
})

const label = computed(() =>
  props.verbose ? parkLabelForDetail(props.parks) : parkLabelForCard(props.parks),
)
</script>

<template>
  <span
    v-if="label"
    class="inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[0.75rem] font-medium text-[var(--text-secondary)]"
  >{{ label }}</span>
</template>
