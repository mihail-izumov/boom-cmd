<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import {
  sortSignals, latestSignal, feedSignals, signalDot, signalTint,
  statusOf, markState, loadReadStore, saveReadStore,
  readFor, isMarkable, scoreOf,
} from '../../composables/dailySignals.js'
import { useSignalRead } from '../../composables/useSignalRead.js'
import { L, ddmm } from '../../i18n/daily.js'
import DailyDayProgress from './DailyDayProgress.vue'
import SignalRateSheet from './SignalRateSheet.vue'
import SignalMarkButton from './SignalMarkButton.vue'

// «Сигнал Дня» + «Как идёт день» в ОДНОЙ окрашенной карточке, «Ранее» — отдельным
// блоком под ней. ТОЛЬКО рендерит payload (ТЗ §5); текст монохромный.
//
// ЧТО ИЗМЕНИЛОСЬ (2026-08-06, жалоба управляющих «прилистываем и не замечаем»):
//   • карточка окрашивается в тон статуса дня (`signalTint` — тот же приём, что у
//     мини-карт сети в DailyNetwork, 12 % токена на `--surface`);
//   • «Как идёт день» поднят НАВЕРХ, сразу под разбор и кнопку отметки: обе полосы
//     отвечают на один вопрос «что сегодня», и разрывать их лентой прошлых дней
//     было нечем;
//   • **«Ранее» выехало из карточки отдельным блоком.** Это не вкусовщина: цвет
//     карточки = статус СЕГОДНЯШНЕГО сигнала, а у прошлых дней свои статусы —
//     внутри окрашенной карточки лента наследовала бы чужой цвет и врала.
//
// ⚠ Цена ежедневной окраски (решение владельца, зафиксировано): цвет каждый день
// = привыкание. Через две-три недели стоит проверить, не начали ли прилистывать
// снова; альтернатива — красить только при статусе ≠ ok.
//
// ЧТО ИЗМЕНИЛОСЬ (2026-08-04):
//   • отметить можно ЛЮБОЙ сигнал в окне 14 дней, а не только самый свежий. Раньше
//     кнопка была одна, и всё, что уезжало в ленту, становилось неотмечаемым навсегда;
//   • пул сигналов приходит СКВОЗЬ границу месяца (prop `signals`) — иначе 01.08
//     сигнал за 31.07 исчезал вместе с возможностью его отметить;
//   • прочтение и оценка развязаны: закрытие модалки больше не отменяет прочтение.
//
// ЧТО ИЗМЕНИЛОСЬ (2026-08-15, NET-61): отметка и оценка снова ОДИН шаг. Две кнопки,
// стоявшие тут с 04.08, теряли второй шаг — доля отметок с оценкой упала с 84 % до
// 58 % (замер по времени нажатия относительно релиза 04.08 17:04 МСК). Теперь на
// карточке одна кнопка, она открывает шкалу, подтверждение шлёт обе величины одним
// запросом, а отказ от оценки живёт внутри шкалы и прочтение не отменяет.
const props = defineProps({
  m: { type: Object, required: true },
  now: { type: Date, default: null },
  // Проекция payload.signal_reads — что бэк уже записал. Канон прочтения: переживает
  // перезагрузку, чистку кэша и смену устройства. С 04.08 бэк отдаёт строку на КАЖДУЮ
  // пару (парк, день) за 45 дней, а не одну на парк, — иначе лента врала бы на всех
  // днях, кроме последнего.
  reads: { type: Array, default: () => [] },
  // Пул сигналов окна + выбранного месяца (собирает DailyScreen через collectSignals).
  // Не передан → живём внутри одного набора парк:месяц, как раньше.
  signals: { type: Array, default: null },
})

const park = computed(() => (props.m && props.m.park) || '')
const pool = computed(() =>
  sortSignals(props.signals && props.signals.length ? props.signals : (props.m && props.m.signals) || []),
)
const latest = computed(() => latestSignal(pool.value))
const feed = computed(() => feedSignals(pool.value))

// Статусы на устройстве. Снимок «новизны» — на момент setup (ДО записи viewed):
// бейдж «новое» живёт весь заход, снят в следующий (ТЗ §2).
const store = ref(loadReadStore())
const snapshot = { ...store.value }
const feedOpen = ref(false)
const openRows = ref({})
const { statusOf: sendState, enqueue, echoScoreOf } = useSignalRead()

const headDate = computed(() => (latest.value ? ddmm(latest.value.date) : ''))
const localStatus = (date) => statusOf(store.value, park.value, date)
const localRead = (date) => localStatus(date) === 'read'

// Отмечено = бэк ИЛИ устройство ИЛИ подтверждение этой сессии.
function isDone(date) {
  const s = sendState(park.value, date)
  return !!readFor(props.reads, park.value, date) || localRead(date) || s === 'done' || s === 'score-debt'
}
const latestDone = computed(() => !!latest.value && isDone(latest.value.date))
const latestNew = computed(
  () => !!latest.value && statusOf(snapshot, park.value, latest.value.date) === 'none',
)

