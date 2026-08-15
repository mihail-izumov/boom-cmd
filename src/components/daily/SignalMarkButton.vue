<script setup>
import { computed } from 'vue'
import { readFor, readDay, isMarkable, scoreOf } from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'

// Блок отметки одного сигнала: ОДНА кнопка, открывающая шкалу оценки. Вынесен в
// отдельный компонент, потому что блоков много: свежий сигнал И каждая строка ленты.
//
// ОДИН ШАГ ВМЕСТО ДВУХ (NET-61, решение владельца 15.08). С 04.08 здесь стояли две
// кнопки — «Отметить прочитанным» и «Оценить», — и второй шаг терялся: доля отметок
// с оценкой упала с 84 % до 58 % (замер по времени нажатия, релиз 04.08 17:04 МСК).
// ТЦ Июнь после выката не оценил ни разу — пять отметок подряд.
//
// Возврата к раскладке до 04.08 при этом НЕТ, и это принципиально. Тогда жаловались
// не на окно оценки, а на то, что ПОСЛЕ его закрытия на карточке дорисовывалась
// вторая кнопка — интерфейс выглядел сломанным. Здесь дорисовывать нечего: кнопка
// одна во всех состояниях, меняется только подпись на ней. Прочтение и оценка
// уезжают ОДНИМ запросом из подтверждения шкалы; отказаться от оценки можно, просто
// закрыв шкалу, — прочтение при этом всё равно записывается.
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
const emit = defineEmits(['rate'])

const { statusOf, echoScoreOf } = useSignalRead()

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

// Оценка: сначала эхо ЗАПИСАННОГО значения (подтверждено бэком в этой сессии или в
// прошлой — переживает перезагрузку), потом проекция. Эхо первое не из недоверия к
// проекции, а из-за задержки: payload обновится только со следующей загрузкой, и без
// эха экран после отправки не менялся бы вообще — это и есть «я думала, что не
// проходит».
//
// ⚠ Приведение делает scoreOf, и только он. Здесь стояло `Number(entry.score)`:
// `Number(null)` → 0 и `Number.isInteger(0)` → true, поэтому «прочитал, но не
// оценил» рисовалось как оценка «0» (NET-62). Не возвращать ни при каких правках.
const score = computed(() => {
  const echoed = echoScoreOf(props.park, props.date)
  return echoed !== null ? echoed : scoreOf(serverRead.value)
})
const hasScore = computed(() => score.value !== null)

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

// Подпись кнопки. Три смысла на одном месте: позвать (не отмечено), достучаться
// (отмечено, оценки нет) и НАЗВАТЬ ЗАПИСАННОЕ ЧИСЛО (оценка есть). Последнее —
// требование NET-61 §2.2: «Спасибо, оценка отправлена» не годится, именно
// неразличимость «отправлено» и «записано» породила дубли нажатий.
const label = computed(() => {
  if (hasScore.value) return L.signal_score_prefix
  return done.value ? L.signal_rate_cta : L.signal_read_rate
})
// Отправка в процессе и архив — единственные причины не пускать в шкалу. Отмеченное
// и оценённое НЕ гасим: переоценка разрешена (у signal_scores побеждает последняя
// оценка, строка остаётся одна), отдельная кнопка «изменить» для этого не нужна.
const disabled = computed(() => state.value === 'sending' || !markable.value)

// ── ОКРАСКА КНОПОК (правка владельца 07.08: «не видно на цветной карточке») ──
// Прежняя заливка --surface-2 (#F1F0EC) на окрашенной карточке пропадала совсем:
// фон карточки — signalTint = 12 % цвета статуса на --surface, и контраст заливок
// по WCAG выходил 1,00–1,08:1 (focus #FAE6E4 → 1,05:1). Не «плохо видно» — границы
// кнопки нет вовсе. Жёлтый как заливка тоже отпадает: --accent на warn-карточке
// даёт 1,46:1 — та же ловушка, что уже ловили с бейджем «новое».
//
// Схема: главное действие — тёмная плашка (идиома проекта: чёрный бейдж работает
// на любом тоне), второстепенное и выполненное — белая плашка с ТЁМНЫМ кантом.
// Кант, а не заливка: белая заливка на светлом тинте сама даёт лишь 1,20:1, всю
// работу по отделению кнопки от фона делает линия.
const BTN = 'flex w-full items-center justify-center gap-2 rounded-xl border px-4 ' +
  'text-[0.9375rem] font-medium transition-opacity active:opacity-90 disabled:opacity-100'
