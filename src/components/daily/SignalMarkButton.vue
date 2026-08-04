<script setup>
import { computed } from 'vue'
import { readFor, readDay, isMarkable } from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'

// Блок отметки одного сигнала: ДВЕ кнопки — «Отметить прочитанным» и «Оценить».
// Вынесен в отдельный компонент, потому что блоков стало много: свежий сигнал И
// каждая строка ленты. Раньше кнопка была одна и только у самого свежего сигнала —
// всё, что уезжало в ленту, становилось неотмечаемым навсегда (12 потерь из 42).
//
// ДВЕ КНОПКИ СРАЗУ, а не одна с дорисовкой (правка владельца 04.08). Прежний поток
// «нажал → всплыло окно оценки → закрыл → появилась вторая кнопка» читался как сбой:
// интерфейс дорисовывал элементы после закрытия окна. Теперь оба действия видны
// заранее и независимы. Модалка сама не всплывает — её открывает вторая кнопка.
//
// Оценить можно и не отмечая прочтение: бэк на любой signal_read пишет и прочтение
// тоже (appendRead_ + appendScore_ в одной ветке), так что путь в один шаг честен.
//
// ТРИ СОСТОЯНИЯ отметки вместо двух. Без «отправляем» два требования противоречат
// друг другу: зафиксировать нажатие сразу (чтобы не потерялось) и не показывать «✓»
// до того, как бэк подтвердил запись.
const props = defineProps({
  park: { type: String, required: true },
  date: { type: String, required: true },
  reads: { type: Array, default: () => [] },
  // Локальное подтверждение с прошлых заходов (localStorage). Пер-девайсное; канон —
  // проекция бэка, но она приходит только со следующей загрузкой payload.
  localRead: { type: Boolean, default: false },
  now: { type: Date, default: null },
})
const emit = defineEmits(['mark', 'rate'])

const { statusOf } = useSignalRead()

const state = computed(() => statusOf(props.park, props.date))
const serverRead = computed(() => readFor(props.reads, props.park, props.date))
// Отмечено = так считает бэк, ИЛИ так считает устройство, ИЛИ бэк подтвердил в этой
// сессии. Оптимистичной галочки нет: упавший запрос не должен оставлять человека в
// уверенности, что отметка ушла.
const done = computed(
  () => !!serverRead.value || props.localRead || state.value === 'done' || state.value === 'score-debt',
)
// Окно ДЕЙСТВИЯ (14 дней). Статус старых сигналов виден — горизонт знания бэка 45
// дней, — но отмечать их поздно: read_at меряет скорость реакции, а не посещаемость.
const markable = computed(() => isMarkable(props.date, props.now || new Date()))
const score = computed(() => {
  const n = serverRead.value ? Number(serverRead.value.score) : NaN
  return Number.isInteger(n) ? n : null
})
// Дата отметки — подтверждение, что запись дошла до бэка, а не осталась в памяти
// телефона (D-36). Канон — read_at из проекции; сразу после успешной отправки его
// ещё нет (payload обновится на следующей загрузке), поэтому показываем сегодняшнюю.
const readDate = computed(() => {
  const server = serverRead.value ? readDay(serverRead.value) : ''
  if (server) return ddmm(server)
  if (state.value !== 'done' && state.value !== 'score-debt') return ''
  const d = props.now || new Date()
  const p = (n) => String(n).padStart(2, '0')
  return ddmm(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
})

const label = computed(() => (done.value ? L.signal_read_done : L.signal_read))
const disabled = computed(() => done.value || state.value === 'sending' || !markable.value)

// Общие классы: кнопка на всю ширину, тач-таргет ≥44pt (HIG).
const BTN = 'flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--surface-2)] px-4 ' +
  'text-[0.9375rem] font-medium text-[var(--text)] transition-opacity active:opacity-90 disabled:opacity-100'
// Бейдж числа: белая пилюля с кантом. Цифра — на --surface, контраст 17,22:1.
// Отдельная плашка вместо «· 04.08» — точка-разделитель посреди строки читалась
// как случайный символ, а не как структура.
const BADGE = 'inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface)] ' +
  'px-2 py-0.5 text-[0.8125rem] font-semibold tabular-nums text-[var(--text)]'
// Подпись-статус словом (не число) — --text-secondary даёт 8,66:1 на --surface-2;
// --text-muted там же даёт лишь 4,54:1, запас копеечный.
const NOTE = 'text-[0.8125rem] font-normal text-[var(--text-secondary)]'
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- 1. Отметка прочтения -->
    <button
      type="button"
      data-test="signal-read"
      :data-state="state"
      :disabled="disabled"
      :class="BTN"
      style="min-height: 44px"
      @click="!disabled && emit('mark', date)"
    >
      <span>{{ label }}{{ done ? ' ✓' : '' }}</span>
      <span v-if="state === 'sending'" data-test="signal-read-sending" :class="NOTE">{{ L.signal_read_sending }}</span>
      <span v-else-if="done && readDate" data-test="signal-read-date" :class="BADGE">{{ readDate }}</span>
      <span v-else-if="!markable" data-test="signal-archive" :class="NOTE">{{ L.signal_archive }}</span>
    </button>

    <!-- 2. Оценка — видна СРАЗУ, наравне с отметкой, а не дорисовывается после неё.
         Отсутствие бейджа с цифрой и есть видимый долг: оценки нет. -->
    <button
      v-if="markable"
      type="button"
      data-test="signal-rate-cta"
      :class="BTN"
      style="min-height: 44px"
      @click="emit('rate', date)"
    >
      <span>{{ score === null ? L.signal_rate_cta : L.signal_rate_change }}</span>
      <span v-if="score !== null" data-test="signal-score-badge" :class="BADGE">{{ score }}</span>
    </button>

    <!-- Отправить не удалось и повторять бессмысленно: молчать нельзя, иначе
         «не нажал» не отличить от «нажал, но не долетело». -->
    <p
      v-if="state === 'failed'"
      data-test="signal-error"
      class="rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))"
    >{{ L.signal_error }}</p>

    <!-- Долг по оценке: прочтение записано, оценка нет. Досылаем сами, но человек
         об этом знает и может поставить её заново. -->
    <p
      v-else-if="state === 'score-debt'"
      data-test="signal-score-debt"
      class="rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--warning) 12%, var(--surface))"
    >{{ L.signal_rate_failed }}</p>
  </div>
</template>