function persist(date, state) {
  markState(store.value, park.value, date, state)
  saveReadStore(store.value)
  store.value = { ...store.value }
}
onMounted(() => {
  if (latest.value && localStatus(latest.value.date) === 'none') persist(latest.value.date, 'viewed')
})

// ── ОДИН ШАГ (NET-61) ────────────────────────────────────────────────────────
// Нажатие на карточке открывает шкалу; подтверждение отправляет прочтение и оценку
// ОДНИМ запросом (бэк на любой signal_read пишет и прочтение тоже, appendRead_ +
// appendScore_ в одной ветке). Никакого второго действия на карточке не появляется.
//
// ⚠ ЛЮБОЕ закрытие шкалы записывает прочтение — и крестик, и тап по фону. Это не
// небрежность, а требование §2.1: отметка не должна становиться заложником оценки.
// Человек открыл разбор и увидел шкалу — контакт состоялся, а read_at всё равно
// фиксирует ПЕРВОЕ нажатие и не перезаписывается. Оценка при этом не отправляется
// вовсе: поля score в теле нет, строки в signal_scores не появляется — ноль сюда
// попасть не может.
//
// Отдельной кнопки «отказаться» на этом пути нет намеренно (решение владельца 15.08):
// она дублировала крестик и работала как приглашение пропустить оценку. Выход есть,
// но он не рекламируется.
const rateOpen = ref(false)
const rateDate = ref('')
// ⚠ Через scoreOf, и только через него: `Number(entry.score)` здесь превращал `null`
// в 0, шкала открывалась на нуле уже готовой к отправке, и одно нажатие записывало
// ноль, которого никто не ставил (NET-62). Никогда не возвращать приведение сюда.
const rateInitial = computed(() => {
  const echoed = echoScoreOf(park.value, rateDate.value)
  return echoed !== null ? echoed : scoreOf(readFor(props.reads, park.value, rateDate.value))
})
function onRate(date) {
  if (!date || !isMarkable(date, props.now || new Date())) return
  rateDate.value = date
  rateOpen.value = true
}
// Локальный статус 'read' нигде здесь НЕ пишем: он ставится только по подтверждению
// бэка (useSignalRead.confirm_). Иначе упавший запрос оставит человека с «Прочитано ✓»
// на экране и пустотой в контуре B — то есть ровно с исходной жалобой.
function onRateSubmit(score) {
  if (!rateDate.value) return
  enqueue({ park: park.value, signal_date: rateDate.value, score })
  rateOpen.value = false
}
// Закрытие без оценки: прочтение уходит, score не трогаем (undefined ≠ 0).
function onRateClose() {
  const date = rateDate.value
  rateOpen.value = false
  if (!date || isDone(date) || !isMarkable(date, props.now || new Date())) return
  enqueue({ park: park.value, signal_date: date })
}

function toggleFeed() { feedOpen.value = !feedOpen.value }
function toggleRow(date) {
  openRows.value = { ...openRows.value, [date]: !openRows.value[date] }
  if (localStatus(date) === 'none') persist(date, 'viewed') // tap снимает «новое»
}
function rowMarker(date) {
  if (isDone(date)) return 'read'
  return localStatus(date) === 'none' ? 'new' : 'open'
}

// Заливка и граница карточки — от статуса свежего сигнала. Сигнала нет → карточка
// обычная белая: красить нечем, а серый тон читался бы как «статус “никакой”».
const cardTint = computed(() => (latest.value ? signalTint(latest.value.status) : ''))
const cardEdge = computed(() =>
  latest.value ? `color-mix(in srgb, ${signalDot(latest.value.status)} 30%, var(--line))` : '',
)
</script>

