<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronsUpDown, Plus } from 'lucide-vue-next'
import { BUSINESSES } from '../../data/businesses.js'
import ConnectBusinessModal from './ConnectBusinessModal.vue'

// Чип бизнеса в шапке Главной (D-20). Раньше — статичный бейдж «БУМБАСТИК»
// (eyebrow над крупным заголовком), теперь — кнопка-переключатель бизнесов.
//
// Ревизия 28.07 по референсу money.x.com:
//   • Стрелка ВВЕРХ-ВНИЗ (ChevronsUpDown), а не вниз. Одинарный шеврон вниз читается
//     как «раскрыть список», двойной — как «переключить между». Здесь верен второй.
//   • Капсула стала НИЖЕ, но тач-таргет остался 44pt: фон переехал на внутренний
//     span, а min-h-[44px] живёт на кнопке. Раньше графит красил всю 44-пиксельную
//     кнопку — из-за этого бейдж выглядел раздутым.
//   • Чип выровнен ВЛЕВО (см. NavigationBar): по центру он читался как логотип-
//     вывеска, а это контрол выбора контекста — его место у края, как в X.
//
// Выпадашка: список бизнесов (сейчас один, активный помечен галкой, НЕ цветом) →
// разделитель → «Подключить бизнес · с экспертом» → модалка заявки.
// Подсветка строки под курсором — ТОЛЬКО через @media (hover: hover) (tailwind
// hover: уже компилируется с этим условием в v3 не всегда, поэтому дублируем
// явным media в стилях ниже): на тач-экране ховер «залипает» на последнем тапнутом
// пункте и выглядит как ошибочно выбранный бизнес.
//
// TODO(роли): когда на фронте появятся роли, пункт «Подключить бизнес» скрыть от
// не-владельцев. Сейчас ролей нет — пункт виден всем. Это TODO, а не логика:
// прав доступа в коде фронта не заводим (права = доступы Google к таблице).

defineProps({
  label: { type: String, required: true },
})

const open = ref(false)
const modalOpen = ref(false)
const rootRef = ref(null)
const menuRef = ref(null)

function toggle() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function openConnect() {
  close()
  modalOpen.value = true
}

function onKey(e) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
function onDocClick(e) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target)) close()
}

watch(open, async (v) => {
  if (v) {
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onDocClick, true)
    await nextTick()
    // Первый пункт НЕ фокусируем программно: после тапа пальцем браузер рисовал
    // на нём системное кольцо фокуса (синее — цвет ОС, не наш токен), и активный
    // бизнес выглядел как выделенный по ошибке. Клавиатура доходит до пунктов
    // обычным Tab — они идут в DOM сразу за чипом.
  } else {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('click', onDocClick, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick, true)
})
</script>

<template>
  <div ref="rootRef" class="relative inline-flex">
    <!-- Кнопка держит тач-таргет 44pt, но не красится: цвет и высота — у капсулы
         внутри. Так бейдж выглядит компактным, а палец по-прежнему попадает. -->
    <button
      type="button"
      data-test="business-chip"
      class="inline-flex min-h-[44px] items-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-muted)] focus-visible:ring-offset-0"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="menu"
      @click="toggle"
    >
      <span
        data-test="business-chip-pill"
        class="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[var(--graphite)] pl-3.5 pr-2 text-[0.6875rem] font-medium uppercase tracking-[0.28em] text-[var(--ink-on-color)]"
      >
        {{ label }}
        <ChevronsUpDown class="h-3.5 w-3.5 shrink-0" :stroke-width="2.25" aria-hidden="true" />
      </span>
    </button>

    <!-- выпадающий список: под чипом, прижат к его левому краю (чип теперь слева) -->
    <div
      v-if="open"
      ref="menuRef"
      data-test="business-menu"
      role="menu"
      class="absolute left-0 top-full z-40 mt-1.5 flex w-[17rem] flex-col gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 text-left shadow-2xl"
    >
      <!-- Разделителя нет: каждый пункт — самостоятельная плашка на фоне, границу
           между ними держит зазор, а не линия. Высота у всех одинаковая (56px),
           хотя у «Подключить бизнес» две строки текста, а у бизнеса одна:
           разновысокие плашки в коротком списке читаются как разные по важности. -->
      <button
        v-for="b in BUSINESSES"
        :key="b.id"
        type="button"
        role="menuitem"
        class="bc-menu-item flex min-h-[56px] w-full items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-muted)] active:bg-[var(--surface-hover)]"
        @click="close"
      >
        <span class="text-[1rem] text-[var(--text)]">{{ b.name }}</span>
        <Check
          v-if="b.active"
          class="ml-auto h-5 w-5 shrink-0 text-[var(--text)]"
          :stroke-width="2.25"
          aria-label="Активный бизнес"
        />
      </button>

      <button
        type="button"
        role="menuitem"
        data-test="business-connect"
        class="bc-menu-item flex min-h-[56px] w-full items-center gap-2.5 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-muted)] active:bg-[var(--surface-hover)]"
        @click="openConnect"
      >
        <Plus class="h-5 w-5 shrink-0 text-[var(--text-secondary)]" :stroke-width="2.25" aria-hidden="true" />
        <span class="flex min-w-0 flex-col">
          <span class="text-[1rem] leading-tight text-[var(--text)]">Подключить бизнес</span>
          <span class="text-[0.75rem] leading-tight text-[var(--text-muted)]">с экспертом</span>
        </span>
      </button>
    </div>

    <ConnectBusinessModal :open="modalOpen" @close="modalOpen = false" />
  </div>
</template>

<style scoped>
/* Подсветка строки под курсором — как в референсе. ТОЛЬКО для устройств с
   настоящим ховером: на тач-экране :hover остаётся на последнем тапнутом пункте
   и выглядит как ошибочно выбранный бизнес. Отсюда media-запрос, а не hover:. */
@media (hover: hover) and (pointer: fine) {
  .bc-menu-item {
    transition: background-color 120ms ease;
  }
  .bc-menu-item:hover {
    background: var(--surface-hover);
  }
}
</style>
