// Service worker для boom-cmd PWA (TZ-3.3 §5).
//
// Стратегия:
//   - CACHE_NAME содержит build-id, который заменяется при сборке
//     (см. vite.config.js → closeBundle: '__BUILD_ID__' → Date.now()).
//     Каждый билд получает свой кэш, старые удаляются на activate.
//   - install: precache shell + skipWaiting (новый SW не ждёт закрытия вкладок).
//   - activate: clients.claim + чистка любых кэшей, не равных текущему;
//                postMessage клиентам ({ type: 'SW_ACTIVATED', cacheName }) —
//                канал на будущее, страница сейчас auto-reload не делает.
//   - fetch (ТОЛЬКО same-origin — кросс-ориджин источник данных не трогаем):
//       * навигации (request.mode === 'navigate') → network-first:
//         идём в сеть, при успехе обновляем кэшированный index.html, при
//         оффлайне — отдаём кэшированный index.html;
//       * GET ассеты (имеют хешированное имя при сборке) → cache-first:
//         если в кэше — отдаём из кэша; иначе fetch и кладём в кэш;
//       * кросс-ориджин (gated Apps Script — данные) → НЕ перехватываем,
//         сеть напрямую, чтобы обновления Google-таблицы долетали сразу;
//       * остальные методы (POST/PUT/…) — не перехватываем.

const BUILD_ID = '__BUILD_ID__'; // подменяется на Date.now() в closeBundle
const CACHE_NAME = 'boom-cmd-' + BUILD_ID;
const BASE = '/';
const SHELL_URL = BASE + 'index.html';
const PRECACHE = [
  BASE,
  SHELL_URL,
  BASE + 'favicon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'apple-touch-icon.png',
  BASE + 'manifest.json',
  // D-21: бренд-ассеты экрана входа. Шрифты самозахощены (с CDN ничего не грузим),
  // поэтому в оффлайне их обязан отдать кэш — иначе логотип и ярлыки уедут на
  // системный фолбэк. Кладём только woff2: .woff — фолбэк для древних браузеров,
  // он подтянется по требованию через cache-first ниже.
  BASE + 'runscale_logo.svg',
  BASE + 'runscale_chevron.svg',
  BASE + 'fonts/UniversLTCYR-67BoldCond.woff2',
  BASE + 'fonts/UniversLTCYR-57Condensed.woff2',
  BASE + 'fonts/RobotoMono-Regular.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
      // Канал на будущее: клиенты могут отреагировать на смену версии
      // (например, тихо предложить обновление). Сейчас никто не слушает —
      // это нормально, auto-reload намеренно не делаем.
      const clientList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientList) {
        client.postMessage({ type: 'SW_ACTIVATED', cacheName: CACHE_NAME });
      }
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Только SAME-ORIGIN (аппшелл + собранные ассеты). Кросс-ориджин запросы
  // НЕ перехватываем — они уходят в сеть напрямую. Это критично для
  // ИСТОЧНИКА ДАННЫХ (gated Apps Script: Projects / Analytics / Materials):
  // раньше он попадал в ветку «любой GET → cache-first» и залипал —
  // обновления Google-таблицы не долетали до PWA, пока не сменится build-id.
  // Данные должны читаться из сети в рантайме, поэтому их не кэшируем.
  let sameOrigin = true;
  try {
    sameOrigin = new URL(request.url).origin === self.location.origin;
  } catch (e) {
    sameOrigin = true;
  }
  if (!sameOrigin) return;

  // /media/* — НОСИТЕЛИ ДЛЯ ПАРКОВ (ТВ-панели, DRV-10). Не трогаем вообще.
  //
  // Иначе ломается ровно так: ветка ниже ловит ЛЮБУЮ навигацию и в оффлайне
  // отдаёт SHELL_URL — то есть панель у кассы вместо страницы ТУРБО показала бы
  // экран входа в дашборд. Второй отказ мягче, но противнее: cache-first
  // залипал бы на ассетах турбо-страницы, и правка носителя не доезжала бы до
  // зала до смены build-id.
  //
  // Цена решения: без сети страница не поднимется совсем (HTTP-кэш браузера —
  // не гарантия). Сознательно: панель стоит на постоянной сети, а свежесть
  // расписания на экране в зале важнее оффлайна. Сами данные переживают обрыв
  // отдельно — сутки в localStorage, см. media/turbo/turbo.js §4.
  //
  // ⚠ ТОЧНОСТЬ ФОРМУЛИРОВКИ: исключается HTML носителя, но НЕ его бандл —
  // тот собирается в /assets/turbo-<хеш>.js и попадает в cache-first ниже.
  // Проверено в бою 08.08: в кэше лежит /assets/turbo-CZZ9dxVK.js.
  // Это безопасно и менять не надо: имя бандла содержит хеш содержимого, а
  // HTML, который на него ссылается, не кэшируется никогда — новый билд даёт
  // новое имя, и панель тянет его из сети. Залипнуть на старом коде нельзя.
  // Не «чинить» это, добавив /assets/turbo- в исключения: тогда панель будет
  // качать бандл на каждой перезагрузке без всякой пользы.
  let path = '';
  try {
    path = new URL(request.url).pathname;
  } catch (e) {
    path = '';
  }
  if (path.indexOf(BASE + 'media/') === 0) return;

  // Навигация (HTML страница) — network-first с обновлением кэша.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(SHELL_URL, clone));
          }
          return res;
        } catch (e) {
          const cached = await caches.match(SHELL_URL);
          if (cached) return cached;
          throw e;
        }
      })(),
    );
    return;
  }

  // Ассеты с хешированным именем (и любые прочие GET) — cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const res = await fetch(request);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(request, clone));
      }
      return res;
    })(),
  );
});
