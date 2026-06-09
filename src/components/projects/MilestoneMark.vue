<script setup>
// Метка вехи (item.type === 'milestone') — Diamond цвета --text-muted перед заголовком.
// Тонкое монохромное напоминание, что это контрольная точка, а не обычная задача.
import { Diamond } from 'lucide-vue-next'
</script>

<template>
  <Diamond
    class="inline-block shrink-0 text-[var(--text-muted)]"
    :stroke-width="2"
    aria-label="Веха"
    style="width: 12px; height: 12px"
  />
</template>
