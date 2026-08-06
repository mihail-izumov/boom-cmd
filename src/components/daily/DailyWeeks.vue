<script setup>
import { ChevronDown } from 'lucide-vue-next'
import { mln, ths, thsSigned, dayGen, markTitle, L, SIG_VAR } from '../../i18n/daily.js'

// Недели Пн–Вс: раскрывающийся блок с таблицей дней (план/факт/надо/прогресс).
// Прогресс — цветная заливка (sig); числа монохромные.
//
// Драйверы в дне (задание 06.08 §3.2, D-42/D-76): точка-маркер ТОЛЬКО в день
// включения/выключения и БЕЗ кода на самом маркере. Бейдж `DRV-04` под каждым днём
// работы был повтором одного факта 31 раз, а в узкую колонку дня код и не влезает —
// он живёт в `title` и в строке-сводке над таблицей. Драйверы-фон (включённые в
// прошлых месяцах) в таблице не появляются вовсе.
const props = defineProps({ m: { type: Object, required: true } })
const emit = defineEmits(['open-drivers'])
const monthGen = (dd) => dayGen(dd, props.m.month)

// Плашка факта = и число, и прогресс (правка владельца 06.08). Полоса под числом
// сдвигала цифру и её серый трек совпадал с фоном строки выходного; отдельная
// плашка потеряла бы саму долю выполнения. Поэтому доля живёт В заливке плашки:
// жёсткая граница градиента на `progWidth` % — слева выполнено, справа остаток.
//
// ОБЕ части светлые тона одного токена сигнала: тёмный текст читается и на
// выполненной части, и на остатке (9,4–16,5:1 — посчитано по WCAG). Насыщенную
// заливку сюда class ставить нельзя — на границе текст ушёл бы в нечитаемое.
function progFill(r) {
  const c = SIG_VAR[r.sig]
  const w = Math.max(0, Math.min(100, r.progWidth))
  const done = `color-mix(in srgb, ${c} 40%, var(--surface))`
  const left = `color-mix(in srgb, ${c} 8%, var(--surface))`
  return `linear-gradient(90deg, ${done} 0 ${w}%, ${left} ${w}% 100%)`
}
</script>

