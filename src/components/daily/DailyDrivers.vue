<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { driversMeasureSignal, L } from '../../i18n/daily.js'

// Вход в «Драйверы роста» из «Контроля дня» (§3.1, D-75; вид — правка владельца 06.08).
//
// Ровно ОДИН вход вместо прежнего блока-списка: «Контроль дня» отвечает на «что
// изменилось в ЭТОМ парке в ЭТОМ месяце», а «что вообще идёт и с какого числа» —
// это раздел, и он принят 30.07. Держать список в двух местах значит гарантированно
// их рассинхронить.
//
// Форма — по образцу «Моя волна по разделу» (Яндекс Музыка): яркая заливка, всё по
// центру, внутри мелкая подводка и крупное имя раздела с иконкой вплотную, под
// кнопкой — приглушённая подпись. Три строки делят работу так, чтобы ни одна не
// повторяла соседнюю:
//   • подводка внутри кнопки — СИГНАЛ «сможем ли мы узнать, работают ли драйверы»
//     (сколько работает вслепую, без замера). Не пересказ данных и не результат;
//   • крупная строка — куда ведёт кнопка;
//   • подпись под кнопкой — СТАТУСЫ драйверов парка, те же числа, что в разделе.
//
// Заливка — брендовый жёлтый `--accent`, текст на ней тёмный `--accent-ink`
// (DESIGN-STANDARD: жёлтый только заливкой, текст монохромный). Контраст посчитан:
// ink на жёлтом 11,12:1, подводка (ink 70 %) — 5,14:1, подпись — 5,18:1.
const props = defineProps({
  m: { type: Object, required: true },
  // Статусы раздела (тот же расчёт, что в «Драйверах роста» — driversModel),
  // приходят готовыми из экрана: компонент за данными не ходит.
  statuses: { type: Array, default: () => [] },
})
const emit = defineEmits(['open'])

const d = computed(() => props.m.drivers || null)
// Скрываем в двух случаях: драйверов нет вовсе (пустая вкладка daily_activities) и
// новые поля ещё не приехали (боевой Apps Script до v3.14) — см. computeDrivers.ready.
const show = computed(() => !!(d.value && d.value.ready && d.value.total > 0))
const signal = computed(() => driversMeasureSignal(d.value))
// Нулевые статусы не печатаем: «Пауза 0» — это шум, а не факт.
const chips = computed(() => (props.statuses || []).filter((s) => s && s.count))
</script>

<template>
  <section v-if="show" class="flex flex-col gap-2">
    <button
      type="button"
      data-test="drivers-cta"
      class="w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-center transition-opacity active:opacity-90"
      :aria-label="L.drivers_aria"
      @click="emit('open')"
    >
      <!-- Подводка-сигнал. Монохром, приглушение прозрачностью, а не вторым
           цветом — цветного текста в системе нет. -->
      <span
        data-test="drivers-signal"
        class="block text-[0.75rem] leading-tight text-[var(--accent-ink)] opacity-70"
      >{{ signal }}</span>
      <!-- Иконка вплотную к слову и одной жирностью с ним — как «▶ Коллекция»
           в референсе: это одна единица, а не подпись со значком. -->
      <span class="mt-0.5 flex items-center justify-center text-[1.125rem] font-bold leading-tight text-[var(--accent-ink)]">
        <ChevronRight class="-ml-1 h-5 w-5 shrink-0" :stroke-width="3.25" aria-hidden="true" />
        {{ L.drivers_row }}
      </span>
    </button>

    <!-- Статусы: подпись + число в кружке (тот же язык, что счётчики групп раздела).
         Не чипы-бейджи — акцент на экране один, и он на кнопке. -->
    <ul
      v-if="chips.length"
      data-test="drivers-statuses"
      class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-1"
    >
      <li
        v-for="s in chips"
        :key="s.id"
        class="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--text-muted)]"
      >
        {{ s.label }}
        <span
          class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--line)] px-1.5 text-[0.6875rem] font-medium leading-none text-[var(--text-secondary)]"
        >{{ s.count }}</span>
      </li>
    </ul>
  </section>
</template>
