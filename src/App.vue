<script setup>
import { ChartColumnBig, Folder, Layers } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import HomeScreen from './screens/HomeScreen.vue'
import AnalyticsScreen from './screens/AnalyticsScreen.vue'
import ProjectsScreen from './screens/ProjectsScreen.vue'
import MaterialsScreen from './screens/MaterialsScreen.vue'
import ParksScreen from './screens/ParksScreen.vue'
import SharkEyesIcon from './components/icons/SharkEyesIcon.vue'
import AccessKeyForm from './components/AccessKeyForm.vue'
import { useAppNav, setActive, clearSubView } from './composables/useAppNav.js'
import { useAccessKey } from './composables/useAccessKey.js'

// Конфиг вкладок. Флаг `parkFilter` — где в шапке показывать чёрный бедж
// активного парк-фильтра (TZ-3.1 §5). Сейчас только Проекты — на Аналитике
// и Материалах включим, когда там появится использующий контекст контент (Ф5+).
// `parkFilter: true` у рабочих разделов (TZ-3.2 §2): Аналитика/Проекты/Материалы.
// На Home и под-странице «Парки» фильтра нет.
const tabs = [
  // title Home — «БУМБАСТИК» (ревизия 12.06.2026): бренд в шапке,
  // label вкладки в таб-баре остаётся «Главная».
  { id: 'home',      label: 'Главная',   title: 'БУМБАСТИК', icon: SharkEyesIcon,  screen: HomeScreen,      parkFilter: false, leadingAction: 'hardReload' },
  { id: 'analytics', label: 'Аналитика', title: 'Аналитика', icon: ChartColumnBig, screen: AnalyticsScreen, parkFilter: true  },
  { id: 'projects',  label: 'Проекты',   title: 'Проекты',   icon: Layers,         screen: ProjectsScreen,  parkFilter: true  },
  { id: 'materials', label: 'Материалы', title: 'Материалы', icon: Folder,         screen: MaterialsScreen, parkFilter: true  },
]

// Под-страницы (мини-стек глубиной 1). На под-странице бедж-фильтра нет.
const subViews = {
  parks: {
    title: 'Парки',
    screen: ParksScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: false,
  },
}

const { active, subView } = useAppNav()

// Гейт на весь вход: пока фраза не подтверждена — экран входа вместо оболочки.
const { authed, ready, checking, keyError, netError, notice, init, submitKey } =
  useAccessKey()
init()
</script>

<template>
  <!-- стартовая проверка фразы — чтобы не мигать формой входа -->
  <div
    v-if="!ready"
    class="flex min-h-[100svh] items-center justify-center bg-[var(--bg)]"
    aria-busy="true"
  >
    <p class="text-[0.9375rem] text-[var(--text-muted)]">Загрузка…</p>
  </div>

  <!-- гейт на весь вход: без подтверждённой фразы оболочка не показывается -->
  <AccessKeyForm
    v-else-if="!authed"
    :error="keyError"
    :loading="checking"
    :net-error="netError"
    :notice="notice"
    @submit="submitKey"
  />

  <AppShell
    v-else
    :tabs="tabs"
    :active="active"
    :sub-view="subView"
    :sub-views="subViews"
    @update:active="(id) => setActive(id)"
    @back="clearSubView"
  />
</template>
