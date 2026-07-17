<script setup>
import { ChartColumnBig, ExternalLink, Folder, Gauge, Layers } from 'lucide-vue-next'
import SectionBanner from '../components/home/SectionBanner.vue'
import InstallPwaBanner from '../components/home/InstallPwaBanner.vue'
import { setActive, setSubView } from '../composables/useAppNav.js'

// Home — командная дека (TZ-3.1 §1, ревизия 12.06.2026):
// 3 крупных баннера-кнопки (порядок как в таб-баре, без Главной): Аналитика,
// Проекты, Материалы. Ниже — баннер-ссылка на сайт b00m.fun (жёлтая заливка).
//
// СВЕРХУ — оперативная точка входа «Контроль дня» (под-страница, не вкладка),
// тёмная акцент-карта (variant primary) → setSubView('daily'), back → Главная.
// Под заголовком «Мастерплан» — бейдж «БУМБАСТИК» (имя приложения + компания-владелец данных).

function goDaily()     { setSubView('daily') }
function goAnalytics() { setActive('analytics') }
function goProjects()  { setActive('projects') }
function goMaterials() { setActive('materials') }
</script>

<template>
  <section class="flex flex-col gap-2 px-3 pb-6 pt-0">
    <!-- подзаголовок под «Мастерплан»: имя приложения + компания-владелец данных.
         Прижат к заголовку (отрицательный верхний отступ), отделён от «Контроль дня» снизу. -->
    <div class="-mt-2 mb-3 flex justify-center">
      <span class="rounded-full bg-[var(--surface-2)] px-3.5 py-1 text-[0.9375rem] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
        БУМБАСТИК
      </span>
    </div>

    <!-- оперативная точка входа: под-страница «Контроль дня» (тёмная акцент-карта) -->
    <SectionBanner title="Контроль дня" :icon="Gauge" variant="primary" @select="goDaily" />

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

    <InstallPwaBanner />
  </section>
</template>
