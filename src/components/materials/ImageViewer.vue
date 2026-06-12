<script setup>
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

// Полноэкранный просмотр локального изображения ВНУТРИ PWA (решение
// владельца к TZ-5.2: изображения смотрим внутри, не в новой вкладке).
// Пока картинка грузится — bc-skeleton-перелив по центру; затем картинка
// проявляется целиком (opacity-свап по @load).
// Презентационный слой без ключей/скролл-лока — их держит родитель
// (MaterialDetail). Закрытие — тап по фону/картинке или крестик.
// Без pinch-zoom — отдельной задачей (без новых зависимостей).

defineProps({
  href: { type: String, required: true },
  alt: { type: String, default: '' },
})

defineEmits(['close'])

const loaded = ref(false)
</script>

<template>
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--scrim)] backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    :aria-label="alt || 'Просмотр изображения'"
    @click.self="$emit('close')"
  >
    <span
      v-if="!loaded"
      class="bc-skeleton absolute h-[50svh] w-[80%] max-w-[430px] rounded-2xl"
      aria-hidden="true"
    />
    <img
      :src="href"
      :alt="alt"
      class="max-h-[100svh] max-w-full object-contain transition-opacity duration-200"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="loaded = true"
      @click.self="$emit('close')"
    />
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