<template>
  <section>
    <h2 class="mb-3 mt-2 text-[0.8125rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{{ L.by_weeks }}</h2>
    <details
      v-for="w in m.weeks"
      :key="w.idx"
      :open="w.rows.some((r) => r.status != null)"
      class="mb-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"
    >
      <summary class="flex cursor-pointer list-none flex-col gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-[var(--text)]">Неделя {{ w.idx }}</span>
          <span class="text-[0.75rem] text-[var(--text-muted)]">{{ w.from }}–{{ w.to }} {{ monthGen(w.to).split(' ')[1] }}</span>
          <ChevronDown class="ml-auto h-4 w-4 text-[var(--text-muted)]" :stroke-width="2" />
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem]">
          <span><span class="text-[var(--text-muted)]">план </span><b class="font-semibold text-[var(--text)]">{{ mln(w.plan) }}</b></span>
          <span v-if="w.hasFact"><span class="text-[var(--text-muted)]">факт </span><b class="font-semibold text-[var(--text)]">{{ mln(w.fact) }}</b></span>
          <span v-else><span class="text-[var(--text-muted)]">надо </span><b class="font-semibold text-[var(--text)]">{{ mln(w.need) }}</b></span>
          <span v-if="w.hasFact"><span class="text-[var(--text-muted)]">откл. </span><b class="font-semibold text-[var(--text-secondary)]">{{ thsSigned(w.delta) }}</b></span>
        </div>
      </summary>

      <div class="border-t border-[var(--line)]">
        <!-- Таблица помещается в мобильную колонку БЕЗ горизонтального скролла
             (правка владельца 06.08). Колонка «прогресс» слита с «фактом» — полоса
             ушла под число, — а колонка чека убрана: средний чек по дням живёт ниже,
             в секции «Метрики по дням», и здесь был вторым местом для того же числа.
             `table-fixed` + проценты: числа формата «252 тыс» не разъезжают колонки. -->
        <table class="w-full table-fixed border-collapse text-[0.8125rem] [font-variant-numeric:tabular-nums]">
          <thead>
            <tr class="text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">
              <th class="w-[21%] px-2 py-2 text-left font-semibold">день</th>
              <th class="w-[22%] px-2 py-2 text-right font-semibold">план</th>
              <th class="w-[35%] px-2 py-2 text-right font-semibold">факт</th>
              <th class="w-[22%] px-2 py-2 text-right font-semibold">надо</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in w.rows" :key="r.dd" class="border-t border-[var(--line)]" :class="r.weekend ? 'bg-[var(--surface-2)]' : ''">
              <td class="px-2 py-1.5 text-left text-[var(--text)]">
                {{ r.dd }} <span class="text-[0.6875rem] text-[var(--text-muted)]">{{ r.dowRu }}</span>
                <!-- Метка переключения драйвера. Была точка — не читалась (правка
                     владельца 06.08), стал бейдж «ДР». Это НЕ код драйвера (D-76:
                     `DRV-04` в узкую колонку не влезает, а голый номер читается как
                     шум) — это метка «здесь поменяли работу парка»; код и название
                     приходят в `title`. Залитый = включение, пунктирный = выключение.
                     Активная зона 44×44 — absolute-оверлеем вне потока, чтобы бейдж
                     не менял высоту строки и не толкал цифры (§3.2). -->
                <button
                  v-if="r.mark"
                  type="button"
                  data-test="drv-mark"
                  :data-kind="r.mark"
                  class="relative -my-1 ml-1 inline-flex h-6 shrink-0 items-center align-middle"
                  :title="markTitle(r.markEvents)"
                  :aria-label="markTitle(r.markEvents)"
                  @click.stop="emit('open-drivers')"
                >
                  <!-- активная зона 44×44 pt, вне потока -->
                  <span
                    class="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <i
                    class="block rounded px-1 text-[0.625rem] font-bold not-italic leading-[1.4]"
                    :class="r.mark === 'on'
                      ? 'bg-[var(--text)] text-[var(--ink-on-color)]'
                      : 'border border-dashed border-[var(--text-muted)] text-[var(--text-muted)]'"
                  >ДР</i>
                </button>
              </td>
              <td class="px-2 py-1.5 text-right text-[var(--text-secondary)]">{{ ths(r.plan) }}</td>
              <!-- Факт — плашка, число ВНУТРИ неё (правка владельца 06.08).
                   Полоса под числом сдвигала цифру и ломала общий ряд, а её серый
                   трек `--surface-2` совпадал с фоном строки выходного — на субботе
                   и воскресенье прогресса просто не было видно. Теперь одна строка,
                   цифры всех дней на одной базовой линии, а светофор несёт заливка.
                   Тон — `color-mix` от токена сигнала (тот же приём, что у статус-
                   бейджей «Драйверов роста»), текст монохромный: 11–15:1. -->
              <td class="px-2 py-1.5 text-right align-middle text-[var(--text)]">
                <span
                  v-if="r.full"
                  class="inline-flex w-full items-center justify-end gap-1 whitespace-nowrap rounded-full px-2 py-0.5"
                  :style="{ background: progFill(r) }"
                >
                  <i
                    v-if="r.outlier"
                    class="not-italic text-[0.625rem] leading-none text-[var(--text-secondary)]"
                    title="день-выброс: событие"
                  >событие</i>
                  {{ ths(r.fact) }}
                </span>
                <span
                  v-else-if="r.status === 'partial'"
                  class="inline-flex w-full items-center justify-end gap-1 whitespace-nowrap rounded-full border border-dashed border-[var(--line)] px-2 py-0.5"
                >
                  <i class="not-italic text-[0.625rem] leading-none text-[var(--text-muted)]">неполн.</i>
                  {{ ths(r.fact) }}
                </span>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
              <td class="px-2 py-1.5 text-right align-middle font-medium text-[var(--text-secondary)]">
                <span v-if="!r.full" class="whitespace-nowrap">{{ ths(r.need) }}</span>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="w.leftDays > 0 && w.hasFact" class="border-t border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[0.75rem] text-[var(--text-muted)]">
          Осталось в неделе {{ w.leftDays }} дн — «надо» с хвостом: <b class="font-semibold text-[var(--text)]">{{ mln(w.need) }}</b>.
        </div>
      </div>
    </details>
  </section>
</template>
