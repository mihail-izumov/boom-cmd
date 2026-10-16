<script setup>
import { computed, ref } from 'vue'
import { useAccessKey } from '../../composables/useAccessKey.js'
import {
  COMMENT_MAX, COMMENT_COUNTER_FROM, canSendComment, clipComment, postSignalComment,
  sentEntry, sentLabel, loadCommentLog, saveCommentLog, pushCommentLog, commentsFor,
  loadDraft, saveDraft, clearDraft,
} from '../../composables/signalComments.js'
import { networkHint, isOnline } from '../../i18n/net.js'
import { L } from '../../i18n/daily.js'

// «Что было в парке сегодня» — комментарий управляющей к «Сигналу Дня» (NET-235, D-188).
//
// ⚠ НЕ ЗАВИСИТ ОТ ОТМЕТКИ И ОЦЕНКИ (§А.2). Отдельный запрос `signal_comment`, отдельный
// лист на бэке; кнопка «Прочитать и оценить» и её очередь здесь не участвуют вовсе.
// Отправить можно до оценки, после неё и сколько угодно раз за день — каждое
// «Отправить» становится отдельной строкой.
//
// ⚠ МЕСТО НА КАРТОЧКЕ — ПОД кнопкой отметки, а не между текстом сигнала и ней. Задание
// ставит поле «под текстом сигнала» — это выполнено, но первым действием на карточке
// остаётся «Прочитать и оценить»: в NET-61 второе действие рядом с призывом уже стоило
// оценок (84 % → 58 %), а неделя после запуска (NET-236) будет мерить именно их.
//
// АВТОПОВТОРОВ НЕТ НАМЕРЕННО. Комментарий — сообщение, а не идемпотентная отметка: повтор
// после потерянного ответа записал бы тот же текст второй строкой. Не ушло — текст
// остаётся в поле, человек видит «Не отправилось» и жмёт сам (§А.4).
const props = defineProps({
  park: { type: String, required: true },
  // Дата сигнала — как в signal_read: якорь, к какому разбору относятся слова.
  signalDate: { type: String, required: true },
  now: { type: Date, default: null },
})

const API =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_REPORT_API) || ''
const GATE_API =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PROJECTS_API) || ''
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV

const { getKey, logout } = useAccessKey()

// Черновик переживает уход на экран входа и выгрузку вкладки: набранное на телефоне
// в зале терять обиднее всего.
const text = ref(loadDraft(props.park, props.signalDate))
const sending = ref(false)
const failed = ref(false)
const hint = ref('')
const log = ref(loadCommentLog())
// Сменился сигнал (пришёл свежий разбор) — карточка пересоздаёт компонент по :key
// парк:дата, поэтому черновик и журнал здесь всегда относятся к показанному разбору.

const fieldId = computed(() => `signal-comment-${props.park}`)
const len = computed(() => String(text.value || '').length)
const showCounter = computed(() => len.value >= COMMENT_COUNTER_FROM)
const canSend = computed(() => canSendComment(text.value, sending.value))
const entries = computed(() => commentsFor(log.value, props.park, props.signalDate))
const label = (e) => sentLabel(e, props.now || new Date(), L.comment_sent)

function onInput() {
  saveDraft(props.park, props.signalDate, text.value)
  if (failed.value) { failed.value = false; hint.value = '' }
}

async function send() {
  if (!canSendComment(text.value, sending.value)) return
  const park = props.park
  const date = props.signalDate
  const value = clipComment(text.value)
  sending.value = true
  failed.value = false
  hint.value = ''
  try {
    let msk = ''
    if (!API) {
      if (!isDev) throw new Error('Источник отправки не настроен')
      // DEV без VITE_REPORT_API: громко в консоль, в боевой лист ничего не уходит —
      // локальные прогоны не должны попадать в слова управляющих.
      if (typeof console !== 'undefined') {
        console.info('[signal_comment] DEV без VITE_REPORT_API: отправка имитируется, в контур B ничего не уходит')
      }
    } else {
      const key = getKey()
      if (!key) {
        // Сессия истекла. Черновик уже на устройстве — после входа поле его вернёт.
        if (GATE_API) { logout('expired'); return }
        throw new Error('Гейт входа не настроен — нет фразы для отправки')
      }
      const res = await postSignalComment({ api: API, key, park, signalDate: date, comment: value })
      msk = res.msk
    }
    log.value = pushCommentLog(loadCommentLog(), park, date, sentEntry(value, msk, new Date()))
    saveCommentLog(log.value)
    clearDraft(park, date)
    // Поле очищаем только если человек не сменил сигнал за время запроса.
    if (props.park === park && props.signalDate === date) text.value = ''
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('signal_comment failed:', e && e.message)
    failed.value = true
    hint.value = networkHint({ retriable: !!(e && e.retriable), online: isOnline() })
  } finally {
    sending.value = false
  }
}

