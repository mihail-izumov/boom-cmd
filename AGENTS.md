# AGENTS.md

Кросс-ассистентный указатель для проекта `boom-cmd`.

**Канонический контекст — в [`CLAUDE.md`](./CLAUDE.md).** Прочитай его перед работой.
Полные брифы и источник истины по дизайну — в `docs/` (локально).

## Главное в трёх строках
- Vue 3 (`<script setup>`, JS) + Vite 8 + Tailwind 3.4 + lucide-vue-next; PWA на GitHub Pages, `base: '/boom-cmd/'`.
- Mobile-first под iPhone (Apple HIG); светлая тема; цвета — **только токены `var(--…)`**, хардкод hex запрещён; текст монохромный; акцент `--accent #FFC833` только заливкой.
- Запрещено: TypeScript, drag-библиотеки, тёмный фон по дефолту, секреты в клиенте, имитация нативного Liquid Glass.

Детали, токены, фазы и открытые вопросы — см. `CLAUDE.md` и `docs/DESIGN-STANDARD-boom-cmd.md`.
