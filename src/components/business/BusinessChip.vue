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
    menuRef.value?.querySelector('[role="menuitem"]')?.focus?.()
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
      class="inline-flex min-h-[44px] items-center"
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
      class="absolute left-0 top-full z-40 mt-1.5 w-[17rem] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 text-left shadow-2xl"
    >
      <button
        v-for="b in BUSINESSES"
        :key="b.id"
        type="button"
        role="menuitem"
        class="bc-menu-item flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left active:bg-[var(--surface-2)]"
        style="min-height: 44px"
        @click="close"
      >
        <span class="text-[1rem] text-[var(--text)]">{{ b.name }}</span>
        <Check
          v-if="b.active"
          class="ml-auto h-5 w-5 text-[var(--text)]"
          :stroke-width="2.25"
          aria-label="Активный бизнес"
        />
      </button>

      <div class="my-1 h-px bg-[var(--line)]" aria-hidden="true"></div>

      <button
        type="button"
        role="menuitem"
        data-test="business-connect"
        class="bc-menu-item flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left active:bg-[var(--surface-2)]"
        style="min-height: 44px"
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
  .bc-menu-item:hover {
    background: var(--surface-2);
  }
}
</style>