// Призыв к действию. --text на любом тинте: 14,36:1 (focus) … 16,27:1 (warn);
// белый текст на самой плашке — 17,22:1.
const BTN_PRIMARY = 'border-transparent bg-[var(--text)] text-[var(--ink-on-color)]'
// Оценка уже записана: действие остаётся возможным (переоценка), но звать к нему
// незачем. Кант --text-secondary: 8,24:1 к тинту, 9,88:1 к своей заливке — линия
// читается и на цветной карточке, и на белом фоне ленты «Ранее».
const BTN_QUIET = 'border-[var(--text-secondary)] bg-[var(--surface)] text-[var(--text)]'
// Архив: действия больше нет, но кнопка обязана остаться различимой. Кант
// --text-muted: 4,32:1 к тинту, 5,18:1 к заливке — выше порога 3:1 для нетекстовых
// элементов (WCAG 1.4.11), но заметно тише призыва.
const BTN_MUTED = 'border-[var(--text-muted)] bg-[var(--surface)] text-[var(--text)]'

// Пока оценки нет — зовём тёмной плашкой, даже если прочтение уже отмечено: именно
// этот шаг и теряется. Оценка есть → тихая плашка.
const btnMark = computed(() => {
  if (!markable.value) return `${BTN} ${BTN_MUTED}`
  return `${BTN} ${hasScore.value ? BTN_QUIET : BTN_PRIMARY}`
})

// Бейдж числа: пилюля с кантом. Раньше была белая на --line — на белой кнопке такая
// пилюля исчезала, кант --line к --surface даёт 1,31:1. Теперь заливка --surface-2
// с кантом --text-muted: кант 4,54:1, цифра 15,10:1.
// Отдельная плашка вместо «· 04.08» — точка-разделитель посреди строки читалась
// как случайный символ, а не как структура.
const BADGE = 'inline-flex items-center rounded-full border border-[var(--text-muted)] bg-[var(--surface-2)] ' +
  'px-2 py-0.5 text-[0.8125rem] font-semibold tabular-nums text-[var(--text)]'
// Подпись-статус словом (не число). Цвет зависит от плашки под ней: на тёмной
// --text-secondary даёт 1,74:1 (нечитаемо), поэтому там текст белый, а второстепенность
// несёт НЕ цвет, а начертание — font-normal против font-medium у подписи кнопки.
// На белой плашке --text-secondary даёт 9,88:1.
const NOTE = 'text-[0.8125rem] font-normal'
const noteMark = computed(
  () => `${NOTE} ${!markable.value || hasScore.value ? 'text-[var(--text-secondary)]' : 'text-[var(--ink-on-color)]'}`,
)
// Строка статуса живёт НА КАРТОЧКЕ (тинт), а не на плашке кнопки: --text-muted на
// тинте focus даёт 4,32:1 — ниже порога 4,5:1 для мелкого текста, поэтому здесь на
// тон темнее, --text-secondary (8,24:1 к самому тёмному из тинтов).
const STATE_LINE = 'flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.8125rem] text-[var(--text-secondary)]'
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- ОДНА кнопка на все состояния: она же открывает шкалу, она же показывает
         записанную оценку. Второго действия, дорисованного после закрытия окна,
         на карточке нет — именно на него жаловались 04.08. -->
    <button
      type="button"
      data-test="signal-read"
      :data-state="state"
      :data-scored="hasScore ? '1' : '0'"
      :disabled="disabled"
      :class="btnMark"
      style="min-height: 44px"
      @click="!disabled && emit('rate', date)"
    >
      <span>{{ label }}</span>
      <span v-if="hasScore" data-test="signal-score-badge" :class="BADGE">{{ score }}</span>
      <span v-if="state === 'sending'" data-test="signal-read-sending" :class="noteMark">{{ L.signal_read_sending }}</span>
      <span v-else-if="!markable" data-test="signal-archive" :class="noteMark">{{ L.signal_archive }}</span>
      <span v-else-if="hasScore" data-test="signal-score-change" :class="noteMark">{{ L.signal_score_change }}</span>
    </button>

    <!-- Результат отдельной строкой, а не второй кнопкой: подтверждение обязано
         остаться на экране после закрытия окна (NET-61 §2.2), но кликать в него
         нечего — значит и «дорисованного действия» не возникает. -->
    <p v-if="done" data-test="signal-read-state" :class="STATE_LINE">
      <span>{{ L.signal_read_done }} ✓</span>
      <span v-if="readDate" data-test="signal-read-date" :class="BADGE">{{ readDate }}</span>
      <span v-if="!hasScore && state !== 'score-debt'" data-test="signal-score-none">{{ L.signal_rate_none }}</span>
    </p>

    <!-- Отправить не удалось и повторять бессмысленно: молчать нельзя, иначе
         «не нажал» не отличить от «нажал, но не долетело». -->
    <p
      v-if="state === 'failed'"
      data-test="signal-error"
      class="rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))"
    >{{ L.signal_error }}</p>

    <!-- Связь оборвалась. Молча ждать бэкофф нельзя: сорвавшаяся отправка выглядела
         бы точно так же, как идущая, — и человек нажимает второй раз. Кнопка при
         этом активна: повторить можно руками, не дожидаясь очереди. -->
    <p
      v-else-if="state === 'retry'"
      data-test="signal-retry"
      class="rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--warning) 12%, var(--surface))"
    >{{ L.signal_retry }}</p>

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
