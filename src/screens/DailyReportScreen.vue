<script setup>
import { computed, reactive, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import ReportField from '../components/report/ReportField.vue'
import { useReport } from '../composables/useReport.js'
import {
  REPORT_PARK_IDS, emptyForm, numericFieldsFor, todayISO, validate, buildPayload,
} from '../composables/reportModel.js'
import { PARKS_BY_ID } from '../data/parks.js'
import {
  L, TIPS, FIELD_LABELS, WEATHER_OPTIONS, UPLOAD_REMINDER, sumMismatch, dateHuman,
} from '../i18n/report.js'

// «Отчёт дня» (D-12) — ЕДИНСТВЕННАЯ пишущая страница фронта: форма → POST →
// Apps Script doPost → строка в лист `inbox` дневной таблицы. Канон (daily_days
// и пр.) не читается и не пишется. Дата по умолчанию — ВЧЕРА; будущие запрещены;
// не-вчера — жёлтая плашка (не блокирует). Валидация §4 ТЗ блокирует отправку;
// «Отправить» активна только при зелёной валидации. Ошибка сети — красная
// плашка, данные формы НЕ теряются. Тултипы §5 — дословно (i18n/report.js).

const { sending, sent, sendError, submit, resetSent } = useReport()

const form = reactive(emptyForm())
const sentDate = ref('') // дата успешно отправленного отчёта (для экрана успеха)

const parks = REPORT_PARK_IDS.map((id) => ({ id, name: PARKS_BY_ID[id]?.name || id }))
const todayMax = todayISO()

const v = computed(() => validate(form))
const fields = computed(() => numericFieldsFor(form.park))
const showUploadReminder = computed(() => form.park === 'ohta' || form.park === 'piterland')

// подсветка инпутов, участвующих в ошибках пар/сумм
function isInvalid(key) {
  const e = v.value.errors
  if (e.sum && (key === 'revenue' || key === 'cashless' || key === 'cash')) return true
  if (e.visitors && (key === 'visitors_total' || key === 'visitors_new')) return true
  if (e.sessions && (key === 'topups' || key === 'sessions')) return true
  return false
}

// сообщения валидации (появляются, когда участвующие поля уже заполнены)
const errorMessages = computed(() => {
  const out = []
  const e = v.value.errors
  if (e.date_future) out.push(L.err_date_future)
  if (e.sum && v.value.sum) out.push(sumMismatch(v.value.sum.sum, v.value.sum.revenue))
  if (e.visitors) out.push(L.err_visitors)
  if (e.sessions) out.push(L.err_sessions)
  return out
})

async function onSubmit() {
  if (!v.value.ok || sending.value) return
  const date = form.date
  await submit(buildPayload(form))
  if (sent.value) sentDate.value = date
}

// «Внести ещё»: сброс формы; парк оставляем (управляющий вносит свой парк).
function more() {
  const park = form.park
  Object.assign(form, emptyForm(park))
  resetSent()
}
</script>

<template>
  <section class="flex flex-col px-3 pb-6 pt-1">
    <!-- ═══ экран успеха ═══ -->
    <div
      v-if="sent"
      class="bc-fade-in flex min-h-[52svh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--positive)]">
        <Check class="h-8 w-8 text-[var(--ink-on-color)]" :stroke-width="2.5" aria-hidden="true" />
      </span>
      <p class="text-[1.25rem] font-semibold text-[var(--text)]">
        {{ L.success_title(dateHuman(sentDate)) }}
      </p>
      <button
        type="button"
        class="mt-2 min-h-[48px] rounded-2xl bg-[var(--accent)] px-6 text-[1rem] font-semibold text-[var(--accent-ink)] active:opacity-90"
        @click="more"
      >{{ L.success_more }}</button>
    </div>

    <!-- ═══ форма ═══ -->
    <form v-else class="flex flex-col gap-3" novalidate @submit.prevent="onSubmit">
      <!-- парк + дата -->
      <div class="rounded-2xl bg-[var(--surface)] px-4 py-1.5 shadow-sm">
        <div class="py-2.5">
          <label for="rep-park" class="text-[0.875rem] font-medium text-[var(--text-secondary)]">{{ L.park_label }}</label>
          <div class="relative mt-1.5">
            <select
              id="rep-park"
              v-model="form.park"
              class="w-full min-h-[44px] appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 pr-10 text-[1.0625rem] text-[var(--text)] outline-none focus:border-[var(--text-muted)]"
            >
              <option value="" disabled>{{ L.park_placeholder }}</option>
              <option v-for="p in parks" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
          </div>
        </div>

        <div class="border-t border-[var(--line)] py-2.5">
          <label for="rep-date" class="text-[0.875rem] font-medium text-[var(--text-secondary)]">{{ L.date_label }}</label>
          <input
            id="rep-date"
            v-model="form.date"
            type="date"
            :max="todayMax"
            class="mt-1.5 w-full min-h-[44px] rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-[1.0625rem] text-[var(--text)] outline-none"
            :class="v.errors.date_future ? 'border-[var(--negative)]' : 'border-[var(--line)] focus:border-[var(--text-muted)]'"
          />
          <!-- жёлтая плашка «не за вчера» (не блокирует) — производная от токена, без хардкода hex -->
          <p
            v-if="v.notYesterday"
            class="mt-1.5 rounded-xl px-3 py-2 text-[0.8125rem] font-medium text-[var(--text)]"
            style="background: color-mix(in srgb, var(--warning) 24%, var(--surface))"
          >{{ L.not_yesterday }}</p>
        </div>
      </div>

      <!-- числовые поля парка (после выбора парка) -->
      <div
        v-if="form.park"
        class="bc-fade-in rounded-2xl bg-[var(--surface)] px-4 py-1 shadow-sm divide-y divide-[var(--line)]"
      >
        <ReportField
          v-for="f in fields"
          :id="`rep-${f.key}`"
          :key="f.key"
          v-model="form[f.key]"
          :label="FIELD_LABELS[f.key]"
          :tip="TIPS[f.key] || ''"
          :optional="!f.required"
          :invalid="isInvalid(f.key)"
        />
      </div>

      <!-- погода + комментарий -->
      <div
        v-if="form.park"
        class="bc-fade-in rounded-2xl bg-[var(--surface)] px-4 py-1 shadow-sm divide-y divide-[var(--line)]"
      >
        <ReportField id="rep-weather" :label="FIELD_LABELS.weather" :tip="TIPS.weather">
          <template #control>
            <div class="relative mt-1.5">
              <select
                id="rep-weather"
                v-model="form.weather"
                class="w-full min-h-[44px] appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 pr-10 text-[1.0625rem] outline-none focus:border-[var(--text-muted)]"
                :class="form.weather ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'"
              >
                <option value="" disabled>{{ L.weather_placeholder }}</option>
                <option v-for="w in WEATHER_OPTIONS" :key="w.value" :value="w.value">{{ w.label }}</option>
              </select>
              <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]" :stroke-width="2" aria-hidden="true" />
            </div>
          </template>
        </ReportField>

        <ReportField id="rep-comment" :label="FIELD_LABELS.comment" :tip="TIPS.comment" optional>
          <template #control>
            <textarea
              id="rep-comment"
              v-model="form.comment"
              rows="3"
              :placeholder="L.comment_placeholder"
              class="mt-1.5 w-full min-h-[44px] rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[1.0625rem] text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
            ></textarea>
          </template>
        </ReportField>
      </div>

      <!-- живая валидация: блокирующие сообщения -->
      <div
        v-if="errorMessages.length"
        class="flex flex-col gap-1.5 rounded-2xl px-4 py-3 text-[0.875rem] font-medium leading-snug text-[var(--text)]"
        style="background: color-mix(in srgb, var(--negative) 10%, var(--surface))"
        role="alert"
      >
        <p v-for="(m, i) in errorMessages" :key="i">{{ m }}</p>
      </div>

      <!-- ошибка сети/бэка: данные формы не потеряны -->
      <div
        v-if="sendError"
        class="rounded-2xl bg-[var(--negative)] px-4 py-3 text-[0.9375rem] font-medium leading-snug text-[var(--ink-on-color)]"
        role="alert"
      >{{ L.send_error }}</div>

      <!-- отправить -->
      <button
        v-if="form.park"
        type="submit"
        class="min-h-[52px] w-full rounded-2xl text-[1.0625rem] font-semibold transition-opacity"
        :class="v.ok && !sending
          ? 'bg-[var(--accent)] text-[var(--accent-ink)] active:opacity-90'
          : 'bg-[var(--surface-2)] text-[var(--text-muted)]'"
        :disabled="!v.ok || sending"
      >{{ sending ? L.sending : L.submit }}</button>

      <!-- §5.8: напоминание про выгрузку (Охта / Питерленд) — серый инфо-блок под формой -->
      <p
        v-if="showUploadReminder"
        class="bc-fade-in rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]"
      >{{ UPLOAD_REMINDER }}</p>
    </form>
  </section>
</template>
