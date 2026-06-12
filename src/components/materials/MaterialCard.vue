<script setup>
import { computed, ref } from 'vue'
import { typeIcon, pickDirection } from '../../i18n/materials.js'

// Карточка материала — спокойная, монохромная (по образцу ProjectCard).
// Слева — превью 64×64 (локальные изображения) или иконка типа на плитке
// --surface-2; справа — заголовок / описание / мета-чипы.
// Превью: пока не загрузилось — bc-skeleton-перелив, затем картинка
// проявляется целиком (opacity-свап по @load), не «кусочками».
// Мета — чипы в стиле DirectionChip: направление / статус / дата, все
// серые без цветового кодирования (DESIGN-STANDARD §3.4). Тип задаёт группа.
// Парк-бейджа нет (TZ-3.3 §2). Тап по карточке → модалка деталей.

const props = defineProps({
  material: { type: Object, required: true },
})

defineEmits(['open'])

// Превью — только для локальных изображений; внешние (Drive) и битые
// файлы падают на иконку типа.
const imgFailed = ref(false)
const imgLoaded = ref(false)
const showThumb = computed(
  () =>
    props.material.type === 'Изображение' &&
    props.material.external === false &&
    !!props.material.href &&
    !imgFailed.value,
)
const Icon = computed(() => typeIcon(props.material.type))

const chips = computed(() =>
  [pickDirection(props.material), props.material.status, props.material.last_updated]
    .filter(Boolean),
)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 44px"
    @click="$emit('open', material)"
  >
    <span
      v-if="showThumb"
      class="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)]"
    >
      <span v-if="!imgLoaded" class="bc-skeleton absolute inset-0" aria-hidden="true" />
      <img
        :src="material.href"
        alt=""
        loading="lazy"
        class="h-full w-full object-cover transition-opacity duration-200"
        :class="imgLoaded ? 'opacity-100' : 'opacity-0'"
        @load="imgLoaded = true"
        @error="imgFailed = true"
      />
    </span>
    <span
      v-else
      class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
      aria-hidden="true"
    >
      <component :is="Icon" class="h-7 w-7" :stroke-width="1.75" />
    </span>

    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-[1.0625rem] font-medium leading-snug text-[var(--text)]">
        {{ material.title }}
      </span>
      <span
        v-if="material.description"
        class="line-clamp-2 text-[0.9375rem] leading-snug text-[var(--text-secondary)]"
      >{{ material.description }}</span>
      <span v-if="chips.length" class="mt-0.5 flex flex-wrap items-center gap-1">
        <span
          v-for="c in chips"
          :key="c"
          class="inline-flex items-center rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[0.75rem] font-medium leading-tight text-[var(--text-secondary)]"
        >{{ c }}</span>
      </span>
    </span>
  </button>
</template>
