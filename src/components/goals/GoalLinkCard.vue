<script setup>
import { ExternalLink } from 'lucide-vue-next'
import { L } from '../../i18n/goals.js'

// Карта-ссылка «Цели и прогнозы»: чип типа (монохром, как DirectionChip) + заголовок +
// иконка внешней ссылки. Открывает страницу в новом окне (target=_blank, noopener).
defineProps({ item: { type: Object, required: true } })
</script>

<template>
  <a
    :href="item.url"
    target="_blank"
    rel="noopener noreferrer"
    class="flex w-full items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 44px"
    :aria-label="`${item.title} — ${L.open_new_tab}`"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <span
        v-if="item.type"
        class="inline-flex w-fit items-center rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.75rem] font-medium leading-tight text-[var(--text-secondary)]"
      >{{ item.type }}</span>
      <span class="text-[1rem] font-medium leading-snug text-[var(--text)]">{{ item.title }}</span>
    </div>
    <ExternalLink class="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
  </a>
</template>
