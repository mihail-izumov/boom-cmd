<script setup>
import { computed, watch, watchEffect } from 'vue'
import { ChartColumnBig, Layers, Newspaper } from 'lucide-vue-next'
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
import ReviewsScreen from './screens/ReviewsScreen.vue'
import DriversSection from './components/drivers/DriversSection.vue'
import SharkEyesIcon from './components/icons/SharkEyesIcon.vue'
import AccessKeyForm from './components/AccessKeyForm.vue'
import ReporterShell from './components/report/ReporterShell.vue'
import { useAppNav, setActive, setSubView, clearSubView } from './composables/useAppNav.js'
import { useAccessKey } from './composables/useAccessKey.js'
import { flushQueue } from './composables/useLoginIssue.js'
import { setThemeColor, AUTH_THEME_COLOR, APP_THEME_COLOR } from './composables/useThemeColor.js'

// Конфиг вкладок. Флаг `parkFilter` — где в шапке показывать чёрный бедж
// активного парк-фильтра (TZ-3.1 §5). `parkFilter: true` у рабочих разделов
// (Прогресс/Проекты). На Home, «Трендах» (контент сетевой) и под-страницах
// «Парки»/«Материалы»* фильтра/бейджа по правилам ниже.
// `eyebrow` — бейдж над крупным заголовком (Home: «БУМБАСТИК», графит).
//
// Состав таб-бара — правка владельца 28.07: Сегодня · Тренды · Прогресс · Проекты.
// «Тренды» подняты из под-страницы во вкладку (id остался `summary` — он живёт в
// useAppNav и тестах); «Материалы» убраны из таб-бара и стали под-страницей
// (вход — плиткой с Главной, см. subViews ниже).
const tabs = [
  // Подпись вкладки — «Сегодня» (правка владельца 26.07). Идентификатор вкладки
  // остался `home`: он живёт в useAppNav, в тестах и в глубоких ссылках.
  //
  // D-20 (28.07): заголовка у Главной НЕТ — `title: ''`. «Мастерплан» ушёл: это
  // внутреннее имя модуля, а имя продукта («Ранскейл») внутри приложения не
  // пишется нигде — на Главной живёт клиент. Экран подписан «Сегодня» в таб-баре,
  // дублировать нечем. Шапка Главной = чип бизнеса (eyebrow → BusinessChip) плюс
  // строка периода «<Месяц Год>: парки», которая живёт в самом HomeScreen.
  { id: 'home',      label: 'Сегодня',  title: '',          icon: SharkEyesIcon,  screen: HomeScreen,      parkFilter: false, leadingAction: 'hardReload', eyebrow: 'БУМБАСТИК' },
  // «Тренды» (бывш. «Сводки сети») — сетевые сводки, парк-фильтра нет:
  // содержимое всегда по сети целиком. Селектор месяца живёт в правом углу шапки.
  { id: 'summary',   label: 'Тренды',   title: 'Тренды',    icon: Newspaper,      screen: SummaryScreen,   parkFilter: false },
  // Раздел переименован «Аналитика» → «Прогресс» (правка владельца 28.07).
  // Идентификатор вкладки остался `analytics`: он живёт в useAppNav и тестах.
  { id: 'analytics', label: 'Прогресс', title: 'Прогресс',  icon: ChartColumnBig, screen: AnalyticsScreen, parkFilter: true  },
  // Раздел переименован «Проекты» → «Задачи» (правка владельца 28.07, только
  // название). Идентификатор остался `projects` — живёт в useAppNav и тестах.
  { id: 'projects',  label: 'Задачи',   title: 'Задачи',    icon: Layers,         screen: ProjectsScreen,  parkFilter: true  },
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
  // «Разборы» (D-19) — журнал «Разбор полёта». Вход ТОЛЬКО с Главной
  // (плитка-счётчик в полосе чекапы/сигналы/разборы); в таб-баре раздела нет.
  // Разборы общесистемные — парк-фильтра нет.
  reviews: {
    title: 'Разборы',
    screen: ReviewsScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: false,
  },
  // «Материалы» — с 28.07 не вкладка, а под-страница (вход плиткой с Главной).
  // Парк-контекст ведёт контент — бейдж фильтра показываем (parkFilter: true).
  materials: {
    title: 'Материалы',
    screen: MaterialsScreen,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: true,
  },
  // «Драйверы роста» (30.07) — что подключено в каждом парке, что готовится,
  // что в очереди. Вход — плиткой с Главной; в таб-баре раздела нет.
  // `parkFilter: true` — выбор парка ОДИН В ОДИН как в «Задачах»: пилюля в шапке
  // (ParkFilterPill) + bottom-sheet «Выбрать парк» (ParkPickerSheet), их рисует
  // оболочка. Своих контролов парка раздел не заводит.
  drivers: {
    title: 'Драйверы роста',
    screen: DriversSection,
    showBack: true,
    backLabel: 'Главная',
    parkFilter: true,
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

const { active, subView, subOrigin } = useAppNav()

// Возврат «откуда пришли» (задание 06.08 §3.3). У «Отчёта дня» родитель статический
// (`backTo` в конфиге), у «Драйверов роста» он зависит от входа: с Главной — назад на
// Главную, из «Контроля дня» — назад в «Контроль дня», чтобы не потерять раскрытые
// недели и выбранный месяц. Динамический вход накладываем поверх конфига здесь, а не
// правим конфиг — так у под-страницы остаётся понятное значение по умолчанию.
const navSubViews = computed(() => {
  const key = subView.value
  const o = subOrigin.value
  if (!key || !o || !subViews[key]) return subViews
  return {
    ...subViews,
    [key]: { ...subViews[key], backTo: o.to, backLabel: o.label || subViews[key].backLabel },
  }
})

function onBack() {
  const sv = subView.value && navSubViews.value[subView.value]
  if (sv && sv.backTo) setSubView(sv.backTo)
  else clearSubView()
}

// Гейт на весь вход: пока фраза не подтверждена — экран входа вместо оболочки.
// role === 'reporter' (вторая фраза, D-12 §9-A) → только «Отчёт дня» без оболочки.
const {
  authed, role, ready, checking, keyError, netError, netHint, attempt, lastFailure,
  notice, init, submitKey,
} = useAccessKey()
init()

// D-22: досылка накопленных заявок «Проблемы со входом». Момент выбран не
// случайно — ТОЛЬКО после успешного входа: именно тогда связь заведомо есть.
// Заявка от человека, у которого связи не было, иначе не дошла бы никогда, а это
// ровно те случаи, ради которых форма и делалась: без очереди мы систематически
// видели бы только лёгкие сбои и ни одного тяжёлого.
watch(authed, (v) => {
  if (v) flushQueue()
})

// D-21 v2: пока идёт вход (и стартовая проверка фразы) — тёмная системная шапка,
// как только вошли — светлая. Тёмная витрина живёт ТОЛЬКО на входе и сплэше.
watchEffect(() => setThemeColor(authed.value ? APP_THEME_COLOR : AUTH_THEME_COLOR))
</script>

<template>
  <!-- стартовая проверка фразы — чтобы не мигать формой входа.
       Тёмный скоуп тот же, что у входа: иначе между загрузкой и формой
       мигало бы светлым (эта фаза — часть витрины входа, а не приложения). -->
  <div
    v-if="!ready"
    data-theme="auth-dark"
    class="flex min-h-[100svh] items-center justify-center bg-[var(--bg)]"
    aria-busy="true"
  >
    <p class="text-[0.9375rem] text-[var(--text-secondary)]">Загрузка…</p>
  </div>

  <!-- гейт на весь вход: без подтверждённой фразы оболочка не показывается -->
  <AccessKeyForm
    v-else-if="!authed"
    :error="keyError"
    :loading="checking"
    :net-error="netError"
    :net-hint="netHint"
    :attempt="attempt"
    :failure="lastFailure"
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
    :sub-views="navSubViews"
    @update:active="(id) => setActive(id)"
    @back="onBack"
  />
</template>
