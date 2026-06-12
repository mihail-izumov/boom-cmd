<script setup>
import { computed, ref } from 'vue'
import { typeIcon, pickDirection } from '../../i18n/materials.js'

// Карточка материала — спокойная, монохромная (по образцу ProjectCard).
// Слева — превью 64×64 (локальные изображения) или иконка типа на плитке
// --surface-2; справа — заголовок / описание / мета-строка.
// Тип в мете не дублируем — его задаёт группа; вместо него направление.
// Парк-бейджа нет (TZ-3.3 §2) — scope задаёт фильтр.
// Тап по карточке → модалка деталей (ссылку наружу карточка не открывает).

const props = defineProps({
  material: { type: Object, required: true },
})

defineEmits(['open'])

// Превью — только для локальных изображений; внешние (Drive) и битые
// файлы падают на иконку типа.
const imgFailed = ref(false)
const showThumb = computed(
  () =>
    props.material.type === 'Изображение' &&
    props.material.external === false &&
    !!props.material.href &&
    !imgFailed.value,
)
const Icon = computed(() => typeIcon(props.material.type))

// Мета-строка: направление · статус · дата. Всё серое — без цветового
// кодирования (DESIGN-STANDARD §3.4: статус не «активное» и не «срочное»).
const meta = computed(() =>
  [pickDirection(props.material), props.material.status, props.material.last_updated]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition-colors active:bg-[var(--surface-2)]"
    style="min-height: 44px"
    @click="$emit('open', material)"
  >
    <img
      v-if="showThumb"
      :src="material.href"
      alt=""
      loading="lazy"
      class="h-16 w-16 shrink-0 rounded-2xl border border-[var(--line)] object-cover"
      @error="imgFailed = true"
    />
    <span
      v-else
      class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
      aria-hidden="true"
    >
      <component :is="Icon" class="h-7 w-7" :stroke-width="1.75" />
    </span>

    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="truncate text-[1.0625rem] font-medium leading-snug text-[var(--text)]">
        {{ material.title }}
      </span>
      <span
        v-if="material.description"
        class="line-clamp-2 text-[0.9375rem] leading-snug text-[var(--text-secondary)]"
      >{{ material.description }}</span>
      <span v-if="meta" class="truncate text-[0.8125rem] text-[var(--text-muted)]">
        {{ meta }}
      </span>
    </span>
  </button>
</template>
