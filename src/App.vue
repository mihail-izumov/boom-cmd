<script setup>
import { ref } from 'vue'
import { ChartColumnBig, Folder, House, Layers } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import HomeScreen from './screens/HomeScreen.vue'
import AnalyticsScreen from './screens/AnalyticsScreen.vue'
import ProjectsScreen from './screens/ProjectsScreen.vue'
import MaterialsScreen from './screens/MaterialsScreen.vue'

const tabs = [
  { id: 'home',      label: 'Главная',   title: 'Главная',   icon: House,          screen: HomeScreen },
  { id: 'analytics', label: 'Аналитика', title: 'Аналитика', icon: ChartColumnBig, screen: AnalyticsScreen },
  { id: 'projects',  label: 'Проекты',   title: 'Проекты',   icon: Layers,         screen: ProjectsScreen },
  { id: 'materials', label: 'Материалы', title: 'Материалы', icon: Folder,         screen: MaterialsScreen },
]
const active = ref('home')
</script>

<template>
  <AppShell :tabs="tabs" :active="active" @update:active="(id) => (active = id)" />
</template>
