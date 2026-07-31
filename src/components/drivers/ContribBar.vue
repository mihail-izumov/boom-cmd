<script setup>
import { computed } from 'vue'

// Полоса из двух-трёх сегментов для экрана «Вклад в план».
//
// DESIGN-STANDARD §7.5 (ЧИТАЕМОСТЬ ГРАНИЦЫ — КОНТРАСТОМ, НЕ ГЕОМЕТРИЕЙ). Контрасты
// ПОСЧИТАНЫ по формуле WCAG (scripts/verify-contrib.mjs, блок «контраст»), не взяты
// по памяти:
//   --accent #FFC833 против нейтрали сегмента #E6E5DF — 1,23:1
//   --positive против --accent — 2,21:1
// Обе пары НИЖЕ порога 3:1 для графики: заливки математически точные и при этом
// почти неразличимые по яркости. Стандарт лечит это МЕТКОЙ НА ГРАНИЦЕ, а не подбором
// оттенка, поэтому на каждом внутреннем стыке стоит тёмная риска --text:
//   --text на --accent — 11,12:1 · --text на нейтрали — 13,64:1
// Плюс нейтральный сегмент несёт ШТРИХОВКУ --text-muted (4,10:1 на своей подложке):
// та же идиома, что у зоны недобора в MonthProgressSlide — роль кодируется формой
// (§7.1), а не только цветом, иначе полоса нечитаема в ч/б и при дальтонизме.
//
// Тонкая полоса (compact) — в строках списков, где ЧИСЛО СТОИТ РЯДОМ ТЕКСТОМ, и
// полоса лишь дублирует его глазом. Штриховки там нет (на высоте 8 px она грязнит),
// но торец меры есть: --accent на треке --surface-2 даёт 1,36:1 (ровно тот случай,
// который §7.5 приводит как пример), и без тёмного торца конец заливки не читается.
//
// §7.4: скругление — только у трека снаружи, внутренние стыки прямые.

const props = defineProps({
  // [{ key, pct, kind: 'accent' | 'neutral' | 'positive' }] — слева направо.
  segments: { type: Array, default: () => [] },
  // Подпись для скринридера: полоса — картинка, число дублируется в легенде.
  label: { type: String, default: '' },
  // Тонкая полоса для строк-списков (парки, драйверы) без риски и штриховки.
  compact: { type: Boolean, default: false },
})

// Штриховка нейтрального сегмента — токены, без нового hex (приём узаконен §6.2).
const HATCH = 'repeating-linear-gradient(-45deg, transparent 0 2px, var(--text-muted) 2px 3px)'
const NEUTRAL_BG = 'color-mix(in srgb, var(--line) 75%, var(--surface-2))'

const shown = computed(() => props.segments.filter((s) => s && s.pct > 0))

// Крупная полоса: риска СЛЕВА у каждого сегмента, кроме первого — она и есть граница.
// Тонкая: торец СПРАВА у заливки, если до конца трека ещё есть место (при 100 %
// торец совпал бы со скруглённым краем и читался бы как обрезка).
function edge(s, i) {
  if (!props.compact) return i > 0 ? { boxShadow: 'inset 2px 0 0 0 var(--text)' } : {}
  return s.kind === 'accent' && s.pct < 99.5 ? { boxShadow: 'inset -2px 0 0 0 var(--text)' } : {}
}

function fill(kind) {
  if (kind === 'accent') return { backgroundColor: 'var(--accent)' }
  if (kind === 'positive') return { backgroundColor: 'var(--positive)' }
  return props.compact
    ? { backgroundColor: NEUTRAL_BG }
    : { backgroundColor: NEUTRAL_BG, backgroundImage: HATCH }
}
</script>

<template>
  <div
    class="flex overflow-hidden rounded-full bg-[var(--surface-2)]"
    :class="compact ? 'h-2' : 'h-3.5'"
    role="img"
    :aria-label="label"
  >
    <i
      v-for="(s, i) in shown"
      :key="s.key"
      data-test="seg"
      :data-kind="s.kind"
      class="block h-full"
      :style="{
        width: `${s.pct}%`,
        ...fill(s.kind),
        // Риска на стыке (крупная полоса) / торец меры (тонкая): граница обязана
        // читаться сама по себе, независимо от того, различимы ли заливки.
        ...edge(s, i),
      }"
    />
  </div>
</template>
