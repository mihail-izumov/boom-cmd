# CLAUDE.md — рабочий контекст проекта `boom-cmd`

Канонический файл для ИИ-ассистентов (Claude Code, Cursor, Copilot и др.).
Полные брифы — в `docs/` (локально; см. примечание о приватности внизу).

> **Точка входа для ассистентов:** перед любой работой прочитай
> `docs/PROJECT-INSTRUCTIONS-boom-cmd.md` — это глобальная инструкция уровня
> проекта (роль, иерархия истины, протокол ответа, красные флаги). Тот же текст
> вставлен в Project Instructions Claude-проекта `boom-cmd` на claude.ai, чтобы
> новые чаты подхватывали его автоматически. Этот `CLAUDE.md` — краткая
> выжимка для агентов, работающих в репозитории.

## Что это
**Панель управления БумБастик** — внутренний BizOps-пульт (single pane of glass)
для владельцев и ключевых сотрудников. PWA на GitHub Pages. Это агрегирующая
**витрина, а не система-источник правды** (не ERP/CRM).

Три раздела: **Аналитика** (Pulse) · **Задачи** (Initiatives) · **Материалы** (Library).

## Стек (зафиксирован — не менять без согласования)
Vue 3 (`<script setup>`, JS, не TS) · Vite 8 · Tailwind 3.4 + PostCSS + autoprefixer
· lucide-vue-next 1 · рукописный PWA-слой (`public/manifest.json` + `public/sw.js`,
без vite-plugin-pwa) · хостинг GitHub Pages через GitHub Actions (`.github/workflows/deploy.yml`).
Data-layer (Фаза 2+): Google Sheets → Apps Script `doGet`→JSON → read-only fetch. Бэкенда нет.

## Жёсткие параметры
- Репозиторий `boom-cmd`; **`base: '/boom-cmd/'`**. При смене домена на `b00m-cmd.ru`
  → `base: '/'` + `public/CNAME`. `base` прошит в: `vite.config.js`, `public/manifest.json`,
  `public/sw.js`, `index.html`. Внутренние пути — через `import.meta.env.BASE_URL`.
- **Платформа: mobile-first под iPhone, Apple HIG.** ПК не целевой — на десктопе
  мобильная колонка `max-w-[430px]` по центру. Tab bar внизu (только навигация),
  navigation bar с large title вверху, тач-таргеты ≥44pt, safe-area через `env(...)`.
- **Язык:** данные/значения — английский; UI — русский (слой перевода в Фазе 2).
- Права на данные = доступы Google к таблице, НЕ роли в коде. Фронт read-only там,
  где данные из Sheets.

## Дизайн — ИСТОЧНИК ИСТИНЫ: `docs/DESIGN-STANDARD-boom-cmd.md`
- **Светлая тема по умолчанию.** Тёмная — будущий свап через `[data-theme="dark"]`.
- **Только семантические токены `var(--…)`. Хардкод hex в компонентах ЗАПРЕЩЁН.**
  Все hex живут в одном месте — `src/styles/main.css` (`:root`).
- **Текст всегда монохромный:** чёрный/серый на светлом; белый на тёмной заливке
  (синий/красный); тёмный ink на светлой заливке (жёлтый). Цветного текста нет.
- **Цвет = смысл** (приоритет/статус/алерт/активность), не декор.
- Брендовый акцент — жёлтый `--accent #FFC833`, **только заливка** (напр. пилюля под
  иконкой активной вкладки с `--accent-ink`). Активная вкладка: подпись `--text`,
  индикатор — жёлтая заливка; неактивные — `--text-muted`.

Ключевые токены (полный набор — в стандарте §3.6 и в `src/styles/main.css`):
`--bg #F7F6F3` · `--surface #FFFFFF` · `--surface-2 #F1F0EC` · `--line #E3E1DB` ·
`--text #1C1B18` · `--text-secondary #45433E` · `--text-muted #6F6D66` ·
`--accent #FFC833` / `--accent-ink #1C1B18` · сигналы: `--positive #2F9E54`
`--negative #D92D20` `--info #2563EB` `--warning #FFC833`.

Blur «стекла» — только Tailwind-утилита `backdrop-blur` (чтобы autoprefixer добавил
`-webkit-backdrop-filter`; на iOS Safari без префикса не отрисуется). Нативный
Liquid Glass не имитируем.

## Запреты (красные флаги)
- ❌ Хардкод hex в компонентах — только `var(--…)`.
- ❌ Цветной текст; цвет без смысла; грязные производные оттенки.
- ❌ Тёмный фон как дефолт (тёмная — опциональный свап).
- ❌ TypeScript; drag-библиотеки (vuedraggable/SortableJS).
- ❌ Роли «админ/зритель» на фронте; секреты/токены в клиенте (URL Apps Script — в env).
- ❌ Имитация нативного Liquid Glass; строить ERP/CRM/«OS всего».

## Фазы
0. ✅ Каркас + «Привет!» + деплой на Pages.
1. ⏳ Оболочка: 3 раздела + iOS-навигация (заглушки/empty-states). ← текущая.
2. Секция «Задачи»: Google Sheets + Apps Script, read-only роадмап (Linear-style).
3+. Аналитика, Материалы, AI-слой.

## Структура кода
- `src/App.vue` — состояние активной вкладки (`ref`), список вкладок.
- `src/components/AppShell.vue` — колонка ~430px, скролл между панелями, сворачивание large title.
- `src/components/NavigationBar.vue` — липкий компактный бар + large title в потоке + слот «Назад».
- `src/components/TabBar.vue` — 3 вкладки, активная = жёлтая пилюля-заливка.
- `src/screens/{Analytics,Tasks,Materials}Screen.vue` — экраны-заглушки с empty-state.
- `src/styles/main.css` — токены `:root` + светлый холст + base.

## Команды
`npm install` · `npm run dev` · `npm run build` · `npm run preview`
(деплой — автоматически через GitHub Actions при push в `main`).

## Открытые вопросы (НЕ решать молча — спросить владельца)
1. «Материалы»: одна вкладка с папками **или** три раздела. (сейчас: одна вкладка)
2. Доставка данных роадмапа: живой fetch (A) vs сборка на билде (B) — старт Фазы 2.
3. Тёмная тема: когда включать, нужен ли `prefers-color-scheme`.
4. Англоязычный нейминг параллельно русскому — нужен ли.

## Приватность
`docs/` (внутренние брифы) — в `.gitignore`, т.к. репозиторий публичный ради
бесплатного Pages. Не коммить бизнес-документы в публичный репозиторий.