<template>
  <div class="flex flex-col gap-3">
  <!-- ═══ Сегодня: разбор + «Как идёт день», окрашено по статусу дня ═══ -->
  <article
    data-test="signal-card"
    :data-status="latest ? latest.status : ''"
    class="rounded-2xl border p-4"
    :class="latest ? '' : 'border-[var(--line)] bg-[var(--surface)]'"
    :style="latest ? { background: cardTint, borderColor: cardEdge } : null"
  >
    <!-- Шапка. Заголовок стоит ОТДЕЛЬНОЙ строкой по центру (правка владельца 06.08):
         раньше он делил строку с бейджем и датой, и на узком экране «Сигнал Дня»
         переносился на два слова — ровно то, что бросилось в глаза на превью.
         Теперь строка заголовка не делится ни с чем и переноситься нечему. -->
    <h2 data-test="signal-title" class="text-center text-[1.125rem] font-bold leading-tight text-[var(--text)]">{{ L.signal_title }}</h2>
    <div v-if="latest" class="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <!-- на цветной подложке --text-muted падает до 4,32:1 (focus) — ниже порога,
           поэтому здесь на тон темнее: --text-secondary даёт 8,2:1 -->
      <span class="text-[0.75rem] text-[var(--text-secondary)]">{{ L.signal_by }} {{ headDate }}</span>
      <!-- Бейдж «новое» тёмный, а не жёлтый: на карточке статуса warn жёлтое на
           бледно-жёлтом пропадает (граница 1,46:1). Чёрный бедж — принятая в
           проекте идиома (активный парк-фильтр), контраст 14–16:1 на любом тоне. -->
      <span v-if="latestNew && !latestDone" class="rounded-full bg-[var(--text)] px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--ink-on-color)]">{{ L.signal_new }}</span>
    </div>

    <template v-if="latest">
      <div class="mt-2 flex items-start gap-2">
        <span class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: signalDot(latest.status) }" />
        <div class="min-w-0">
          <p class="text-[0.9375rem] font-semibold leading-snug text-[var(--text)]">{{ latest.headline }}</p>
          <p v-if="latest.action" class="mt-1 text-[0.875rem] leading-snug text-[var(--text-secondary)]">{{ latest.action }}</p>
        </div>
      </div>

      <div class="mt-3">
        <SignalMarkButton
          :park="park" :date="latest.date" :reads="reads"
          :local-read="localRead(latest.date)" :now="now"
          @rate="onRate"
        />
      </div>

      <SignalRateSheet
        :open="rateOpen" :initial="rateInitial"
        @close="onRateClose" @submit="onRateSubmit"
      />
    </template>

    <!-- нет сигнала: аналитик ещё не оставил разбор -->
    <p v-else class="mt-2 text-[0.875rem] leading-snug text-[var(--text-muted)]">{{ L.signal_empty }}</p>

    <!-- «Как идёт день» — сразу под разбором: обе полосы отвечают на «что сегодня».
         Черты-разделителя нет (правка владельца 06.08): карточку и так держит
         заливка, а линия внутри цветного блока дробила его на две части. -->
    <div class="mt-3.5">
      <DailyDayProgress :m="m" :now="now" />
    </div>
  </article>

  <!-- ═══ «Ранее» — ОТДЕЛЬНЫЙ блок, намеренно НЕ окрашен ═══
       Цвет карточки выше = статус сегодняшнего сигнала. У прошлых дней свои
       статусы, и внутри окрашенной карточки лента наследовала бы чужой цвет —
       то есть врала бы. Здесь статус каждого дня несёт своя точка в строке. -->
  <article v-if="latest && feed.length" data-test="signal-feed" class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4">
        <button
          type="button"
          data-test="signal-feed-toggle"
          class="flex w-full items-center justify-between gap-2 text-left text-[0.8125rem] font-medium text-[var(--text-secondary)]"
          style="min-height: 44px"
          :aria-expanded="feedOpen ? 'true' : 'false'"
          @click="toggleFeed"
        >
          <span>{{ L.signal_feed }}</span>
          <ChevronDown class="h-4 w-4 shrink-0 transition-transform" :class="feedOpen ? 'rotate-180' : ''" aria-hidden="true" />
        </button>
        <ul v-if="feedOpen" class="flex flex-col border-t border-[var(--line)]">
          <li v-for="s in feed" :key="s.date" data-test="signal-feed-row" class="border-t border-[var(--line)] first:border-t-0">
            <!-- Раскрытие строки и отметка — РАЗНЫЕ элементы: вложенный <button>
                 внутри <button> невалиден, а тач-таргеты обоих должны быть ≥44pt (HIG). -->
            <button type="button" class="flex w-full items-start gap-2 py-2 text-left" style="min-height: 44px" @click="toggleRow(s.date)">
              <span class="w-[2.6rem] shrink-0 pt-0.5 text-[0.75rem] tabular-nums text-[var(--text-muted)]">{{ ddmm(s.date) }}</span>
              <span class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: signalDot(s.status) }" />
              <span class="min-w-0 flex-1 text-[0.8125rem] leading-snug text-[var(--text)]">{{ s.headline }}</span>
              <span class="shrink-0 pt-0.5">
                <span v-if="rowMarker(s.date) === 'new'" class="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[0.5625rem] font-semibold text-[var(--accent-ink)]">{{ L.signal_new }}</span>
                <span v-else-if="rowMarker(s.date) === 'read'" class="text-[0.75rem] text-[var(--text-muted)]" aria-label="прочитано">✓</span>
              </span>
            </button>
            <div v-if="openRows[s.date]" class="pb-3 pl-[3.1rem] pr-1">
              <p v-if="s.action" class="text-[0.8125rem] leading-snug text-[var(--text-secondary)]">{{ s.action }}</p>
              <!-- Та же кнопка, что у свежего сигнала: именно её отсутствие здесь и
                   делало пропущенные дни неотмечаемыми навсегда. Дата отмечаемого
                   сигнала — слева в строке, поэтому в кнопке её не дублируем. -->
              <div class="mt-2">
                <SignalMarkButton
                  :park="park" :date="s.date" :reads="reads"
                  :local-read="localRead(s.date)" :now="now"
                  @rate="onRate"
                />
              </div>
            </div>
          </li>
        </ul>
  </article>
  </div>
</template>
