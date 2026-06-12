<script setup>
import { computed, ref } from 'vue'
import { useMaterials } from '../composables/useMaterials.js'
import { useParkContext } from '../composables/useParkContext.js'
import { pluralRu } from '../i18n/projects.js'
import {
  MATERIALS_PLURAL,
  OTHER_TYPE,
  orderTypeGroups,
  sortByDateDesc,
} from '../i18n/materials.js'
import MaterialSection from '../components/materials/MaterialSection.vue'
import MaterialDetail from '../components/materials/MaterialDetail.vue'

// Витрина «Материалы» (TZ-5.2, Этап 2 Фазы 5). Каркас = ProjectsScreen:
// 4 состояния (loading/error/empty/data) + чистое разделение парк-фильтра.
// Решения владельца: группировка по type; детали — в модалке; ссылки
// наружу только из модалки. Сворачивания групп нет (упрощение vs Проекты).

const { materials, loading, error, reload } = useMaterials()
const { current: parkCtx, isNetwork, currentName } = useParkContext()

// Фильтр по глобальному парк-контексту — чистое разделение (TZ-3.3 §1):
//   isNetwork === true → только общесетевые (parks === 'network');
//   id парка           → только материалы этого парка.
// Никакого смешивания.
const visibleMaterials = computed(() => {
  if (isNetwork.value) {
    return materials.value.filter((m) => m.parks === 'network')
  }
  const id = parkCtx.value
  return materials.value.filter(
    (m) => Array.isArray(m.parks) && m.parks.includes(id),
  )
})

// Группировка по type (пустой → «Прочее»); внутри группы — сортировка
// по last_updated desc, невалидные/пустые даты в конец.
const grouped = computed(() => {
  const map = {}
  for (const m of visibleMaterials.value) {
    const key = m.type || OTHER_TYPE
    if (!map[key]) map[key] = []
    map[key].push(m)
  }
  for (const key of Object.keys(map)) {
    map[key] = sortByDateDesc(map[key])
  }
  return map
})

// Видимые группы: известные типы в фиксированном порядке → новые по
// алфавиту → «Прочее». Пустые не рендерятся (в map их и нет).
const visibleTypes = computed(() => orderTypeGroups(Object.keys(grouped.value)))

const total = computed(() => visibleMaterials.value.length)

const openMaterial = ref(null)
function open(material) {
  openMaterial.value = material
}
function close() {
  openMaterial.value = null
}
</script>

<template>
  <section class="flex flex-col gap-4 px-3 pb-6 pt-2">
    <!-- loading: skeleton по форме карточки (64×64 + строки 70%/40%) -->
    <div
      v-if="loading"
      class="flex flex-col gap-5"
      aria-busy="true"
      aria-label="Загрузка"
    >
      <div v-for="i in 3" :key="i" class="flex flex-col gap-2">
        <div class="bc-skeleton h-4 w-40 rounded" />
        <div class="flex flex-col gap-2">
          <div
            v-for="j in 2"
            :key="j"
            class="flex items-center gap-3 rounded-2xl border border-[var(--line)] p-3"
          >
            <div class="bc-skeleton h-16 w-16 shrink-0 rounded-2xl" />
            <div class="flex flex-1 flex-col gap-2">
              <div class="bc-skeleton h-4 w-[70%] rounded" />
              <div class="bc-skeleton h-3 w-[40%] rounded" />
            </div>
          </div>
        </div>
      </div>
      <p class="px-1 text-[0.875rem] text-[var(--text-muted)]">Загрузка…</p>
    </div>

    <!-- error -->
    <div
      v-else-if="error"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">Не удалось загрузить материалы</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >Повторить</button>
    </div>

    <!-- empty: под выбранный scope нет материалов -->
    <div
      v-else-if="!visibleMaterials.length"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">
        <template v-if="isNetwork">В разделе «Вся сеть» материалов нет</template>
        <template v-else>В парке «{{ currentName }}» материалов нет</template>
      </p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">
        <template v-if="isNetwork">Сейчас нет общесетевых материалов. Парк-специфичные смотрите по конкретному парку в фильтре сверху.</template>
        <template v-else>Выберите другой парк или «Вся сеть» в фильтре сверху.</template>
      </p>
    </div>

    <!-- data: только непустые группы-типы -->
    <template v-else>
      <p class="bc-fade-in px-1 text-[0.8125rem] text-[var(--text-muted)]">
        Всего {{ total }} {{ pluralRu(total, MATERIALS_PLURAL) }}
      </p>
      <MaterialSection
        v-for="type in visibleTypes"
        :key="type"
        class="bc-fade-in"
        :type="type"
        :materials="grouped[type]"
        @open-material="open"
      />
    </template>

    <MaterialDetail v-if="openMaterial" :material="openMaterial" @close="close" />
  </section>
</template>
