<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { LOGIN_ISSUE_RU as L } from '../i18n/access.js'
import { CONTACT_MAX, MESSAGE_MAX, useLoginIssue } from '../composables/useLoginIssue.js'

// Модалка «Проблемы со входом» (D-22). Живёт на экране входа — там, где человек
// застрял, а не в разделе помощи, куда он не попадёт по определению.
//
// ⚠ ТЕМА. Экран входа переведён в тёмную витрину СКОУПНЫМ `data-theme="auth-dark"`
// на корне AccessKeyForm, а модалка телепортируется в body — то есть НАРУЖУ этого
// скоупа. Без атрибута на телепортированном корне она унаследовала бы светлые
// токены приложения и вылезла бы белым прямоугольником поверх чёрного экрана.
// Именно поэтому `data-theme` продублирован ниже: это не копипаста, а условие
// работы Teleport со скоупными токенами.
//
// СОСТАВ — четыре элемента и ни одного лишнего:
//   1) вердикт + совет — то, ради чего человек вообще может закрыть модалку,
//      не отправляя ничего («выключите VPN» решает большинство случаев);
//   2) поле «Что происходит» — единственное обязательное;
//   3) контакт — необязательный, для ответа;
//   4) раскрываемая справка — состав того, что уходит вместе с заявкой.
//
// ИСХОДОВ ТРИ, А НЕ ДВА. «Ушла», «сохранена и уйдёт позже», «не удалось совсем».
// Средний — главный: жалуется человек без связи, и отправка «прямо сейчас»
// проваливается у него закономерно. Показывать ему красную ошибку означало бы
// врать: заявка на самом деле сохранена и уйдёт при следующем входе.

const props = defineProps({
  open: { type: Boolean, default: false },
  // Чем закончилась последняя попытка входа (useAccessKey.lastFailure).
  // Прокидываем готовым, а не запрашиваем заново: повторять сломанный запрос
  // ради диагностики — значит заставить человека ждать второй раз.
  failure: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const CLOSE_AFTER_MS = 2600 // держим экран исхода дольше обычного: текст длиннее

const message = ref('')
const contact = ref('')
const hp = ref('') // honeypot: заполняется только ботами
const showDiag = ref(false)

const { sending, sent, queued, sendError, diag, collecting, collect, submit, reset } =
  useLoginIssue()

const dialogRef = ref(null)
const inputRef = ref(null)
let closeTimer = null

const finished = computed(() => sent.value || queued.value || sendError.value)

// Время показываем СРАЗУ и человеческим форматом: владелец просил, чтобы в заявке
// стояло время. Часы клиента могут врать — поэтому бэк ставит рядом свой штамп,
// а расхождение между ними само по себе диагноз (сбитые часы ломают TLS).
const at = ref('')
function stampNow() {
  try {
    at.value = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date())
  } catch {
    at.value = ''
  }
}

// Что именно уходит — списком, человеческими подписями. Ключи диагностики
// техничны по необходимости (их читает бэк), но показывать их сырыми нельзя:
// непонятный дамп читается как «они собирают всё подряд».
const diagRows = computed(() => {
  const d = diag.value
  if (!d) return []
  const rows = [
    ['Время на устройстве', at.value],
    ['Связь с приложением', d.probe_self_ok === 'yes' ? `есть (${d.probe_self_ms} мс)` : 'нет'],
    ['Связь с источником данных', d.probe_api_ok === 'yes' ? `есть (${d.probe_api_ms} мс)` : 'нет'],
    ['Выход в интернет', d.vpn || '—'],
    ['Сеть устройства', [d.conn_type, d.conn_rtt !== '' ? `${d.conn_rtt} мс` : ''].filter(Boolean).join(', ') || '—'],
    ['Чем закончился вход', d.fail_detail || '—'],
    ['Попыток / время до отказа', d.attempts ? `${d.attempts} / ${d.ms_to_fail} мс` : '—'],
    ['Версия приложения', d.build || '—'],
  ]
  return rows.filter((r) => r[1])
})

function hide() {
  emit('close')
}

async function onSubmit() {
  if (sending.value || !message.value.trim()) return
  if (hp.value) {
    // Бот. Ведём себя как при успехе и ничего не шлём: сообщать боту, что его
    // распознали, — значит подсказать, как обойти проверку в следующий раз.
    hide()
    return
  }
  await submit({ message: message.value, contact: contact.value })
  closeTimer = setTimeout(hide, CLOSE_AFTER_MS)
}

function focusables() {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.type !== 'hidden')
}

