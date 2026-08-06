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
        <div class="overflow-x-auto" style="-webkit-overflow-scrolling: touch">
        <table class="w-full min-w-[460px] border-collapse text-[0.8125rem] [font-variant-numeric:tabular-nums]">
          <thead>
            <tr class="text-[0.6875rem] uppercase tracking-wide text-[var(--text-muted)]">
              <th class="px-3 py-2 text-left font-semibold">день</th>
              <th class="px-3 py-2 text-right font-semibold">план</th>
              <th class="px-3 py-2 text-right font-semibold">факт</th>
              <th class="px-3 py-2 text-right font-semibold">надо</th>
              <th class="px-3 py-2 text-right font-semibold" style="width: 84px">прогресс</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in w.rows" :key="r.dd" class="border-t border-[var(--line)]" :class="r.weekend ? 'bg-[var(--surface-2)]' : ''">
              <td class="px-3 py-1.5 text-left text-[var(--text)]">
                {{ r.dd }} <span class="text-[0.6875rem] text-[var(--text-muted)]">{{ r.dowRu }}</span>
                <!-- Маркер переключения. Кнопка (тап на телефоне ведёт в раздел, §3.3).
                     Два требования тянут в разные стороны: тач-таргет ≥44pt (HIG) и
                     «маркер не должен менять высоту строки дня и толкать цифры» (§3.2 —
                     первое, что владелец заметит на телефоне). Разводим их по слоям:
                     видимая геометрия — inline-flex 24px с -my-1 (margin-box 16px, в
                     line-box строки помещается), активная зона — absolute-оверлей 44×44,
                     он вне потока и на высоту не влияет. Соседние строки некликабельны,
                     поэтому перехлёст зоны безвреден. -->
                <button
                  v-if="r.mark"
                  type="button"
                  data-test="drv-mark"
                  :data-kind="r.mark"
                  class="relative -my-1 ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center align-middle"
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
                    class="block h-2.5 w-2.5 rounded-full"
                    :class="r.mark === 'on'
                      ? 'bg-[var(--text)]'
                      : 'border border-dashed border-[var(--text-muted)]'"
                    aria-hidden="true"
                  />
                </button>
              </td>
              <td class="px-3 py-1.5 text-right text-[var(--text-secondary)]">{{ ths(r.plan) }}</td>
              <td class="px-3 py-1.5 text-right text-[var(--text)]">
                <template v-if="r.full">{{ ths(r.fact) }}<span v-if="r.chk" class="ml-1 text-[0.6875rem] text-[var(--text-muted)]">чек {{ Math.round(r.chk) }}</span><span v-if="r.outlier" class="ml-1 rounded border border-dashed border-[var(--line)] px-1 text-[0.625rem] text-[var(--text-muted)]">событие</span></template>
                <template v-else-if="r.status === 'partial'">{{ ths(r.fact) }} <span class="rounded border border-dashed border-[var(--line)] px-1 text-[0.625rem] text-[var(--text-muted)]">неполн.</span></template>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
              <td class="px-3 py-1.5 text-right font-medium text-[var(--text-secondary)]">
                <template v-if="!r.full">{{ ths(r.need) }}</template>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
              <td class="px-3 py-1.5">
                <div v-if="r.full" class="relative h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <i class="absolute bottom-0 left-0 top-0 rounded-full" :style="{ width: r.progWidth + '%', background: SIG_VAR[r.sig] }" />
                </div>
                <span v-else class="text-[var(--text-muted)]">—</span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <div v-if="w.leftDays > 0 && w.hasFact" class="border-t border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[0.75rem] text-[var(--text-muted)]">
          Осталось в неделе {{ w.leftDays }} дн — «надо» с хвостом: <b class="font-semibold text-[var(--text)]">{{ mln(w.need) }}</b>.
        </div>
      </div>
    </details>
  </section>
</template>
