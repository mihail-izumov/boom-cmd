<script setup>
import { computed } from 'vue'
import { setPark, useParkContext } from '../../composables/useParkContext.js'
import {
  asofOf, capacityLayout, itemsFor, networkContrib, parkContrib, parkRows, planLayout,
} from '../../composables/contribModel.js'
import { L, fmtDateFull, fmtMln, fmtPct, parkLabel } from '../../i18n/drivers.js'
import ContribBar from './ContribBar.vue'

// Экран «Вклад в план» — первое состояние раздела «Драйверы роста».
// Порядок сверху вниз (эталон — песочница контура B, принята владельцем 31.07):
//   1) «План месяца» — план целиком, полоса «база парка + драйверы роста»;
//   2) «Вклад драйверов» — 100 % шкалы = ёмкость драйверов, сколько её закрыто;
//   3) «Из чего складывается» — строка на драйвер (ТОЛЬКО на экране парка).
// «Вся сеть»: 1 и 2 на суммах + «Сила драйверов» (разбивка по паркам); ДЕТАЛИЗАЦИИ НЕТ,
// тап по строке парка открывает его экран (решение владельца 31.07).
//
// Экран НИЧЕГО не считает: все величины приходят из driver_contrib. Единственное
// исключение — суммы по сети, их §5 задания разрешает явно. Веса разнесения,
// состояние замера, канальная декомпозиция и модельный вклад планировщика сюда
// не приходят и не выводятся — их нет в payload.
//
// Месяц — только текущий, пикера нет (v1). «Данные от …» — из колонки asof.

const props = defineProps({ data: { type: Object, default: () => ({}) } })

const { isNetwork, current } = useParkContext()

const park = computed(() => (isNetwork.value ? null : current.value))
const row = computed(() => (park.value ? parkContrib(props.data, park.value) : networkContrib(props.data)))
const plan = computed(() => planLayout(row.value || {}))
const cap = computed(() => capacityLayout(row.value || {}))
const items = computed(() => (park.value ? itemsFor(props.data, park.value) : []))
const parks = computed(() => parkRows(props.data))
const asof = computed(() => fmtDateFull(asofOf(props.data, park.value)))

// Строка есть, но раскладывать нечего (нет плана или ёмкости) — честный пустой стейт,
// а не полоса из нулей. Так же выглядит парк, которого нет в driver_contrib вовсе.
const ready = computed(() => !!(row.value && plan.value && cap.value))

const planSegments = computed(() => [
  { key: 'base', pct: plan.value.basePct, kind: 'neutral' },
  { key: 'cap', pct: plan.value.capacityPct, kind: 'accent' },
])
const capSegments = computed(() =>
  cap.value.over
    ? [
        { key: 'got', pct: cap.value.gotPct, kind: 'accent' },
        { key: 'over', pct: cap.value.overPct, kind: 'positive' },
      ]
    : [
        { key: 'got', pct: cap.value.gotPct, kind: 'accent' },
        { key: 'gap', pct: cap.value.shortPct, kind: 'neutral' },
      ],
)

