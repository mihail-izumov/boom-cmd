<script setup>
import { ref } from 'vue'
import { ChartColumnBig, Layers, Folder } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import AnalyticsScreen from './screens/AnalyticsScreen.vue'
import ProjectsScreen from './screens/ProjectsScreen.vue'
import MaterialsScreen from './screens/MaterialsScreen.vue'

const tabs = [
  { id: 'analytics', label: 'Аналитика', title: 'Аналитика', icon: ChartColumnBig, screen: AnalyticsScreen },
  { id: 'projects',  label: 'Проекты',   title: 'Проекты',   icon: Layers,         screen: ProjectsScreen },
  { id: 'materials', label: 'Материалы', title: 'Материалы', icon: Folder,         screen: MaterialsScreen },
]
const active = ref('analytics')
</script>

<template>
  <AppShell :tabs="tabs" :active="active" @update:active="(id) => (active = id)" />
</template>