// ── ОКРАСКА (контраст посчитан формулой WCAG в scripts/verify-signal-comment.mjs) ──
// Поле живёт на окрашенной карточке (тинт 12 % статуса). Белая заливка на тинте даёт
// лишь ~1,2:1, поэтому поле от фона отделяет КАНТ --text-muted: 4,32:1 к самому тёмному
// тинту (focus) — выше 3:1 для нетекстовых элементов (WCAG 1.4.11). Текст --text на
// белом — 17,22:1, подсказка --placeholder — 5,18:1. Шрифт поля 16px: мельче — и
// Safari на iPhone приближает страницу при фокусе.
const FIELD = 'block w-full min-h-[88px] resize-none rounded-xl border border-[var(--text-muted)] ' +
  'bg-[var(--surface)] px-3 py-2.5 text-[1rem] leading-snug text-[var(--text)] outline-none ' +
  'placeholder:text-[var(--placeholder)] focus:border-[var(--text)]'
// Кнопка: тёмная плашка, как «Прочитать и оценить» (идиома проекта — работает на любом
// тинте), пока есть что отправлять; пустое поле — тихая белая плашка с кантом, чтобы
// неактивная кнопка не звала к действию, которого нет.
const BTN = 'flex w-full items-center justify-center rounded-xl border px-4 text-[0.9375rem] font-medium ' +
  'transition-opacity active:opacity-90 disabled:opacity-100'
const btnCls = computed(() => (canSend.value
  ? `${BTN} border-transparent bg-[var(--text)] text-[var(--ink-on-color)]`
  : `${BTN} border-[var(--text-muted)] bg-[var(--surface)] text-[var(--text-secondary)]`))
</script>

<template>
  <section data-test="signal-comment" class="flex min-w-0 flex-col gap-2">
    <label :for="fieldId" class="text-[0.8125rem] font-semibold text-[var(--text)]">{{ L.comment_label }}</label>
    <textarea
      :id="fieldId"
      v-model="text"
      data-test="signal-comment-input"
      rows="3"
      :maxlength="COMMENT_MAX"
      :placeholder="L.comment_placeholder"
      :class="FIELD"
      @input="onInput"
    ></textarea>
    <p v-if="showCounter" data-test="signal-comment-counter" class="text-right text-[0.75rem] tabular-nums text-[var(--text-secondary)]">{{ len }} {{ L.comment_of }} {{ COMMENT_MAX }}</p>

    <button
      type="button"
      data-test="signal-comment-send"
      :data-state="sending ? 'sending' : failed ? 'failed' : 'idle'"
      :disabled="!canSend"
      :class="btnCls"
      style="min-height: 44px"
      @click="send"
    >{{ sending ? L.comment_sending : L.comment_send }}</button>

    <!-- Не ушло: текст остаётся в поле, молчать нельзя — иначе «не нажал» не отличить
         от «нажал, но не долетело». Та же плашка, что у ошибки отметки. -->
    <div
      v-if="failed"
      data-test="signal-comment-error"
      role="alert"
      class="rounded-xl px-3 py-2 text-[0.8125rem] leading-snug text-[var(--text)]"
      style="background: color-mix(in srgb, var(--negative) 12%, var(--surface))"
    >
      <p>{{ L.comment_error }}</p>
      <p v-if="hint" data-test="signal-comment-hint" class="mt-1 text-[var(--text-secondary)]">{{ hint }}</p>
    </div>

    <!-- Что ушло: «Отправлено ЧЧ:ММ» и сам текст, последние три за этот сигнал. Белые
         плашки с кантом --line: на белом фоне текст --text даёт 17,22:1, подпись
         --text-secondary — 9,88:1. Длинное слово или ссылка переносятся, а не
         распирают карточку за край экрана. -->
    <ul v-if="entries.length" data-test="signal-comment-sent" class="flex min-w-0 flex-col gap-1.5">
      <li
        v-for="(e, i) in entries"
        :key="`${e.ts}-${i}`"
        data-test="signal-comment-sent-row"
        class="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
      >
        <p data-test="signal-comment-sent-at" class="text-[0.75rem] font-medium text-[var(--text-secondary)]">{{ label(e) }}</p>
        <p data-test="signal-comment-sent-text" class="mt-0.5 whitespace-pre-line text-[0.8125rem] leading-snug text-[var(--text)] [overflow-wrap:anywhere]">{{ e.text }}</p>
      </li>
    </ul>
  </section>
</template>
