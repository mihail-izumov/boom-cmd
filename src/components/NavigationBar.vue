<script setup>
import { ref } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import ParkFilterPill from './navigation/ParkFilterPill.vue'
import ParkPickerSheet from './navigation/ParkPickerSheet.vue'
import BusinessChip from './business/BusinessChip.vue'
import SyncIcon from './icons/SyncIcon.vue'
import { useNavCaption } from '../composables/useNavCaption.js'
import { useNavTrailing } from '../composables/useNavTrailing.js'

// Шапка навигации (TZ-3.2 + правка по запросу владельца):
//   - sticky compact-bar сверху: back / leading-action слева, центрированный
//     компактный заголовок по полной ширине бара (absolute-позиционирование),
//     компактная пилюля парк-фильтра справа.
//   - в потоке скролла: eyebrow-бейдж (опц.) + крупный центрированный заголовок;
//   - в потоке скролла: большая пилюля по центру под заголовком (если parkFilter).
//
// `eyebrow` — подпись чипа бизнеса (на Главной «БУМБАСТИК»). С D-20 это не
// статичный бейдж, а BusinessChip: кнопка-переключатель бизнесов с пунктом
// «Подключить бизнес». С 28.07 он живёт В ЛИПКОЙ ПОЛОСЕ, в левом слоте, а не
// в потоке под ней: контекст экрана не должен уезжать при прокрутке. Служебная
// кнопка перезагрузки за это уехала в правый слот — на Главной он свободен.
//
// `title` С D-20 НЕОБЯЗАТЕЛЕН. На Главной заголовка нет вовсе (правка владельца
// 28.07: имя продукта внутри приложения не пишется нигде, а «Мастерплан» ушёл
// в модули; экран и так подписан «Сегодня» в таб-баре). Пустой title → не
// рендерим ни крупный h1, ни компактный заголовок; шапка Главной = чип + период
// «<Месяц Год>: парки», который живёт в самом экране.
//
// `leadingAction` — конфигурируемая кнопка слева вместо back-кнопки, когда
// `showBack=false`. Сейчас единственный вариант — 'hardReload' на Главной.

defineProps({
  title: { type: String, default: '' },
  collapsed: { type: Boolean, default: false },
  parkFilter: { type: Boolean, default: false },
  showBack: { type: Boolean, default: false },
  backLabel: { type: String, default: '' },
  leadingAction: { type: String, default: null }, // null | 'hardReload'
  eyebrow: { type: String, default: null },
})
defineEmits(['back'])

const { caption } = useNavCaption()
const { trailing } = useNavTrailing()

const pickerOpen = ref(false)
function openPicker() {
  pickerOpen.value = true
}
function closePicker() {
  pickerOpen.value = false
}

// Жёсткая перезагрузка: чистим кэши SW, разрегистрируем service worker и
// перезагружаем страницу. После reload main.js снова зарегистрирует sw.js.
async function hardReload() {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch (e) {
    console.warn('hard reload cleanup failed', e)
  } finally {
    if (typeof window !== 'undefined') window.location.reload()
  }
}
</script>

