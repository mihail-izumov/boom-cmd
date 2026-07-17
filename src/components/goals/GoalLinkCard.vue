<script setup>
import { ExternalLink } from 'lucide-vue-next'
import { L } from '../../i18n/goals.js'

// Карта-ссылка «Цели и планы»: чип типа (монохром) + заголовок + иконка внешней ссылки.
// В обычном браузере — обычная <a target="_blank"> (новая вкладка). В установленном
// PWA (standalone) same-origin ссылка с target=_blank открывается ВНУТРИ приложения
// без кнопки закрытия и «застревает». Поэтому в standalone перехватываем клик и
// открываем через window.open — внешний браузер/SafariVC, закрывается как b00m.fun.
const props = defineProps({ item: { type: Object, required: true } })

function isStandalone() {
  try {
    return (
      typeof window !== 'undefined' &&
      ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true)
    )
  } catch {
    return false
  }
}

function onOpen(e) {
  if (isStandalone()) {
    e.preventDefault()
    window.open(props.item.url, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <a
    :href="item.url"
    target="_blank"
    rel="noopener noreferrer"
    class="flex w-full items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 44px"
    :aria-label="`${item.title} — ${L.open_new_tab}`"
    @click="onOpen"
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
