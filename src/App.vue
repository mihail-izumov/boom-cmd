<script setup>
import { ChartColumnBig, Folder, House, Layers } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import HomeScreen from './screens/HomeScreen.vue'
import AnalyticsScreen from './screens/AnalyticsScreen.vue'
import ProjectsScreen from './screens/ProjectsScreen.vue'
import MaterialsScreen from './screens/MaterialsScreen.vue'
import ParksScreen from './screens/ParksScreen.vue'
import { useAppNav, setActive, clearSubView } from './composables/useAppNav.js'

// Конфиг вкладок. Флаг `parkFilter` — где в шапке показывать чёрный бедж
// активного парк-фильтра (TZ-3.1 §5). Сейчас только Проекты — на Аналитике
// и Материалах включим, когда там появится использующий контекст контент (Ф5+).
// `parkFilter: true` у рабочих разделов (TZ-3.2 §2): Аналитика/Проекты/Материалы.
// На Home и под-странице «Парки» фильтра нет.
const tabs = [
  { id: 'home',      label: 'Главная',   title: 'Главная',   icon: House,          screen: HomeScreen,      parkFilter: false, leadingAction: 'hardReload' },
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
</script>

<template>
  <AppShell
    :tabs="tabs"
    :active="active"
    :sub-view="subView"
    :sub-views="subViews"
    @update:active="(id) => setActive(id)"
    @back="clearSubView"
  />
</template>
