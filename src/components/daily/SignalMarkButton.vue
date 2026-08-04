<script setup>
import { computed } from 'vue'
import { readFor, readDay, isMarkable } from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'

// Кнопка отметки одного сигнала. Вынесена в отдельный компонент, потому что кнопок
// стало много: свежий сигнал И каждая строка ленты. Раньше кнопка была одна — только
// у самого свежего сигнала, — и всё, что уезжало в ленту, становилось неотмечаемым
// навсегда. Так за 22.07–04.08 потерялось 12 отметок из 42; сигнал за 02.08 не смог
// отметить ни один парк.
//
// ТРИ СОСТОЯНИЯ вместо двух. Без «отправляем» два требования противоречат друг другу:
// зафиксировать нажатие сразу (чтобы не потерялось) и не показывать «✓» до того, как
// бэк подтвердил запись.
const props = defineProps({
  park: { type: String, required: true },
  date: { type: String, required: true },
  reads: { type: Array, default: () => [] },
  // Локальное подтверждение с прошлых заходов (localStorage). Пер-девайсное; канон —
  // проекция бэка, но она приходит только со следующей загрузкой payload.
  localRead: { type: Boolean, default: false },
  now: { type: Date, default: null },
  // Дату отметки показываем только у свежего сигнала: в ленте она уже слева в строке.
  showDate: { type: Boolean, default: true },
})
const emit = defineEmits(['mark', 'rate'])

const { statusOf, errorOf } = useSignalRead()

const state = computed(() => statusOf(props.park, props.date))
const serverRead = computed(() => readFor(props.reads, props.park, props.date))
// Отмечено = так считает бэк, ИЛИ так считает устройство, ИЛИ бэк подтвердил в этой
// сессии. Раньше «✓» ставилось оптимистично, ещё до ответа, — и упавший запрос
// оставлял человека в уверенности, что отметка ушла.
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

const label = computed(() => {
  if (state.value === 'sending') return L.signal_read_done
  return done.value ? L.signal_read_done : L.signal_read
})
const disabled = computed(() => done.value || state.value === 'sending' || !markable.value)

function onClick() {
  if (disabled.value) return
  emit('mark', props.date)
}
</script>

<template>
  <div>
    <button
      type="button"
      data-test="signal-read"
      :data-state="state"
      :disabled="disabled"
      class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-4 text-[0.9375rem] font-medium text-[var(--text)] transition-opacity active:opacity-90 disabled:opacity-100"
      style="min-height: 44px"
      @click="onClick"
    >
      <span>{{ label }}{{ done ? ' ✓' : '' }}</span>
      <!-- третье состояние: нажатие принято, но бэк ещё не подтвердил -->
      <span v-if="state === 'sending'" data-test="signal-read-sending" class="text-[0.8125rem] text-[var(--text-muted)]">· {{ L.signal_read_sending }}</span>
      <span v-else-if="done && showDate && readDate" data-test="signal-read-date" class="text-[0.8125rem] text-[var(--text-muted)]">· {{ readDate }}</span>
      <span v-else-if="!markable && !done" data-test="signal-archive" class="text-[0.8125rem] text-[var(--text-muted)]">· {{ L.signal_archive }}</span>
    </button>

    <!-- Отправить не удалось и повторять бессмысленно: молчать нельзя, иначе
         «не нажал» не отличить от «нажал, но не долетело». -->
    <p
      v-if="state === 'failed'"
      data-test="signal-error"
      class="mt-2 rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))"
    >{{ L.signal_error }}</p>

    <!-- Долг по оценке: прочтение записано, оценка нет. Досылаем сами, но человек
         об этом знает и может поставить её заново. -->
    <p
      v-else-if="state === 'score-debt'"
      data-test="signal-score-debt"
      class="mt-2 rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--warning) 12%, var(--surface))"
    >{{ L.signal_rate_failed }}</p>

    <!-- КОНТУР Б: закрыл модалку без оценки — прочтение всё равно записано, а долг
         виден и кнопка «Оценить» жива. Переоценка (Ф-5) — та же кнопка: бэк умеет
         «последняя оценка побеждает» с 28.07, но из UI это было недостижимо. -->
    <button
      v-if="done && markable && state !== 'sending'"
      type="button"
      data-test="signal-rate-cta"
      class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--surface-2)] px-4 text-[0.875rem] font-medium text-[var(--text)] active:opacity-90"
      style="min-height: 44px"
      @click="emit('rate', date)"
    >
      <span>{{ score === null ? L.signal_rate_cta : L.signal_rate_change }}</span>
      <span v-if="score === null" class="text-[0.8125rem] text-[var(--text-muted)]">· {{ L.signal_rate_none }}</span>
      <span v-else class="text-[0.8125rem] tabular-nums text-[var(--text-muted)]">· {{ score }}</span>
    </button>
  </div>
</template>
