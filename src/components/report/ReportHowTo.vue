<script setup>
import { computed, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { HOWTO_TITLE, HOWTO_NOTE, howtoRowsFor } from '../../i18n/report.js'

// «Как получить отчёт» (v2.4 Ф-6, NET-152) — шпаргалка по настройке отчёта в кассе,
// перенесённая внутрь формы. Хинты полей говорят, КАКОЕ число брать; этот блок — как
// СОБРАТЬ отчёт, из которого его брать. Ошибки «взяла отчёт с фильтром» и «поменяла
// группировки» рождаются в кассе, до формы, и раньше жили только в отдельных шпаргалках.
//
// Свёрнут по умолчанию: для рутины он не нужен, а занимать экран у тех, кто всё знает,
// незачем. Раскрытость запоминается на устройстве (localStorage) — это удобство, а не
// данные: пропало хранилище (приватный режим, чистка) — блок просто снова свёрнут.
// К браузеру — только через `window.*`: голый `localStorage` в jsdom и в редких
// контекстах бросает ReferenceError, который catch проглотил бы молча.

const props = defineProps({
  park: { type: String, required: true },
})

const LS_KEY = 'bc:report:howto_open'

function readOpen() {
  try {
    return window.localStorage.getItem(LS_KEY) === '1'
  } catch {
    return false
  }
}
function writeOpen(v) {
  try {
    window.localStorage.setItem(LS_KEY, v ? '1' : '0')
  } catch {
    /* хранилище недоступно — состояние живёт до перезагрузки, и это не беда */
  }
}

const open = ref(readOpen())
function toggle() {
  open.value = !open.value
  writeOpen(open.value)
}

const rows = computed(() => howtoRowsFor(props.park))
</script>

<template>
  <section
    v-if="rows.length"
    data-test="report-howto"
    class="bc-fade-in rounded-2xl bg-[var(--surface)] shadow-sm"
  >
    <button
      type="button"
      data-test="report-howto-toggle"
      class="flex min-h-[44px] w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left active:bg-[var(--surface-2)]"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="rep-howto-body"
      @click="toggle"
    >
      <span class="text-[0.875rem] font-semibold text-[var(--text-secondary)]">{{ HOWTO_TITLE }}</span>
      <ChevronDown
        class="ml-auto h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
        :stroke-width="2"
        aria-hidden="true"
      />
    </button>

    <div v-if="open" id="rep-howto-body" data-test="report-howto-body" class="px-4 pb-3.5">
      <dl class="flex flex-col gap-2">
        <div v-for="r in rows" :key="r.label">
          <dt class="text-[0.75rem] font-medium text-[var(--text-muted)]">{{ r.label }}</dt>
          <dd class="text-[0.9375rem] leading-snug text-[var(--text)]">{{ r.value }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-[0.8125rem] leading-snug text-[var(--text-secondary)]">{{ HOWTO_NOTE }}</p>
    </div>
  </section>
</template>
