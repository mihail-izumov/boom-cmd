# AGENTS.md

Кросс-ассистентный указатель для проекта `boom-cmd`.

**Точка входа для ассистентов:** `docs/PROJECT-INSTRUCTIONS-boom-cmd.md`
(глобальная инструкция уровня проекта — роль, иерархия истины, протокол ответа).
Тот же текст лежит в Project Instructions Claude-проекта `boom-cmd` на claude.ai.

Краткая выжимка для агентов в репо — в [`CLAUDE.md`](./CLAUDE.md). Полные брифы
и источник истины по дизайну — в `docs/` (локально).

## Главное в трёх строках
- Vue 3 (`<script setup>`, JS) + Vite 8 + Tailwind 3.4 + lucide-vue-next; PWA на GitHub Pages, домен `b00m-cmd.ru`, `base: '/'`.
- Mobile-first под iPhone (Apple HIG); светлая тема; цвета — **только токены `var(--…)`**, хардкод hex запрещён; текст монохромный; акцент `--accent #FFC833` только заливкой.
- Запрещено: TypeScript, drag-библиотеки, тёмный фон по дефолту, секреты в клиенте, имитация нативного Liquid Glass.

Детали, токены, фазы и открытые вопросы — см. `CLAUDE.md` и `docs/DESIGN-STANDARD-boom-cmd.md`.

## Соседний контур — приватные данные (`boom-cmd-data`)
Реальные цифры аналитики, мастер-`.md` парков, сборка `boom-cmd-analytics.xlsx` и owner-инструменты живут в ОТДЕЛЬНОМ приватном репо **`boom-cmd-data`** (путь: `/Users/mihailizumov/work-2026/boombastic/boom-cmd-data`; свой роутер `00-ОРКЕСТРАТОР.md`, свод `00-СОСТОЯНИЕ.md`, `CLAUDE.md`). Этот фронт — только ПОТРЕБИТЕЛЬ данных через контракт (`docs/DATA-CONTRACT-analytics.md`) + mock. Нужны реальные данные — запросить доступ к `boom-cmd-data`. В ЭТОТ публичный репо НИКОГДА не копировать реальные цифры / URL источника / ключ.
