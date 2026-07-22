<script setup>
import { computed } from 'vue'
import { sigClass } from '../../composables/dailyModel.js'
import { SIG_VAR, GOAL_STATE, L, DOW_FULL, DOW_SHORT, ddmm, rubWhole, pctWhole } from '../../i18n/daily.js'

// Полоса A (v3): «Как идёт день» — авто-интерпретация из dailyModel (план дня,
// неделя, goalState). Живёт всегда, даже если сигналов в payload нет. Все числа
// live; тексты монохромные, цвет — только в точках-индикаторах (DESIGN-STANDARD).
// `now` инъектируется в тестах; в проде — new Date(), набор = текущий месяц.
const props = defineProps({
  m: { type: Object, required: true },
  now: { type: Date, default: null },
})

const isoOf = (d) => {
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}
const dowOf = (d) => ((d.getDay() + 6) % 7) + 1 // 1=Пн..7=Вс

const lines = computed(() => {
  const m = props.m || {}
  const out = []
  const now = props.now || new Date()
  const nowDow = dowOf(now)
  const todayIso = isoOf(now)
  const byIso = {}
  ;(m.days || []).forEach((d) => { byIso[d.iso] = d })

  // 1) Вчера — только если вчерашний день в месяце набора (1-е число / стык — скрыть)
  const y = new Date(now); y.setDate(now.getDate() - 1)
  const yDay = byIso[isoOf(y)]
  if (now.getDate() !== 1 && yDay) {
    if (yDay.full) {
      const ratio = yDay.plan ? yDay.fact / yDay.plan : null
      out.push({ text: `Вчера, ${DOW_SHORT[yDay.dow - 1]} ${ddmm(yDay.iso)}: ${rubWhole(yDay.fact)} — ${pctWhole(ratio)} плана дня.`, dot: SIG_VAR[sigClass(ratio)] })
    } else {
      out.push({ text: 'Вчера: отчёт ещё не внесён.', dot: null })
    }
  }

  // 2) Неделя — по полным дням текущей Пн–Вс недели в пределах месяца
  const monday = new Date(now); monday.setDate(now.getDate() - (nowDow - 1))
  const weekInMonth = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const di = byIso[isoOf(d)]
    if (di) weekInMonth.push(di)
  }
  const elapsedFull = weekInMonth.filter((d) => d.full && d.iso < todayIso)
  if (elapsedFull.length) {
    const f = elapsedFull.reduce((a, d) => a + d.fact, 0)
    const p = elapsedFull.reduce((a, d) => a + d.plan, 0)
    const ratio = p ? f / p : null
    out.push({ text: `Неделя: ${nowDow}-й день, ${pctWhole(ratio)} плана с начала недели.`, dot: SIG_VAR[sigClass(ratio)] })
  } else {
    const wPlan = weekInMonth.reduce((a, d) => a + d.plan, 0)
    out.push({ text: `Неделя началась: план — ${rubWhole(wPlan)}.`, dot: null })
  }

  // 3) Месяц — по goalState (тексты согласованы с hero D-16). % при out НЕ показываем.
  const gs = m.goalState
  if (gs === 'record') {
    const X = m.impliedBase > 0 ? Math.round((m.adjBase / m.impliedBase - 1) * 100) : null
    out.push({ text: `Месяц: нужен темп +${X}% к обычному — такие дни парк уже показывал.`, dot: GOAL_STATE.record.dot })
  } else if (gs === 'out') {
    out.push({ text: 'Месяц: фокус — минимум отставания; ближайшая цель — 100% плана недели.', dot: GOAL_STATE.out.dot })
  } else {
    out.push({ text: 'Месяц: цель достижима — держим обычный темп.', dot: GOAL_STATE.ok.dot })
  }

  // 4) Сегодня — доля дня в недельном плане по коэффициентам dow
  const coefs = (m.coefRows || []).map((r) => r.coef || 0)
  const sumC = coefs.reduce((a, b) => a + b, 0)
  const K = sumC ? Math.round((coefs[nowDow - 1] / sumC) * 100) : 0
  let t = `Сегодня ${DOW_FULL[nowDow - 1]} — ${K}% недельного плана.`
  if (K >= 20) t += ' Ключевой день.'
  out.push({ text: t, dot: null })

  return out
})
</script>

<template>
  <section class="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <h2 class="text-[1rem] font-semibold text-[var(--text)]">{{ L.day_title }}</h2>
    <ul class="mt-2 flex flex-col gap-1.5">
      <li v-for="(ln, i) in lines" :key="i" data-test="day-line" class="flex items-start gap-2">
        <span v-if="ln.dot" class="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" :style="{ background: ln.dot }" />
        <span v-else class="mt-1.5 inline-block h-2 w-2 shrink-0" aria-hidden="true" />
        <span class="text-[0.875rem] leading-snug text-[var(--text)]">{{ ln.text }}</span>
      </li>
    </ul>
  </section>
</template>
