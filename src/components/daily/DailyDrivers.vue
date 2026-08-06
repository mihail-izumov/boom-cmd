<script setup>
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { L } from '../../i18n/daily.js'

// Вход в «Драйверы роста» из «Контроля дня» (§3.1, D-75; вид — правка владельца 06.08).
//
// Ровно ОДИН вход вместо прежнего блока-списка: «Контроль дня» отвечает на «что
// изменилось в ЭТОМ парке в ЭТОМ месяце», а «что вообще идёт и с какого числа» —
// это раздел, и он принят 30.07. Держать список в двух местах значит гарантированно
// их рассинхронить.
//
// Форма — по образцу «Моя волна по разделу» (Яндекс Музыка): яркая заливка, всё по
// центру, внутри мелкая подводка и крупное имя раздела с иконкой вплотную.
// Весь блок — ОДНА кнопка (правка владельца 06.08): подводка — статусы драйверов
// парка (те же числа, что в разделе), крупная строка — куда ведёт кнопка.
//
// ⚠ Чего на экране больше НЕТ и что стоит помнить: сигнала «Без замера N из M»
// (`driversMeasureSignal`, ниже в i18n — функция сохранена, но не рендерится) и
// строки «что переключили в этом месяце» (`driversSwitches`, там же). Оба
// снимались решениями владельца. Блок стал чисто навигационным: единственное, что
// «Контроль дня» теперь говорит про драйверы сам, — бейдж «ДР» в дне переключения.
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
      <!-- Подводка — статусы драйверов парка (правка владельца 06.08: весь блок
           уместить в одну кнопку). Кружок счётчика на жёлтом не может быть на
           `--line` — он бы выглядел грязно; берём тёмный ink-размыв от самой
           заливки: цифра на кружке 8,85:1, подпись ink 70 % — 5,14:1. -->
      <span
        v-if="chips.length"
        data-test="drivers-statuses"
        class="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[0.75rem] leading-tight text-[var(--accent-ink)]"
      >
        <span v-for="s in chips" :key="s.id" class="inline-flex items-center gap-1">
          <span class="opacity-70">{{ s.label }}</span>
          <span
            class="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[0.6875rem] font-semibold leading-none"
            style="background: color-mix(in srgb, var(--accent-ink) 12%, transparent)"
          >{{ s.count }}</span>
        </span>
      </span>
      <!-- Иконка вплотную к слову и одной жирностью с ним — как «▶ Коллекция»
           в референсе: это одна единица, а не подпись со значком. -->
      <span class="mt-0.5 flex items-center justify-center text-[1.125rem] font-bold leading-tight text-[var(--accent-ink)]">
        <ChevronRight class="-ml-1 h-5 w-5 shrink-0" :stroke-width="3.25" aria-hidden="true" />
        {{ L.drivers_row }}
      </span>
    </button>

  </section>
</template>