const got = computed(() => Math.max(0, row.value.got ?? 0))
const coverPct = computed(() => row.value.covered_pct ?? 0)
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <!-- «данные от ДД.ММ.ГГГГ» — ИЗ КОЛОНКИ asof, ничего не вычисляем и не подставляем
         «сегодня». На сети — минимальная из парков: дата, на которую закрыты все. -->
    <p v-if="asof" data-test="asof" class="bc-fade-in text-center text-[0.8125rem] text-[var(--text-muted)]">
      {{ L.asof(asof) }}
    </p>

    <template v-if="ready">
      <!-- ── 1. План месяца ─────────────────────────────────────────────── -->
      <section class="bc-fade-in rounded-2xl bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
        <p class="text-[0.8125rem] text-[var(--text-muted)]">
          {{ park ? L.plan_title : L.plan_title_net }}
        </p>
        <p data-test="plan-value" class="mt-0.5 text-[1.875rem] font-bold leading-tight tracking-tight text-[var(--text)]">
          {{ fmtMln(row.plan) }}
        </p>

        <div class="mt-3.5">
          <ContribBar :segments="planSegments" :label="`План месяца: база и драйверы роста`" />
        </div>

        <!-- Легенда (§7.6): глиф повторяет средство, которым сегмент нарисован. -->
        <div class="mt-2 flex items-start justify-between gap-3">
          <span class="flex min-w-0 flex-col text-[0.8125rem] text-[var(--text-secondary)]">
            <span class="flex items-center gap-1.5">
              <i class="h-2.5 w-2.5 shrink-0 rounded-[3px]" :style="{ background: 'color-mix(in srgb, var(--line) 75%, var(--surface-2))' }" />
              {{ park ? L.plan_base(fmtPct(plan.baseLabelPct)) : L.plan_base_net(fmtPct(plan.baseLabelPct)) }}
            </span>
            <b class="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">{{ fmtMln(row.base) }}</b>
          </span>
          <span class="flex min-w-0 flex-col items-end text-right text-[0.8125rem] text-[var(--text-secondary)]">
            <span class="flex items-center gap-1.5">
              <i class="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[var(--accent)]" />
              {{ park ? L.plan_drivers(fmtPct(plan.capacityLabelPct)) : L.plan_drivers_net(fmtPct(plan.capacityLabelPct)) }}
            </span>
            <b class="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">{{ fmtMln(row.capacity) }}</b>
          </span>
        </div>
      </section>

      <!-- ── 2. Вклад драйверов ─────────────────────────────────────────── -->
      <section class="bc-fade-in rounded-2xl bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]">
        <p class="text-[0.8125rem] text-[var(--text-muted)]">{{ L.cap_title(fmtMln(row.capacity)) }}</p>

        <div class="mt-3">
          <ContribBar :segments="capSegments" :label="L.cap_title(fmtMln(row.capacity))" />
        </div>

        <div class="mt-2 flex items-start justify-between gap-3">
          <span class="flex min-w-0 flex-col text-[0.8125rem] text-[var(--text-secondary)]">
            <span class="flex items-center gap-1.5">
              <i class="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[var(--accent)]" />
              {{ L.cap_got }}
            </span>
            <!-- Расшифровка идёт в СКОБКАХ, без точки-разделителя (решение владельца 31.07). -->
            <b data-test="got" class="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">
              {{ got > 0 ? L.cap_value(fmtMln(got), fmtPct(coverPct)) : L.cap_got_none }}
            </b>
          </span>

          <!-- >100 % не упираем молча в 100 %: правый сегмент зелёный «Сверх ёмкости». -->
          <span v-if="cap.over" class="flex min-w-0 flex-col items-end text-right text-[0.8125rem] text-[var(--text-secondary)]">
            <span class="flex items-center gap-1.5">
              <i class="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-[var(--positive)]" />
              {{ L.cap_over }}
            </span>
            <b data-test="over" class="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">
              +{{ fmtMln(Math.abs(row.gap ?? 0)) }}
            </b>
          </span>
          <span v-else class="flex min-w-0 flex-col items-end text-right text-[0.8125rem] text-[var(--text-secondary)]">
            <span class="flex items-center gap-1.5">
              <i class="h-2.5 w-2.5 shrink-0 rounded-[3px]" :style="{ background: 'color-mix(in srgb, var(--line) 75%, var(--surface-2))' }" />
              {{ L.cap_gap }}
            </span>
            <b data-test="gap" class="mt-0.5 text-[0.9375rem] font-semibold tabular-nums text-[var(--text)]">
              {{ L.cap_value(fmtMln(Math.max(0, row.gap ?? 0)), fmtPct(100 - Math.min(100, coverPct))) }}
            </b>
          </span>
        </div>
      </section>

      <!-- ── 3a. Из чего складывается — ТОЛЬКО на экране парка ──────────── -->
      <section
        v-if="park && items.length"
        data-test="inside"
        class="bc-fade-in rounded-2xl bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]"
      >
        <p class="mb-1 text-[0.8125rem] text-[var(--text-muted)]">{{ L.inside_title }}</p>
        <div
          v-for="d in items"
          :key="d.code"
          class="flex items-center gap-2.5 border-t border-[var(--line)] py-3 first:border-t-0"
        >
          <span class="shrink-0 rounded-md bg-[var(--graphite)] px-2 py-[3px] text-[0.6875rem] font-bold leading-none text-[var(--ink-on-color)]">
            {{ d.short }}
          </span>
          <span class="min-w-0 flex-1 text-[0.875rem] leading-snug text-[var(--text)]">
            {{ d.name }}
            <!-- Фоновый = работает с прошлых месяцев. Метка, а не отдельная секция:
                 группировок «свежие/фоновые» на странице списка не заводим (§2 ТЗ). -->
            <span
              v-if="d.bg"
              data-test="bg"
              class="ml-1 inline-block whitespace-nowrap rounded border border-[var(--line)] bg-[var(--surface-2)] px-1.5 align-middle text-[0.625rem] text-[var(--text-muted)]"
            >{{ L.inside_bg }}</span>
          </span>
          <span class="w-[72px] shrink-0">
            <ContribBar compact :segments="[{ key: 'r', pct: d.barPct, kind: 'accent' }]" :label="d.name" />
          </span>
          <span class="w-11 shrink-0 text-right text-[0.875rem] font-semibold tabular-nums text-[var(--text)]">
            {{ fmtPct(d.pct_in) }}
          </span>
        </div>
      </section>

      <!-- ── 3b. «Сила драйверов»: разбивка по паркам (только «Вся сеть») ── -->
      <section
        v-if="!park"
        data-test="parks"
        class="bc-fade-in rounded-2xl bg-[var(--surface)] p-4 shadow-[var(--card-shadow)]"
      >
        <p class="mb-1 text-[0.8125rem] text-[var(--text-muted)]">{{ L.parks_title }}</p>
        <component
          :is="p.has ? 'button' : 'div'"
          v-for="p in parks"
          :key="p.park"
          :type="p.has ? 'button' : null"
          data-test="park-row"
          class="flex w-full items-center gap-2.5 border-t border-[var(--line)] py-2 text-left first:border-t-0"
          :class="p.has ? 'active:bg-[var(--surface-2)]' : ''"
          style="min-height: 44px"
          @click="p.has ? setPark(p.park) : null"
        >
          <span class="min-w-0 flex-1 text-[0.9375rem] font-semibold text-[var(--text)]">
            {{ parkLabel(p.park) }}<span v-if="p.has" class="text-[var(--text-muted)]"> ›</span>
          </span>
          <template v-if="p.has">
            <span class="w-[84px] shrink-0">
              <ContribBar compact :segments="[{ key: 'c', pct: p.barPct, kind: 'accent' }]" :label="parkLabel(p.park)" />
            </span>
            <span class="w-11 shrink-0 text-right text-[0.875rem] font-semibold tabular-nums text-[var(--text)]">
              {{ fmtPct(p.covered_pct) }}
            </span>
          </template>
          <span v-else class="shrink-0 text-[0.875rem] text-[var(--text-muted)]">—</span>
        </component>
      </section>
    </template>

    <!-- Парк выбран, но раскладывать нечего (нет строки в driver_contrib — так у MARI). -->
    <div
      v-else
      data-test="no-split"
      class="flex min-h-[40svh] flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <p class="text-[1.0625rem] text-[var(--text)]">{{ L.no_split }}</p>
      <p class="text-[0.9375rem] text-[var(--text-muted)]">{{ L.no_split_hint }}</p>
    </div>
  </div>
</template>