function onKey(e) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    hide()
    return
  }
  if (e.key === 'Tab') {
    const els = focusables()
    if (els.length === 0) {
      e.preventDefault()
      return
    }
    const first = els[0]
    const last = els[els.length - 1]
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

let prevOverflow = ''
watch(
  () => props.open,
  async (v) => {
    if (v) {
      message.value = ''
      contact.value = ''
      hp.value = ''
      showDiag.value = false
      reset()
      stampNow()
      prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKey)
      // Справку собираем ЗДЕСЬ, на открытии: пробы — это сетевые запросы, и
      // гонять их фоном на каждую неудачную попытку входа значит шуметь в сети,
      // которая уже больна. Не ждём результата — форма доступна сразу.
      collect(props.failure)
      await nextTick()
      inputRef.value?.focus?.()
    } else {
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  },
)

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
  if (props.open) {
    document.body.style.overflow = prevOverflow
    document.removeEventListener('keydown', onKey)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      data-theme="auth-dark"
      class="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--scrim)] backdrop-blur-sm sm:items-center"
      role="presentation"
      @click.self="hide"
    >
      <div
        ref="dialogRef"
        data-test="login-issue-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="L.title"
        class="flex max-h-[88svh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-2xl border border-[var(--rim)] bg-[var(--surface)] shadow-[var(--card-shadow)] sm:rounded-2xl"
        style="padding-bottom: env(safe-area-inset-bottom)"
      >
        <header class="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.title }}</h2>
          <button
            type="button"
            class="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] active:bg-[var(--surface-hover)]"
            :aria-label="L.close"
            @click="hide"
          >
            <X class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <!-- ИСХОД. Три состояния, и «сохранена» намеренно выглядит как успех,
             а не как ошибка: заявка не потеряна, человеку делать больше нечего. -->
        <div v-if="finished" data-test="login-issue-result" class="overflow-y-auto px-4 py-6">
          <p v-if="sent" class="text-[1.0625rem] leading-relaxed text-[var(--text)]">{{ L.done }}</p>
          <p v-else-if="queued" data-test="login-issue-queued" class="text-[1.0625rem] leading-relaxed text-[var(--text)]">{{ L.queued }}</p>
          <p v-else class="text-[1.0625rem] leading-relaxed text-[var(--negative)]" role="alert">{{ L.error }}</p>
        </div>

        <form v-else class="flex flex-col gap-4 overflow-y-auto px-4 py-4" @submit.prevent="onSubmit">
          <!-- ВЕРДИКТ И СОВЕТ. Стоит ПЕРВЫМ, до полей: большинство случаев —
               включённый VPN, и человеку выгоднее прочитать это и уйти чинить,
               чем писать заявку. Модалка, которая иногда никого никуда не ведёт,
               и есть хорошая модалка. Текст монохромный: цвет = сигнал, а совет
               сигналом не является. -->
          <div
            v-if="diag && diag.verdict_title"
            data-test="login-issue-verdict"
            class="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5"
          >
            <p class="text-[0.9375rem] font-semibold text-[var(--text)]">{{ diag.verdict_title }}</p>
            <p class="mt-1 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{{ diag.verdict_advice }}</p>
          </div>

          <p class="text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">{{ L.lead }}</p>

          <div>
            <label for="login-issue-message" class="text-[0.875rem] font-medium text-[var(--text-secondary)]">{{ L.label }}</label>
            <textarea
              id="login-issue-message"
              ref="inputRef"
              v-model="message"
              data-test="login-issue-message"
              rows="4"
              required
              :maxlength="MESSAGE_MAX"
              :placeholder="L.placeholder"
              :disabled="sending"
              class="mt-1.5 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[1.0625rem] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--text-muted)] disabled:opacity-60"
            ></textarea>
          </div>

          <div>
            <label for="login-issue-contact" class="text-[0.875rem] font-medium text-[var(--text-secondary)]">
              {{ L.contact_label }}
              <span class="font-normal text-[var(--text-muted)]">— {{ L.contact_note }}</span>
            </label>
            <input
              id="login-issue-contact"
              v-model="contact"
              data-test="login-issue-contact"
              type="text"
              autocomplete="off"
              :maxlength="CONTACT_MAX"
              :placeholder="L.contact_placeholder"
              :disabled="sending"
              class="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[1.0625rem] text-[var(--text)] outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--text-muted)] disabled:opacity-60"
            />
          </div>

          <!-- HONEYPOT. Эндпойнт публичный по построению (ключа у него нет и быть
               не может), поэтому единственная защита от мусора — форма запроса.
               Спрятан от людей и от скринридеров, вне порядка табуляции;
               заполнен — заявку не отправляем и виду не подаём. -->
          <input
            v-model="hp"
            type="text"
            name="company"
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
            class="pointer-events-none absolute h-0 w-0 opacity-0"
          />

          <!-- СПРАВКА. Раскрываемая, не спрятанная: человек имеет право видеть,
               что о нём отправляют, и показать состав дешевле, чем объяснять его. -->
          <div class="rounded-xl border border-[var(--line)]">
            <button
              type="button"
              data-test="login-issue-diag-toggle"
              class="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-[0.875rem] text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)]"
              :aria-expanded="showDiag ? 'true' : 'false'"
              @click="showDiag = !showDiag"
            >
              <span>{{ collecting ? L.diag_collecting : L.diag_toggle }}</span>
              <ChevronUp v-if="showDiag" class="h-4 w-4 shrink-0" :stroke-width="2" aria-hidden="true" />
              <ChevronDown v-else class="h-4 w-4 shrink-0" :stroke-width="2" aria-hidden="true" />
            </button>
            <dl v-if="showDiag" data-test="login-issue-diag" class="border-t border-[var(--line)] px-3 py-2.5">
              <div v-for="row in diagRows" :key="row[0]" class="flex justify-between gap-3 py-1 text-[0.8125rem]">
                <dt class="text-[var(--text-secondary)]">{{ row[0] }}</dt>
                <dd class="text-right text-[var(--text)]">{{ row[1] }}</dd>
              </div>
              <p class="mt-2 text-[0.8125rem] text-[var(--text-secondary)]">{{ L.diag_note }}</p>
            </dl>
          </div>

          <button
            type="submit"
            data-test="login-issue-submit"
            :disabled="sending || !message.trim()"
            class="min-h-[48px] w-full rounded-xl bg-[var(--accent)] px-4 text-[1.0625rem] font-bold text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
          >{{ sending ? L.sending : L.submit }}</button>
        </form>
      </div>
    </div>
  </Teleport>
</template>
