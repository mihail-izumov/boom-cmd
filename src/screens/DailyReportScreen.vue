<script setup>
import { computed, reactive, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import ReportField from '../components/report/ReportField.vue'
import { useReport } from '../composables/useReport.js'
import {
  REPORT_PARK_IDS, emptyForm, fieldGroupsFor, numericFieldsFor, derived,
  todayISO, validate, buildPayload, softWarnings,
} from '../composables/reportModel.js'
import { PARKS_BY_ID } from '../data/parks.js'
import {
  L, FIELD_LABELS, SECTION_TITLES, WEATHER_OPTIONS, WEEKLY_NOTE,
  checksIntroFor, hintFor, tipFor, summaryValue, summaryLabelFor, softWarnMessage,
  sumMismatch, dateHuman,
} from '../i18n/report.js'

// «Отчёт дня» v2 (D-12) — ЕДИНСТВЕННАЯ пишущая страница фронта: форма → POST →
// Apps Script doPost → строка в лист `inbox` дневной таблицы. Канон не читается
// и не пишется. Дата по умолчанию — ВЧЕРА; будущие запрещены; не-вчера —
// жёлтая плашка (не блокирует). Форма — смысловые карты (ТЗ v2 §1): Деньги /
// Игроки / Чеки / День + живая сводка «Проверь себя» (§5, в payload не уходит).
// Валидация §2–3 блокирует отправку; тап «Отправить» с ошибками — плавный
// скролл к первому проблемному полю (визарда нет — один экран для рутины).
// Ошибка сети — красная плашка, данные формы НЕ теряются.

const { sending, sent, sendError, sendHint, attempt, submit, resetSent } = useReport()

const form = reactive(emptyForm())
const sentDate = ref('') // дата успешно отправленного отчёта (для экрана успеха)

const parks = REPORT_PARK_IDS.map((id) => ({ id, name: PARKS_BY_ID[id]?.name || id }))
const todayMax = todayISO()

const v = computed(() => validate(form))
const groups = computed(() => fieldGroupsFor(form.park))
const fields = computed(() => numericFieldsFor(form.park))
// строки про выгрузку — только Охта/Питерленд (ТЗ v2 §3 + v2.2 §2): тихая
// недельная сверка и вводная строка карты «Чеки»; у Июня выгрузки нет.
const showWeeklyNote = computed(() => form.park === 'ohta' || form.park === 'piterland')
// вводная строка карты «Чеки»: Охта/Питер — «три числа»; Июнь — «оба числа» (v2.3 §2)
const checksIntro = computed(() => checksIntroFor(form.park))

// живая сводка производных (ТЗ v2 §5): порядок плиток — как в ТЗ; пустые/÷0 —
// не показываются. У Июня revenue÷topups показывается как «Ср. пополнение» (v2.3 §3),
// а дубль «Чек / пополнение» (per_topup, тот же revenue÷topups) прячем.
const SUMMARY_ORDER = ['avg_check', 'per_topup', 'topups_per_session', 'cash_share', 'site_share', 'new_share']
const summaryTiles = computed(() => {
  const d = derived(form)
  return SUMMARY_ORDER
    .filter((k) => !(form.park === 'iyun' && k === 'per_topup'))
    .filter((k) => d[k] != null)
    .map((k) => ({ key: k, label: summaryLabelFor(form.park, k), value: summaryValue(k, d[k]) }))
})

// подсветка инпутов, участвующих в ошибках пар/сумм
function isInvalid(key) {
  const e = v.value.errors
  if (e.sum && (key === 'revenue' || key === 'cashless' || key === 'cash' || key === 'site')) return true
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

// мягкие предупреждения (v2.3 §4) — не блокируют отправку (v.ok их не учитывает)
const warnMessages = computed(() => softWarnings(form).map(softWarnMessage))

// первое проблемное поле в порядке рендера (для скролла по тапу «Отправить»)
function firstProblemId() {
  const val = v.value
  if (val.errors.date_future) return 'rep-date'
  for (const f of fields.value) {
    if (val.missing.includes(f.key) || isInvalid(f.key)) return `rep-${f.key}`
  }
  if (val.missing.includes('weather')) return 'rep-weather'
  return null
}
function scrollToProblem() {
  const id = firstProblemId()
  const el = id && document.getElementById(id)
  if (!el) return
  el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  el.focus?.({ preventScroll: true })
}

async function onSubmit() {
  if (sending.value) return
  if (!v.value.ok) { scrollToProblem(); return } // ТЗ v2 §1
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

        <!-- v2.1 §3: без border-t — поля разделяются отступом, как во всех картах.
             ⚠ `input[type=date]` в Safari на iOS имеет СВОЮ внутреннюю ширину и
             игнорирует `w-full`, пока не снят нативный вид: поле вылезало за правый
             край белой карточки, а текст в нём вставал по центру. Лечится связкой
             `appearance-none` + `min-w-0` + `block` (тот же приём, что у select выше).
             Проверять после любой правки этих классов — баг чисто мобильный, на
             десктопе и в jsdom не воспроизводится. -->
        <div class="py-2.5">
          <label for="rep-date" class="text-[0.875rem] font-medium text-[var(--text-secondary)]">{{ L.date_label }}</label>
          <input
            id="rep-date"
            v-model="form.date"
            type="date"
            :max="todayMax"
            class="mt-1.5 block w-full min-w-0 min-h-[44px] appearance-none rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-left text-[1.0625rem] text-[var(--text)] outline-none"
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

      <!-- смысловые карты (ТЗ v2 §1): Деньги / Игроки / Чеки; поля — только отступы -->
      <template v-if="form.park">
        <template v-for="g in groups" :key="g.section">
          <section class="bc-fade-in rounded-2xl bg-[var(--surface)] px-4 pb-1.5 pt-3 shadow-sm">
            <h2 class="text-[0.875rem] font-semibold text-[var(--text-secondary)]">{{ SECTION_TITLES[g.section] }}</h2>
            <!-- вводная строка карты «Чеки»: Охта/Питер (v2.2 §2) и Июнь (v2.3 §2) -->
            <p
              v-if="g.section === 'checks' && checksIntro"
              class="mt-1 text-[0.8125rem] leading-snug text-[var(--text-secondary)]"
            >{{ checksIntro }}</p>
            <ReportField
              v-for="f in g.fields"
              :id="`rep-${f.key}`"
              :key="f.key"
              v-model="form[f.key]"
              :label="FIELD_LABELS[f.key]"
              :tip="tipFor(form.park, f.key)"
              :hint="hintFor(form.park, f.key)"
              :optional="!f.required"
              :invalid="isInvalid(f.key)"
            />
          </section>

          <!-- тихая строка под картой «Чеки» — недельная контрольная сверка (§3) -->
          <p
            v-if="g.section === 'checks' && showWeeklyNote"
            class="bc-fade-in px-4 text-[0.75rem] leading-relaxed text-[var(--text-muted)]"
          >{{ WEEKLY_NOTE }}</p>
        </template>

        <!-- карта «День»: погода + комментарий -->
        <section class="bc-fade-in rounded-2xl bg-[var(--surface)] px-4 pb-1.5 pt-3 shadow-sm">
          <h2 class="text-[0.875rem] font-semibold text-[var(--text-secondary)]">{{ SECTION_TITLES.day }}</h2>
          <ReportField id="rep-weather" :label="FIELD_LABELS.weather" :tip="tipFor(form.park, 'weather')">
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

          <ReportField id="rep-comment" :label="FIELD_LABELS.comment" :tip="tipFor(form.park, 'comment')" optional>
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
        </section>

        <!-- живая сводка «Проверь себя» (§5): серые плитки, в payload не уходит -->
        <section
          v-if="summaryTiles.length"
          class="bc-fade-in rounded-2xl bg-[var(--surface)] px-4 pb-4 pt-3 shadow-sm"
        >
          <h2 class="text-[0.875rem] font-semibold text-[var(--text-secondary)]">{{ SECTION_TITLES.summary }}</h2>
          <div class="mt-2.5 grid grid-cols-2 gap-2">
            <div
              v-for="t in summaryTiles"
              :key="t.key"
              class="rounded-xl bg-[var(--surface-2)] px-3 py-2.5"
            >
              <p class="text-[0.75rem] font-medium text-[var(--text-secondary)]">{{ t.label }}</p>
              <p class="mt-0.5 text-[1.125rem] font-semibold tabular-nums text-[var(--text)]">{{ t.value }}</p>
            </div>
          </div>
        </section>
      </template>

      <!-- живая валидация: блокирующие сообщения -->
      <div
        v-if="errorMessages.length"
        class="flex flex-col gap-1.5 rounded-2xl px-4 py-3 text-[0.875rem] font-medium leading-snug text-[var(--text)]"
        style="background: color-mix(in srgb, var(--negative) 10%, var(--surface))"
        role="alert"
      >
        <p v-for="(m, i) in errorMessages" :key="i">{{ m }}</p>
      </div>

      <!-- мягкие предупреждения (v2.3 §4): жёлтая строка, НЕ блокирует отправку -->
      <div
        v-if="warnMessages.length"
        class="flex flex-col gap-1.5 rounded-2xl px-4 py-3 text-[0.875rem] font-medium leading-snug text-[var(--text)]"
        style="background: color-mix(in srgb, var(--warning) 24%, var(--surface))"
        role="status"
      >
        <p v-for="(m, i) in warnMessages" :key="i">{{ m }}</p>
      </div>

      <!-- ошибка сети/бэка: данные формы не потеряны -->
      <div
        v-if="sendError"
        class="rounded-2xl bg-[var(--negative)] px-4 py-3 text-[0.9375rem] font-medium leading-snug text-[var(--ink-on-color)]"
        role="alert"
      >
        {{ L.send_error }}
        <!-- Подсказка «что делать» — только при транспортной осечке (05.08).
             Внутри плашки, на том же фоне: отдельная карточка увела бы взгляд
             от главного, а совет без контекста ошибки читается как реклама. -->
        <p
          v-if="sendHint"
          data-test="report-send-hint"
          class="mt-1.5 text-[0.875rem] font-normal leading-snug"
        >{{ sendHint }}</p>
      </div>

      <!-- отправить: при ошибках тап скроллит к первому проблемному полю (§1) -->
      <button
        v-if="form.park"
        type="submit"
        class="min-h-[52px] w-full rounded-2xl text-[1.0625rem] font-semibold transition-opacity"
        :class="v.ok && !sending
          ? 'bg-[var(--accent)] text-[var(--accent-ink)] active:opacity-90'
          : 'bg-[var(--surface-2)] text-[var(--text-muted)]'"
        :disabled="sending"
        :aria-disabled="!v.ok || sending ? 'true' : 'false'"
      >{{ sending ? (attempt > 1 ? L.sending_retry : L.sending) : L.submit }}</button>
    </form>
  </section>
</template>
