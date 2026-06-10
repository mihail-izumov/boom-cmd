<script setup>
import { ChartColumnBig, ChevronRight, Folder, Layers } from 'lucide-vue-next'
import SectionBanner from '../components/home/SectionBanner.vue'
import { setActive, setSubView } from '../composables/useAppNav.js'

// Home — командная дека (TZ-3.1 §1):
// 3 крупных баннера-кнопки (порядок как в таб-баре, без Главной): Аналитика,
// Проекты, Материалы. Иконки — те же, что в таб-баре, крупные и монохромные.
// Ниже — вторичная кнопка «Парки» → справочная под-страница.

function goAnalytics() { setActive('analytics') }
function goProjects()  { setActive('projects') }
function goMaterials() { setActive('materials') }
function goParks()     { setSubView('parks') }
</script>

<template>
  <section class="flex flex-col gap-2 px-3 pb-6 pt-2">
    <SectionBanner title="Аналитика" :icon="ChartColumnBig" @select="goAnalytics" />
    <SectionBanner title="Проекты"   :icon="Layers"         @select="goProjects" />
    <SectionBanner title="Материалы" :icon="Folder"         @select="goMaterials" />

    <button
      type="button"
      class="mt-2 flex w-full items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 text-left text-[var(--text)] transition-colors active:bg-[var(--surface-2)]"
      style="min-height: 56px"
      @click="goParks"
    >
      <span class="text-[1.0625rem] font-medium">Парки</span>
      <ChevronRight class="ml-auto h-5 w-5 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
    </button>
  </section>
</template>
