<script setup>
import { computed, ref } from 'vue'
import { useRoadmap } from '../composables/useRoadmap.js'
import { STATUS_ORDER, pluralRu, TASKS_PLURAL } from '../i18n/roadmap.js'
import RoadmapSection from '../components/roadmap/RoadmapSection.vue'
import CardDetail from '../components/roadmap/CardDetail.vue'

const { cards, loading, error, reload } = useRoadmap()

// Группировка по статусу. Неизвестный статус остаётся в данных, но не отображается —
// фолбэк-секция могла бы скрывать ошибки, лучше явно игнорировать в UI.
const grouped = computed(() => {
  const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]))
  for (const c of cards.value) {
    if (c.status in map) map[c.status].push(c)
  }
  return map
})

// Скрываем пустую секцию Canceled (по решению пункта 2 рекомендаций).
const visibleSections = computed(() =>
  STATUS_ORDER.filter(
    (s) => s !== 'Canceled' || (grouped.value[s]?.length || 0) > 0,
  ),
)

const total = computed(() => cards.value.length)

const open = ref(null)
function openCard(card) {
  open.value = card
}
function closeCard() {
  open.value = null
}
</script>

<template>
  <section class="flex flex-col gap-4 px-3 pb-6 pt-2">
    <!-- loading: скелет секций и карточек -->
    <div
      v-if="loading"
      class="flex flex-col gap-5"
      aria-busy="true"
      aria-label="Загрузка"
    >
      <div v-for="i in 3" :key="i" class="flex flex-col gap-2">
        <div class="h-4 w-32 rounded bg-[var(--surface-2)]" />
        <div class="flex flex-col gap-2">
          <div
            v-for="j in 2"
            :key="j"
            class="h-20 rounded-2xl border border-[var(--line)] bg-[var(--surface)]"
          />
        </div>
      </div>
      <p class="px-1 text-[0.875rem] text-[var(--text-muted)]">Загрузка…</p>
    </div>

    <!-- error -->
    <div
      v-else-if="error"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">Не удалось загрузить роадмап</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >Повторить</button>
    </div>

    <!-- empty -->
    <div
      v-else-if="!cards.length"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">Пока пусто</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">
        Роадмап появится здесь, когда команда добавит задачи.
      </p>
    </div>

    <!-- data -->
    <template v-else>
      <p class="px-1 text-[0.8125rem] text-[var(--text-muted)]">
        Всего {{ total }} {{ pluralRu(total, TASKS_PLURAL) }}
      </p>
      <RoadmapSection
        v-for="s in visibleSections"
        :key="s"
        :status="s"
        :cards="grouped[s]"
        @open="openCard"
      />
    </template>

    <CardDetail v-if="open" :card="open" @close="closeCard" />
  </section>
</template>
