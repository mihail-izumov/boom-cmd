<script setup>
import { ChartColumnBig, ExternalLink, Folder, Layers } from 'lucide-vue-next'
import SectionBanner from '../components/home/SectionBanner.vue'
import { setActive } from '../composables/useAppNav.js'

// Home — командная дека (TZ-3.1 §1, ревизия 12.06.2026):
// 3 крупных баннера-кнопки (порядок как в таб-баре, без Главной): Аналитика,
// Проекты, Материалы. Иконки — те же, что в таб-баре, крупные и монохромные.
// Ниже — баннер-ссылка на сайт b00m.fun (жёлтая заливка --accent + --accent-ink,
// бренд-акцент по DESIGN-STANDARD; новое окно). Кнопка «Парки» убрана
// (решение владельца); ParksScreen и subView 'parks' остаются в коде —
// вернутся, когда появится статистика парков (Ф6).

function goAnalytics() { setActive('analytics') }
function goProjects()  { setActive('projects') }
function goMaterials() { setActive('materials') }
</script>

<template>
  <section class="flex flex-col gap-2 px-3 pb-6 pt-2">
    <SectionBanner title="Аналитика" :icon="ChartColumnBig" @select="goAnalytics" />
    <SectionBanner title="Проекты"   :icon="Layers"         @select="goProjects" />
    <SectionBanner title="Материалы" :icon="Folder"         @select="goMaterials" />

    <a
      href="https://b00m.fun"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-2 flex w-full items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-[var(--accent-ink)] transition-opacity active:opacity-90"
      style="min-height: 56px"
    >
      <span class="text-[1.0625rem] font-semibold">b00m.fun</span>
      <ExternalLink class="ml-auto h-5 w-5" :stroke-width="2" aria-hidden="true" />
    </a>
  </section>
</template>
