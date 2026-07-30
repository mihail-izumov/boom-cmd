<script setup>
import { computed } from 'vue'
import {
  statusFill,
  statusDashed,
  TYPE_RU,
  tr,
  parkLabel,
  fmtDate,
  launchLabel,
  isActive,
  L,
} from '../../i18n/drivers.js'

// Карточка драйвера — спокойная, монохромная (образец — ProjectCard / песочница
// drivers-sandbox). Иерархия: код + СТАТУС-бейдж · НАЗВАНИЕ · тип-бейдж · описание
// · строки (Парки/Запуск/Цель/Программа). Цвет — только в заливке статус-бейджа,
// текст монохромный. Механику/метрику/результат НЕ показываем (ТЗ §3).

const props = defineProps({
  driver: { type: Object, required: true },
  // Канонический набор парков из данных (section → parkOptions). Для активных
  // драйверов показываем плашку на каждый парк, пунктиром — где не подключён.
  parkIds: { type: Array, default: () => [] },
})

const active = computed(() => isActive(props.driver.status))
const periodOf = (pid) => (props.driver.periods || []).find((p) => p.park === pid) || null
const approx = (per) => (per && per.accuracy && per.accuracy !== 'день' ? '~' : '')
</script>

<template>
  <article class="flex flex-col gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <!-- код + статус-бейдж -->
    <div class="flex items-center justify-between gap-2.5">
      <span class="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">{{ driver.code }}</span>
      <span
        class="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[0.6875rem] font-semibold text-[var(--text)]"
        :class="statusDashed(driver.status) ? 'border border-dashed border-[var(--line)]' : ''"
        :style="{ background: statusFill(driver.status) }"
      >{{ driver.status }}</span>
    </div>

    <!-- название -->
    <h3 class="text-[0.9375rem] font-semibold leading-snug text-[var(--text)]">{{ driver.name }}</h3>

    <!-- тип — нейтральный контурный бейдж, слабее статуса (образец DirectionChip) -->
    <div v-if="driver.type">
      <span class="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-secondary)]">{{ tr(TYPE_RU, driver.type) }}</span>
    </div>

    <!-- описание (desc = hypothesis) -->
    <p v-if="driver.desc" class="text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">{{ driver.desc }}</p>

    <!-- строки: показываем только непустые -->
    <dl class="flex flex-col gap-1.5 border-t border-[var(--line)] pt-2.5">
      <!-- Парки — всегда -->
      <div class="flex gap-2 text-[0.78125rem] leading-snug">
        <dt class="shrink-0 basis-[4.5rem] text-[var(--text-muted)]">{{ L.row_parks }}</dt>
        <dd class="min-w-0 flex-1">
          <div v-if="active" class="flex flex-wrap gap-1.5">
            <span
              v-for="pid in parkIds"
              :key="pid"
              class="rounded-md border px-2 py-0.5 text-[0.75rem]"
              :class="periodOf(pid) ? 'border-[var(--line)] text-[var(--text)]' : 'border-dashed border-[var(--line)] text-[var(--text-muted)]'"
            >
              <b class="font-semibold">{{ parkLabel(pid) }}</b>
              <span v-if="periodOf(pid)" class="ml-1 text-[var(--text-muted)]">
                {{ approx(periodOf(pid)) }}с {{ fmtDate(periodOf(pid).start) }}<template v-if="periodOf(pid).end"> по {{ fmtDate(periodOf(pid).end) }}</template>
              </span>
            </span>
          </div>
          <span v-else class="inline-block rounded-md border border-dashed border-[var(--line)] px-2 py-0.5 text-[0.75rem] text-[var(--text-muted)]">{{ L.not_launched }}</span>
        </dd>
      </div>

      <!-- Запуск -->
      <div v-if="driver.launch" class="flex gap-2 text-[0.78125rem] leading-snug">
        <dt class="shrink-0 basis-[4.5rem] text-[var(--text-muted)]">{{ L.row_launch }}</dt>
        <dd class="min-w-0 flex-1 text-[var(--text)]">{{ launchLabel(driver.launch) }}</dd>
      </div>

      <!-- Цель -->
      <div v-if="driver.goal" class="flex gap-2 text-[0.78125rem] leading-snug">
        <dt class="shrink-0 basis-[4.5rem] text-[var(--text-muted)]">{{ L.row_goal }}</dt>
        <dd class="min-w-0 flex-1 text-[var(--text)]">{{ driver.goal }}</dd>
      </div>

      <!-- Программа -->
      <div v-if="driver.program" class="flex gap-2 text-[0.78125rem] leading-snug">
        <dt class="shrink-0 basis-[4.5rem] text-[var(--text-muted)]">{{ L.row_program }}</dt>
        <dd class="min-w-0 flex-1">
          <span class="inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[0.75rem] text-[var(--text-secondary)]">{{ driver.program }}</span>
        </dd>
      </div>
    </dl>
  </article>
</template>
