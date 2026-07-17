<script setup>
import { ChartColumnBig, ExternalLink, Folder, Gauge, Layers, Target } from 'lucide-vue-next'
import SectionBanner from '../components/home/SectionBanner.vue'
import InstallPwaBanner from '../components/home/InstallPwaBanner.vue'
import { setActive, setSubView } from '../composables/useAppNav.js'

// Home — командная дека. Сверху две КРУПНЫЕ операционные карты (size lg):
// «Контроль дня» — тёмная (variant primary), «Цели и прогнозы» — жёлтая
// (variant accent). Затем небольшой отступ-разделитель и три КОМПАКТНЫЕ
// карты-вкладки (size sm): Аналитика, Проекты, Материалы. Ниже — жёлтая
// ссылка b00m.fun (новое окно) и баннер установки PWA.
// Под заголовком «Мастерплан» — бейдж «БУМБАСТИК» (имя приложения + владелец данных).

function goDaily()     { setSubView('daily') }
function goGoals()     { setSubView('goals') }
function goAnalytics() { setActive('analytics') }
function goProjects()  { setActive('projects') }
function goMaterials() { setActive('materials') }
</script>

<template>
  <section class="flex flex-col gap-2 px-3 pb-6 pt-0">
    <!-- подзаголовок под «Мастерплан»: имя приложения + компания-владелец данных. -->
    <div class="-mt-2 mb-3 flex justify-center">
      <span class="rounded-full bg-[var(--surface-2)] px-3.5 py-1 text-[0.9375rem] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
        БУМБАСТИК
      </span>
    </div>

    <!-- две крупные операционные карты: Контроль дня (тёмная) + Цели и прогнозы (жёлтая) -->
    <SectionBanner title="Контроль дня" :icon="Gauge" variant="primary" @select="goDaily" />
    <SectionBanner title="Цели и прогнозы" :icon="Target" variant="accent" @select="goGoals" />

    <!-- отступ-разделитель, затем три компактные карты-вкладки -->
    <SectionBanner class="mt-3" title="Аналитика" :icon="ChartColumnBig" size="sm" @select="goAnalytics" />
    <SectionBanner title="Проекты" :icon="Layers" size="sm" @select="goProjects" />
    <SectionBanner title="Материалы" :icon="Folder" size="sm" @select="goMaterials" />

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
