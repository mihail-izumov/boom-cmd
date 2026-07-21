<script setup>
import { ref } from 'vue'
import NavigationBar from '../NavigationBar.vue'
import DailyReportScreen from '../../screens/DailyReportScreen.vue'

// Оболочка режима «репортёра» (D-12 §9, вариант A): вход по отдельной фразе
// управляющего открывает ТОЛЬКО «Отчёт дня». Ни таб-бара, ни других экранов,
// ни одного data-запроса к цифрам сети — цифры Мастерплана репортёру не видны.
// Механика скролла/large-title — как в AppShell (порог 28px).

const scrollEl = ref(null)
const collapsed = ref(false)
const COLLAPSE_AT = 28

function onScroll(e) {
  collapsed.value = e.target.scrollTop > COLLAPSE_AT
}
</script>

<template>
  <div
    class="mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[var(--bg)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:border-x md:border-[var(--line)]"
  >
    <div
      ref="scrollEl"
      class="relative flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[env(safe-area-inset-bottom)]"
      @scroll="onScroll"
    >
      <NavigationBar title="Отчёт Дня" eyebrow="БУМБАСТИК" :collapsed="collapsed" />
      <DailyReportScreen />
    </div>
  </div>
</template>
