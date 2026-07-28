<script setup>
import { ChartColumnBig, Folder, Layers } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import HomeScreen from './screens/HomeScreen.vue'
import AnalyticsScreen from './screens/AnalyticsScreen.vue'
import ProjectsScreen from './screens/ProjectsScreen.vue'
import MaterialsScreen from './screens/MaterialsScreen.vue'
import ParksScreen from './screens/ParksScreen.vue'
import DailyScreen from './screens/DailyScreen.vue'
import GoalsScreen from './screens/GoalsScreen.vue'
import SummaryScreen from './screens/SummaryScreen.vue'
import DailyReportScreen from './screens/DailyReportScreen.vue'
import SharkEyesIcon from './components/icons/SharkEyesIcon.vue'
import AccessKeyForm from './components/AccessKeyForm.vue'
import ReporterShell from './components/report/ReporterShell.vue'
import { useAppNav, setActive, setSubView, clearSubView } from './composables/useAppNav.js'
import { useAccessKey } from './composables/useAccessKey.js'

// Конфиг вкладок. Флаг `parkFilter` — где в шапке показывать чёрный бедж
// активного парк-фильтра (TZ-3.1 §5). `parkFilter: true` у рабочих разделов
// (Прогресс/Проекты/Материалы). На Home и под-странице «Парки» фильтра нет.
// `eyebrow` — бейдж над крупным заголовком (Home: «БУМБАСТИК», графит).
const tabs = [
  // Подпись вкладки — «Сегодня» (правка владельца 26.07). Идентификатор вкладки
  // остался `home`: он живёт в useAppNav, в тестах и в глубоких ссылках.
  { id: 'home',      label: 'Сегодня',   title: 'Мастерплан', icon: SharkEyesIcon,  screen: HomeScreen,      parkFilter: false, leadingAction: 'hardReload', eyebrow: 'БУМБАСТИК' },
  // Раздел переименован «Аналитика» → «Прогресс» (правка владельца 28.07).
  // Идентификатор вкладки остался `analytics`: он живёт в useAppNav и тестах.
  { id: 'analytics', label: 'Прогресс',  title: 'Прогресс',  icon: ChartColumnBig, screen: AnalyticsScreen, parkFilter: true  },
  { id: 'projects',  label: 'Проекты',   title: 'Проекты',   icon: Layers,         screen: ProjectsScreen,  parkFilter: true  },
  { id: 'materials', label: 'Материалы', title: 'Материалы', icon: Folder,         screen: MaterialsScreen, parkFilter: true  },
]

// Под-страницы (мини-стек глубиной 1). На под-странице бедж-фильтра нет — кроме
// «Контроль дня» и «Цели и планы», где парк-контекст ведёт контент (parkFilter: true).
const subViews = {
  parks: {
    title: 'Парки',
    screen: ParksScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: false,
  },
  daily: {
    title: 'Контроль Дня',
    screen: DailyScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: true,
  },
  goals: {
    title: 'Цели и планы',
    screen: GoalsScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: true,
  },
  // «Тренды» (бывш. «Сводки сети», правка владельца 28.07) — сетевые сводки
  // дня/недели/месяца. Парк-фильтра нет: содержимое всегда по сети целиком
  // (итог сети = Σ парков считается на стороне данных). Идентификатор — `summary`.
  summary: {
    title: 'Тренды',
    screen: SummaryScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: false,
  },
  // «Отчёт Дня» (D-12) — единственная пишущая страница; открывается кнопкой
  // «Добавить отчёт» из «Контроля Дня». `backTo` — статический возврат на
  // родительскую под-страницу (стек по-прежнему глубиной 1, без роутера).
  'daily-report': {
    title: 'Отчёт Дня',
    screen: DailyReportScreen,
    showBack: true,
    backLabel: 'Контроль Дня',
    backTo: 'daily',
    parkFilter: false,
  },
}

const { active, subView } = useAppNav()

// Назад с под-страницы: у «Отчёта дня» возврат на «Контроль Дня» (backTo),
// у остальных — на Главную (как раньше).
function onBack() {
  const sv = subView.value && subViews[subView.value]
  if (sv && sv.backTo) setSubView(sv.backTo)
  else clearSubView()
}

// Гейт на весь вход: пока фраза не подтверждена — экран входа вместо оболочки.
// role === 'reporter' (вторая фраза, D-12 §9-A) → только «Отчёт дня» без оболочки.
const { authed, role, ready, checking, keyError, netError, notice, init, submitKey } =
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

  <!-- режим репортёра: только форма «Отчёт дня», цифры сети не загружаются -->
  <ReporterShell v-else-if="role === 'reporter'" />

  <AppShell
    v-else
    :tabs="tabs"
    :active="active"
    :sub-view="subView"
    :sub-views="subViews"
    @update:active="(id) => setActive(id)"
    @back="onBack"
  />
</template>
