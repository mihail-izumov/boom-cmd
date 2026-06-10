<script setup>
import { computed, reactive, ref } from 'vue'
import { useProjects } from '../composables/useProjects.js'
import { useParkContext } from '../composables/useParkContext.js'
import {
  STATUS_ORDER,
  STATUS_DEFAULT_OPEN,
  priorityRank,
  pluralRu,
  PROJECTS_PLURAL,
} from '../i18n/projects.js'
import ProjectSection from '../components/projects/ProjectSection.vue'
import ProjectDetail from '../components/projects/ProjectDetail.vue'

const { projects, loading, error, reload } = useProjects()
const { current: parkCtx, isNetwork, currentName } = useParkContext()

// Фильтр по глобальному парк-контексту — чистое разделение (TZ-3.3 §1):
//   isNetwork === true → только общесетевые (parks === 'network');
//   id парка           → только проекты, привязанные к этому парку
//                        (Array.isArray(parks) && parks.includes(id)).
// Никакого «всё подряд» / смешивания общесетевых с парк-специфичными.
const visibleProjects = computed(() => {
  if (isNetwork.value) {
    return projects.value.filter((p) => p.parks === 'network')
  }
  const id = parkCtx.value
  return projects.value.filter(
    (p) => Array.isArray(p.parks) && p.parks.includes(id),
  )
})

// Группировка по статусу + сортировка внутри группы:
//   Urgent(1) → High(2) → Medium(3) → Low(4) → None(0) в конце;
//   при равенстве — стабильный порядок мока (Array.prototype.sort стабилен в V8).
const grouped = computed(() => {
  const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]))
  for (const p of visibleProjects.value) {
    if (p.status in map) map[p.status].push(p)
  }
  for (const s of STATUS_ORDER) {
    map[s].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
  }
  return map
})

// Видимые группы (TZ-3.4): рендерим только статусы с ≥1 проектом.
// Порядок STATUS_ORDER сохраняется.
const visibleStatuses = computed(() =>
  STATUS_ORDER.filter((s) => grouped.value[s].length > 0),
)

// Состояние сворачивания — reactive на сессию, без localStorage.
// При смене scope не сбрасываем: user-state по статусу сохраняется,
// «оживший» статус в новом scope откроется в том виде, в котором юзер
// оставил его в прошлый раз (TZ-3.4 §2 — watcher не добавляем).
const openMap = reactive({ ...STATUS_DEFAULT_OPEN })
function toggle(status) {
  openMap[status] = !openMap[status]
}

const total = computed(() => visibleProjects.value.length)

const openProject = ref(null)
function open(project) {
  openProject.value = project
}
function close() {
  openProject.value = null
}
</script>

<template>
  <section class="flex flex-col gap-4 px-3 pb-6 pt-2">
    <!-- loading -->
    <div
      v-if="loading"
      class="flex flex-col gap-5"
      aria-busy="true"
      aria-label="Загрузка"
    >
      <div v-for="i in 3" :key="i" class="flex flex-col gap-2">
        <div class="h-4 w-40 rounded bg-[var(--surface-2)]" />
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
      <p class="text-[1.0625rem] text-[var(--text)]">Не удалось загрузить проекты</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ error }}</p>
      <button
        type="button"
        class="rounded-full bg-[var(--accent)] px-4 py-2 text-[0.9375rem] font-medium text-[var(--accent-ink)] active:opacity-90"
        style="min-height: 44px"
        @click="reload"
      >Повторить</button>
    </div>

    <!-- empty: под выбранный scope нет проектов (TZ-3.4 §1 — единый empty-state) -->
    <div
      v-else-if="!visibleProjects.length"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">
        <template v-if="isNetwork">В разделе «Вся сеть» проектов нет</template>
        <template v-else>В парке «{{ currentName }}» проектов нет</template>
      </p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">
        <template v-if="isNetwork">Сейчас нет общесетевых проектов. Парк-специфичные смотрите по конкретному парку в фильтре сверху.</template>
        <template v-else>Выберите другой парк или «Вся сеть» в фильтре сверху.</template>
      </p>
    </div>

    <!-- data: рендерим только непустые статус-группы (TZ-3.4 §1) -->
    <template v-else>
      <p class="px-1 text-[0.8125rem] text-[var(--text-muted)]">
        Всего {{ total }} {{ pluralRu(total, PROJECTS_PLURAL) }}
      </p>
      <ProjectSection
        v-for="s in visibleStatuses"
        :key="s"
        :status="s"
        :projects="grouped[s]"
        :open="openMap[s]"
        @toggle="toggle"
        @open-project="open"
      />
    </template>

    <ProjectDetail v-if="openProject" :project="openProject" @close="close" />
  </section>
</template>
