<script setup>
import { computed, nextTick, ref } from 'vue'
import { X, ZoomIn, ZoomOut } from 'lucide-vue-next'

// Полноэкранный просмотр локального изображения ВНУТРИ PWA (решение
// владельца к TZ-5.2: изображения смотрим внутри, не в новой вкладке).
//
// Зум — вариант A (принят владельцем): двойной тап ×2.5 к точке тапа,
// панорамирование — нативный скролл контейнера (с инерцией iOS), двойной
// тап ещё раз — обратно. Pinch-zoom (вариант B) — в бэклоге
// (docs/BACKLOG-boom-cmd.md). Сверху — подсказка-пилюля «Двойной тап …»
// с иконкой лупы (ревизия владельца: жест неочевиден, pinch привычнее).
//
// Структура из двух слоёв (фикс бага «кнопка уезжает при панорамировании»):
// backdrop-filter на скролл-контейнере делает его containing block для
// fixed-потомков, поэтому кнопка закрытия и подсказка живут НЕ внутри
// скролл-слоя, а сиблингами в корневом fixed-диве.
//
// Закрытие: тап по фону или крестик (тап по картинке занят детекцией
// двойного тапа). Esc/скролл-лок держит родитель (MaterialDetail).
// Пока картинка грузится — bc-skeleton-перелив, проявление целиком.

defineProps({
  href: { type: String, required: true },
  alt: { type: String, default: '' },
})

defineEmits(['close'])

const loaded = ref(false)
const zoomed = ref(false)
const scrollRef = ref(null)
const imgRef = ref(null)

const hintIcon = computed(() => (zoomed.value ? ZoomOut : ZoomIn))
const hintText = computed(() =>
  zoomed.value ? 'Двойной тап — уменьшить' : 'Двойной тап — увеличить',
)

// Ручная детекция двойного тапа: dblclick на iOS-тачах срабатывает
// нестабильно, поэтому два click-а в окне 300мс.
let lastTap = 0
function onImgClick(e) {
  const now = Date.now()
  if (now - lastTap < 300) {
    lastTap = 0
    toggleZoom(e)
  } else {
    lastTap = now
  }
}

// Зум к точке тапа: запоминаем относительные координаты на картинке,
// после увеличения скроллим контейнер так, чтобы точка оказалась в центре.
async function toggleZoom(e) {
  if (zoomed.value) {
    zoomed.value = false
    return
  }
  const rect = imgRef.value?.getBoundingClientRect()
  const rx = rect && rect.width ? (e.clientX - rect.left) / rect.width : 0.5
  const ry = rect && rect.height ? (e.clientY - rect.top) / rect.height : 0.5
  zoomed.value = true
  await nextTick()
  const el = scrollRef.value
  const img = imgRef.value
  if (!el || !img) return
  el.scrollLeft = Math.max(0, rx * img.offsetWidth - el.clientWidth / 2)
  el.scrollTop = Math.max(0, ry * img.offsetHeight - el.clientHeight / 2)
}
</script>

<template>
  <div
    class="fixed inset-0 z-[60]"
    role="dialog"
    aria-modal="true"
    :aria-label="alt || 'Просмотр изображения'"
  >
    <!-- скролл-слой: scrim + blur + картинка. Панорамирование живёт тут. -->
    <div
      ref="scrollRef"
      class="absolute inset-0 bg-[var(--scrim)] backdrop-blur-md"
      :class="
        zoomed
          ? 'overflow-auto overscroll-contain'
          : 'flex items-center justify-center overflow-hidden'
      "
      @click.self="$emit('close')"
    >
      <span
        v-if="!loaded"
        class="bc-skeleton absolute h-[50svh] w-[80%] max-w-[430px] rounded-2xl"
        aria-hidden="true"
      />
      <img
        ref="imgRef"
        :src="href"
        :alt="alt"
        class="transition-opacity duration-200"
        :class="[
          loaded ? 'opacity-100' : 'opacity-0',
          zoomed
            ? 'w-[250vw] max-w-none cursor-zoom-out'
            : 'max-h-[100svh] max-w-full object-contain cursor-zoom-in',
        ]"
        @load="loaded = true"
        @click="onImgClick"
      />
    </div>

    <!-- оверлей-слой: НЕ скроллится вместе с картинкой.
         Подсказка без плашки (ревизия владельца): белый текст на тёмном
         скриме — это «белый на тёмной заливке» по DESIGN-STANDARD §3.5,
         drop-shadow страхует читаемость на светлых участках фото. -->
    <span
      class="pointer-events-none absolute left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--ink-on-color)] drop-shadow-md"
      style="top: calc(env(safe-area-inset-top) + 0.75rem)"
    >
      <component :is="hintIcon" class="h-4 w-4 shrink-0" :stroke-width="2" aria-hidden="true" />
      {{ hintText }}
    </span>
    <button
      type="button"
      class="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-secondary)] shadow-lg active:bg-[var(--surface-2)]"
      style="top: calc(env(safe-area-inset-top) + 0.75rem)"
      aria-label="Закрыть просмотр"
      @click="$emit('close')"
    >
      <X class="h-5 w-5" :stroke-width="2" />
    </button>
  </div>
</template>
