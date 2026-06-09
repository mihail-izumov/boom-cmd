# GitHub Copilot — инструкции для `boom-cmd`

Точка входа: `docs/PROJECT-INSTRUCTIONS-boom-cmd.md` (глобальная инструкция
уровня проекта — роль, иерархия истины, протокол ответа; тот же текст —
в Project Instructions Claude-проекта `boom-cmd` на claude.ai). Краткий
контекст для агентов в репо: [`CLAUDE.md`](../CLAUDE.md). Источник истины
по дизайну: `docs/DESIGN-STANDARD-boom-cmd.md` (локально).

- Стек: Vue 3 `<script setup>` (JavaScript, не TypeScript) + Vite 8 + Tailwind 3.4 + lucide-vue-next. PWA, `base: '/boom-cmd/'`.
- Mobile-first под iPhone по Apple HIG; на десктопе — мобильная колонка `max-w-[430px]` по центру.
- Цвета **только** через токены `var(--…)` из `src/styles/main.css` — хардкод hex запрещён. Текст монохромный. Акцент `--accent #FFC833` — только заливка.
- Светлая тема по умолчанию; тёмная — будущий свап `[data-theme="dark"]`.
- Не предлагать: TypeScript, drag-библиотеки (vuedraggable/SortableJS), тёмный фон по дефолту, секреты/токены в клиентском коде.
- Стекло — Tailwind-утилита `backdrop-blur` (нужен `-webkit-` префикс на iOS Safari).
