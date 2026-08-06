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
  L,
} from '../../i18n/drivers.js'

// Карточка драйвера — спокойная, монохромная (образец — ProjectCard / песочница
// drivers-sandbox). Иерархия: код + СТАТУС-бейдж · НАЗВАНИЕ · тип-бейдж · описание
// · строки (Парки/Запуск/Цель/Программа). Цвет — только в заливке статус-бейджа,
// текст монохромный. Механику/метрику/результат НЕ показываем (ТЗ §3).

const props = defineProps({
  driver: { type: Object, required: true },
  // Канонический набор парков из данных (section → parkOptions). У запущенного
  // драйвера показываем строку на каждый парк, «— не подключён» — где периода нет.
  parkIds: { type: Array, default: () => [] },
})

// «Запущен» = есть периоды (не завязано на имя статуса — устойчиво к словарю B).
const launched = computed(() => (props.driver.periods || []).length > 0)
const periodOf = (pid) => (props.driver.periods || []).find((p) => p.park === pid) || null
// Ё/е и регистр нормализуем: и статусы, и точность приезжают из рукописных мастеров
// контура B, и «идет» / «День» рано или поздно приедут — точный литерал молча дал бы
// неверный ответ (тот же приём, что в isMeasuring дневной модели).
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/ё/g, 'е')

// «~» перед датой = точность НЕ до дня. Пустая точность — это `unknown`, а не
// «до дня»: контракт §10.3 и дневная модель трактуют её именно так, а карточка
// раньше печатала такую дату без «~», то есть выдавала ложную точность.
// Практически не стреляло — Apps Script подставляет 'unknown' сам, — но защита
// от пустой ячейки должна быть на стороне фронта, а не на добросовестности бэка.
const approx = (per) => (per && norm(per.accuracy || 'unknown') !== 'день' ? '~' : '')

// Строка «Замер» (D-77, задание 06.08 §3.4). Показываем ТОЛЬКО у работающих
// статусов: у backlog/разработка/готов/закрыт замера нет по определению, и пустая
// строка там читалась бы как «замер потеряли». Поле пустое → строки нет.
// Значение — свободный текст контура B, печатаем как есть, не парсим.
const MEASURE_STATUSES = new Set(['идет', 'пауза'])
const measure = computed(() => {
  const v = String(props.driver.measure || '').trim()
  return v && MEASURE_STATUSES.has(norm(props.driver.status)) ? v : ''
})
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
      <!-- Парки — всегда. Запущенный: строка на каждый парк сети (дата или
           «— не подключён»). Незапущенный: одна строка «не запущен…». -->
      <div class="flex gap-2 text-[0.8125rem] leading-snug">
        <dt class="shrink-0 basis-[4.25rem] text-[var(--text-muted)]">{{ L.row_parks }}</dt>
        <dd class="min-w-0 flex-1">
          <div v-if="launched" class="flex flex-col gap-0.5">
            <div v-for="pid in parkIds" :key="pid" class="flex flex-wrap items-baseline gap-x-1.5">
              <span class="font-medium text-[var(--text)]">{{ parkLabel(pid) }}</span>
              <span v-if="periodOf(pid)" class="text-[var(--text-muted)]">{{ approx(periodOf(pid)) }}с {{ fmtDate(periodOf(pid).start) }}<template v-if="periodOf(pid).end"> по {{ fmtDate(periodOf(pid).end) }}</template></span>
              <span v-else class="text-[var(--text-muted)]">— не подключён</span>
            </div>
          </div>
          <span v-else class="text-[var(--text-muted)]">{{ L.not_launched }}</span>
        </dd>
      </div>

      <!-- Замер — приглушённо, мельче остальных строк, БЕЗ цвета и сигнальной точки -->
      <div v-if="measure" data-test="driver-measure" class="flex gap-2 text-[0.75rem] leading-snug">
        <dt class="shrink-0 basis-[4.25rem] text-[var(--text-muted)]">{{ L.row_measure }}</dt>
        <dd class="min-w-0 flex-1 text-[var(--text-muted)]">{{ measure }}</dd>
      </div>

      <!-- Запуск -->
      <div v-if="driver.launch" class="flex gap-2 text-[0.8125rem] leading-snug">
        <dt class="shrink-0 basis-[4.25rem] text-[var(--text-muted)]">{{ L.row_launch }}</dt>
        <dd class="min-w-0 flex-1 text-[var(--text)]">{{ launchLabel(driver.launch) }}</dd>
      </div>

      <!-- Цель -->
      <div v-if="driver.goal" class="flex gap-2 text-[0.8125rem] leading-snug">
        <dt class="shrink-0 basis-[4.25rem] text-[var(--text-muted)]">{{ L.row_goal }}</dt>
        <dd class="min-w-0 flex-1 text-[var(--text)]">{{ driver.goal }}</dd>
      </div>

      <!-- Программа -->
      <div v-if="driver.program" class="flex gap-2 text-[0.8125rem] leading-snug">
        <dt class="shrink-0 basis-[4.25rem] text-[var(--text-muted)]">{{ L.row_program }}</dt>
        <dd class="min-w-0 flex-1">
          <span class="inline-flex items-center rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[0.75rem] text-[var(--text-secondary)]">{{ driver.program }}</span>
        </dd>
      </div>
    </dl>
  </article>
</template>