<template>
  <!-- Sticky compact-bar: липкий вверху, стекло появляется на скролле -->
  <header
    class="sticky top-0 z-20 pt-[env(safe-area-inset-top)] transition-colors duration-200"
    :class="collapsed
      ? 'backdrop-blur bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] border-b border-[var(--line)]'
      : 'bg-transparent border-b border-transparent'"
  >
    <!-- Три колонки: слот «Назад» · заголовок · пилюля.
         Заголовок — колонка `auto`: занимает СВОЮ ширину и остаётся ровно по
         центру, потому что боковые колонки `minmax(2.75rem, 1fr)` делят остаток
         поровну. Так компактный заголовок не обрезается ни на одном разделе
         (прежние боковые отступы по 10rem зажимали его в ~73px при нужных 121–138px).
         Узко (375px) — сжимается и обрезается по многоточию подпись «Назад»,
         а не заголовок; 2.75rem = 44pt тач-таргета боковым слотам гарантированы. -->
    <div class="grid h-11 w-full grid-cols-[minmax(2.75rem,1fr)_auto_minmax(2.75rem,1fr)] items-center">
      <!-- Левый угол: back, иначе чип бизнеса (Главная).
           Правка 28.07: чип переехал СЮДА, в липкую полосу, — он не должен уезжать
           при скролле, это постоянный контекст экрана. Кнопка перезагрузки ушла
           в правый угол: на Главной правый слот свободен (нет ни парк-фильтра,
           ни селектора месяца), а слева теперь живёт контекст, а не служебное
           действие. -->
      <div class="flex min-w-0 items-center justify-self-start pl-1">
        <button
          v-if="showBack"
          type="button"
          class="flex min-h-[44px] min-w-0 items-center gap-0.5 rounded-lg px-1 text-[var(--text)] active:bg-[var(--surface-2)]"
          @click="$emit('back')"
        >
          <ChevronLeft class="h-6 w-6 shrink-0" :stroke-width="2.25" />
          <span v-if="backLabel" class="truncate text-[1.0625rem] leading-none">{{ backLabel }}</span>
        </button>
        <div v-else-if="eyebrow" class="pl-2">
          <BusinessChip :label="eyebrow" />
        </div>
        <div v-else class="min-h-[44px] min-w-[44px]" aria-hidden="true"></div>
      </div>

      <!-- Компактный заголовок: центральная колонка по ширине текста.
           Нет title (Главная) — блок не рендерится вовсе, колонка схлопывается. -->
      <div
        v-if="title"
        data-test="nav-compact-title"
        class="pointer-events-none flex min-w-0 items-center justify-center px-2 transition-opacity duration-200"
        :class="collapsed ? 'opacity-100' : 'opacity-0'"
      >
        <span class="truncate text-[1.0625rem] font-semibold text-[var(--text)]">{{ title }}</span>
      </div>
      <!-- заглушка центральной колонки: без неё правый слот съезжает в центр grid -->
      <div v-else aria-hidden="true"></div>

      <!-- Правый угол: либо управляемый слот раздела (селектор месяца в «Сводках»),
           либо компактная пилюля парк-фильтра (виден при collapsed && parkFilter).
           Слот виден всегда: у раздела с ним нет второй копии контрола в потоке. -->
      <div class="flex min-w-0 items-center justify-self-end gap-1 pr-1">
        <div v-if="trailing" data-test="nav-trailing" class="flex min-w-0 items-center">
          <component :is="trailing.component" v-bind="trailing.props" />
        </div>
        <div
          v-else
          class="flex min-w-0 items-center transition-opacity duration-200"
          :class="collapsed && parkFilter ? 'opacity-100' : 'pointer-events-none opacity-0'"
        >
          <ParkFilterPill v-if="parkFilter" :compact="true" @open="openPicker" />
        </div>
        <!-- служебное действие — в правом углу (см. комментарий у левого слота) -->
        <button
          v-if="!showBack && leadingAction === 'hardReload'"
          type="button"
          data-test="nav-hard-reload"
          class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text)] active:bg-[var(--surface-2)]"
          aria-label="Жёсткая перезагрузка (сбросить кэш)"
          title="Жёсткая перезагрузка"
          @click="hardReload"
        >
          <SyncIcon class="h-5 w-5" />
        </button>
      </div>
    </div>
  </header>

  <!-- Крупный центрированный заголовок — в потоке скролла.
       eyebrow (опц., напр. «БУМБАСТИК») — графитовый бейдж НАД заголовком.
       caption ('данные от …') — absolute НАД заголовком, не сдвигает h1. -->
  <!-- eyebrow (чип бизнеса) с 28.07 живёт в липкой полосе выше, не здесь -->
  <div v-if="title || caption" class="relative px-4 pb-3 pt-2 text-center">
    <p
      v-if="caption"
      class="pointer-events-none absolute inset-x-0 -top-2 text-[0.75rem] leading-none text-[var(--text-muted)]"
    >{{ caption }}</p>
    <h1 v-if="title" class="text-[2.125rem] font-bold leading-tight tracking-tight text-[var(--text)]">
      {{ title }}
    </h1>
  </div>

  <!-- Большая пилюля под крупным заголовком — в потоке скролла -->
  <div v-if="parkFilter" class="flex justify-center pb-3">
    <ParkFilterPill :compact="false" @open="openPicker" />
  </div>

  <ParkPickerSheet :open="pickerOpen" @close="closePicker" />
</template>
