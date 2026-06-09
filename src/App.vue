<script setup>
import { ref } from 'vue'
import { ChartColumnBig, ListChecks, Folder } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import AnalyticsScreen from './screens/AnalyticsScreen.vue'
import TasksScreen from './screens/TasksScreen.vue'
import MaterialsScreen from './screens/MaterialsScreen.vue'

const tabs = [
  { id: 'analytics', label: 'Аналитика', title: 'Аналитика', icon: ChartColumnBig, screen: AnalyticsScreen },
  { id: 'tasks',     label: 'Задачи',    title: 'Задачи',    icon: ListChecks,     screen: TasksScreen },
  { id: 'materials', label: 'Материалы', title: 'Материалы', icon: Folder,         screen: MaterialsScreen },
]
const active = ref('analytics')
</script>

<template>
  <AppShell :tabs="tabs" :active="active" @update:active="(id) => (active = id)" />
</template>
