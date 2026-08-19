<script setup>
import { computed, ref } from 'vue'
import { AlertCircle, Eye, EyeOff } from 'lucide-vue-next'
import { ACCESS_RU, LOGIN_ISSUE_RU } from '../i18n/access.js'
import LoginIssueModal from './LoginIssueModal.vue'

// Экран входа (Фаза 4; ревизия D-21 от 28.07.2026 — ТЗ «экран входа: логотип Ранскеил»).
//
// Сверху вниз: логотип Ранскеил (шеврон + слово + бейдж «Ультра») вместо прежнего
// заголовка «Расти с планом» → карта входа по центру экрана (ярлык ДОСТУП В СИСТЕМУ →
// логин+код в одном поле с разделителем → СТАРТ) → в подвале логотип
// «Модуль роста». Плашка с именем продукта из подвала УБРАНА.
//
// D-23 (19.08.2026): имя продукта Ранскейл → РАНСКЕИЛ (через «и»), под словом
// появился третий ярус лочкапа — бейдж «УЛЬТРА» рамкой. Метрики бейджа и причины,
// по которым угол прямой, а не скруглённый, — в комментарии у самого элемента.
// Ширина слова от переименования НЕ изменилась: у «И» и «Й» в Univers 67 Bold Cond
// одинаковый advance, обе формы дают ровно 141.51px при 28px и трекинге 0.06em.
//
// D-23b (19.08.2026, по скриншотам с устройства): связка на мобайле увеличена
// ×1.25 — прежний размер спорил по весу с подвальным «Модуль Роста», и главный
// элемент экрана читался наравне со служебным. Пропорции внутри связки те же,
// вырос масштаб целиком.
//
// Метрики лого (mobile при вьюпорте 390px): шеврон 66px по высоте, зазор до слова
// 15px, слово 35px Univers 67 Bold Cond, капс, трекинг 0.06em; бейдж 17.5px,
// высота 27px, вплотную под словом (см. комментарий у бейджа — зазор там даёт
// не margin, а пустота под выносными элементами). Ширина шеврона считается из
// его пропорции (1080:923.72) = 77px ≈ 44% ширины слова (176.9px по метрикам
// шрифта) — канон утверждённого локапа, доля от слова не изменилась. Прежние
// 72px/60% (вариант A) отклонены владельцем 28.07.
// До 19.08 мобильные значения были 53 / 12 / 28 / 62.
// На ≥768px связка не менялась: 80 / 18 / 42 (теперь это ×1.21 к мобайлу, а не ×1.5,
// — десктоп не целевой, и раздувать его вслед за мобайлом смысла нет).
//
// ПАКЕТ ПРАВОК v2 (тёмная витрина входа, референс docs/brand/ranskeil-login-dark-v2.png):
// экран переведён в нейтральный монохром через СКОУПНЫЙ набор токенов
// `data-theme="auth-dark"` на корне (значения — в src/styles/main.css). Атрибут висит
// на компоненте, а не на <html>: внутрь приложения тёмная тема НЕ распространяется —
// «Сегодня» и остальные экраны остаются светлыми (явная граница ТЗ). Ни одного hex
// в разметке: жёлтая кнопка стала белой переопределением --accent/--accent-ink,
// а не заменой классов. Цвет = сигнал: единственный цветной элемент — текст ошибки.
//
// Метрики шеврона выверены по мокапу v2 (780×1500 = 390×750 @2x): знак 106px = 53px CSS,
// слово — cap 42px = 21px CSS, что при cap-height 0.722 em даёт ровно 28px кегля.
//
// Токены DESIGN-STANDARD, текст монохром, цвет только по функции (ошибка —
// --negative; кнопка — --accent). Хардкод `#111` из ТЗ заменён на var(--text):
// хардкод hex запрещён, а токен ещё и позволил переключить экран в тёмный одним блоком.
// Поле «логин» в проверке не участвует и с 28.07 НЕ редактируется: значение
// проставлено (`b00mbastic`) и заблокировано. Раньше пустое редактируемое поле
// обещало, что от него что-то зависит, — обещание ложное: вход только по коду.

const props = defineProps({
  error: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  netError: { type: String, default: null },
  // Подсказка «что делать» под ошибкой (D-22). Словарь общий со всем приложением
  // (i18n/net.js): «выключите VPN» показывается ТОЛЬКО при транспортной осечке.
  // До D-22 экран входа был единственным местом, где ошибка не сопровождалась
  // ни одним действием — а VPN тут причина номер один (см. i18n/net.js, 05.08).
  netHint: { type: String, default: '' },
  notice: { type: String, default: null },
  // Номер попытки при повторах (1..3). Пауза между попытками — бо́льшая часть
  // времени, и всё это время кнопка обязана говорить, что процесс идёт.
  attempt: { type: Number, default: 0 },
  // Чем закончилась последняя попытка (useAccessKey.lastFailure) — уходит в
  // заявку «Проблемы со входом» без повторного сетевого запроса.
  failure: { type: Object, default: null },
})
const emit = defineEmits(['submit'])

// Модалка заявки. Открывается ссылкой под картой входа.
const issueOpen = ref(false)

// Подпись кнопки. Три состояния вместо прежних двух: покой → «Проверяем…» →
// «Пробуем ещё…». Третье появилось вместе с повторами: без него шесть секунд
// молчания читаются как зависание.
const submitLabel = computed(() => {
  if (!props.loading) return ACCESS_RU.submit
  return props.attempt > 1 ? ACCESS_RU.retrying : ACCESS_RU.checking
})

// Логин больше не состояние: он фиксирован (ACCESS_RU.login) и не редактируется.
const phrase = ref('')
const show = ref(false)

// Крупный кегль включается ТОЛЬКО когда в поле есть что маскировать.
// Раньше он зависел от одного `show`, и на пустом поле переключение глаза меняло
// font-size с 24px на 16px — вместе с ним съезжал placeholder, хотя пользователь
// ничего не вводил. Теперь пустое поле выглядит одинаково в обоих состояниях
// глаза, а размер меняется только с появлением первого символа.
const masked = computed(() => !show.value && phrase.value.length > 0)

function onSubmit() {
  const v = phrase.value.trim()
  if (!v || props.loading) return
  emit('submit', v)
}

// Логотипы тонируются через CSS-маску (силуэт SVG, независимо от заливок в файле).
const base = (import.meta.env && import.meta.env.BASE_URL) || '/'
const maskOf = (file) => {
  const url = `url("${base}${file}")`
  return {
    WebkitMaskImage: url, maskImage: url,
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
    WebkitMaskSize: 'contain', maskSize: 'contain',
  }
}
const logoMask = maskOf('runscale_logo.svg') // «Модуль роста», подвал
// Шеврон Ранскеил. viewBox обрезан по знаку (см. комментарий в самом svg),
// поэтому height бокса = реальная высота знака.
// ЗАЛИВКА В ФАЙЛЕ — БЕЛАЯ, и это не вкусовщина: WebKit для webkit-mask-image
// считает СВЕТЛОТУ, а не альфу. Чёрный знак = светлота 0 = замаскирован целиком,
// то есть невидим. Именно на этом шеврон пропадал на проде, пока «Модуль Роста»
// (он белый) рисовался нормально. Цвет на экране даёт фон элемента, не файл.
// ШИРИНА ЗАДАНА ЯВНО (62 / 94px), и это не украшательство: пустой div без контента
// внутри flex-колонки с align-items:center получает ширину по содержимому, то есть
// НОЛЬ — знак просто не рисовался (ровно этот баг был виден на проде: слово есть,
// шеврона нет). aspect-ratio оставлен как страховка, но опираться на него нельзя.
// 62 = 53 × 1080/923.72, 94 = 80 × 1080/923.72.
const chevronMask = { ...maskOf('runscale_chevron.svg'), aspectRatio: '1080 / 923.72' }

// Тёмный theme-color системной шапки ставит НЕ этот компонент, а App.vue по
// состоянию гейта (см. composables/useThemeColor.js): если фраза уже подтверждена,
// форма входа не монтируется — возвращать цвет было бы некому.
</script>

<template>
  <div
    data-theme="auth-dark"
    data-test="access-root"
    class="flex min-h-[100svh] flex-col bg-[var(--bg)] px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
  >
    <!-- логотип: связка шеврон + слово, отступ сверху ≈13% высоты экрана (ТЗ §1).
         Пробовали 29.07 собрать лого и карточку в одну центрированную группу
         (чтобы пропорция не зависела от высоты экрана) — владелец вернул прежнюю
         раскладку из трёх зон. Не переделывать без запроса. -->
    <div class="flex flex-1 items-start justify-center pt-[13svh]">
      <div
        data-test="access-logo"
        class="flex flex-col items-center"
        role="img"
        :aria-label="ACCESS_RU.logo_alt"
      >
        <div
          data-test="access-chevron"
          class="h-[66px] w-[77px] bg-[var(--text)] md:h-[80px] md:w-[94px]"
          :style="chevronMask"
        ></div>
        <!-- mr компенсирует трекинг после последней буквы: без него связка
             визуально уезжает влево на половину межбуквенного интервала -->
        <span
          data-test="access-wordmark"
          class="mt-[15px] mr-[-0.06em] font-brand text-[2.1875rem] uppercase leading-none tracking-[0.06em] text-[var(--text)] md:mt-[18px] md:text-[2.625rem]"
          aria-hidden="true"
        >Ранскеил</span>
        <!-- Бейдж уровня продукта (D-23, 19.08.2026). Третий ярус лочкапа, а не
             элемент интерфейса, поэтому метрики выведены из слова, а не из
             UI-шкалы: кегль 17.5px = ровно половина слова (35px), высота 27px =
             cap-height 12.6px плюс поля.
             ЗАЗОР СЧИТАЕТСЯ ОПТИЧЕСКИ, А НЕ ПО MARGIN (правка 19.08). При
             leading-none бокс слова равен кеглю, а базовая линия стоит на 0.8em
             от верха — значит под капсом всегда висит 0.2em пустоты под выносные
             элементы (для 35px это 7px). Из-за этого прежние ОДИНАКОВЫЕ
             mt-[12px] давали РАЗНЫЕ зазоры на глаз: 14px над словом и 18px под
             ним, лочкап читался как три равноудалённых яруса, и «Ранскеил
             Ультра» не собиралось в одно имя. Теперь mt-0: зазором работает та
             самая пустота под выносными (7px), а над словом mt-[15px] даёт
             оптические 17.7px. Отношение 2.5:1 — знак отдельно, имя вместе.
             Менять mt на «ровное» число, не пересчитав 0.2em, = вернуть баг.
             УГОЛ ПРЯМОЙ, И ЭТО НЕ ЭКОНОМИЯ. Радиус 6px на объекте высотой 22px
             съедает 27% высоты: на такой мелочи скругление читается не как
             мягкий угол, а как «здесь кнопка», и бейдж выпадает из знака в
             интерфейс. Шеврон и Univers Condensed целиком на прямых — бейдж тоже.
             ОБВОДКА, А НЕ ЗАЛИВКА (решение владельца 19.08): инверсная плашка
             тянула взгляд вниз и спорила по весу с шевроном. Рамка тише.
             Цвет один и тот же (--text) и у рамки, и у текста: бейдж — часть
             логотипа, а --accent на этом экране закреплён за кнопкой СТАРТ,
             и красить им нединамический элемент значило бы обещать действие.
             ОПТИЧЕСКИЙ ЦЕНТР — top-[0.095em], и число промерено, а не подобрано
             (правка 19.08 по скриншоту с устройства, 414×896 @3x). Флексовое
             центрирование выравнивает СТРОКУ, а строка на 0.2em длиннее капса за
             счёт места под выносные элементы, которых в капсе нет, — надпись
             садится выше середины рамки. Прежний pt-[1px] лечил половину беды:
             padding на флекс-контейнере двигает содержимое на ПОЛОВИНУ своей
             величины, а не на всю.
             Замер: рамка 812…892 device px (81 = 27 CSS ✓), капс 830…867, то есть
             18 сверху и 25 снизу — перекос 7 device px. Чтобы сравнять, надпись
             нужно опустить на 3.5 device px, плюс вернуть 1.5, которые давал
             pt-[1px]: итого 5 device = 1.667 CSS = 0.095em при кегле 17.5px.
             Сдвиг задан в em и потому переезжает на десктопный кегль сам.
             relative/top, а не margin: правка чисто оптическая, высоту строки и
             раскладку она трогать не должна.
             mr компенсирует трекинг после последней буквы, как у слова выше.
             Обводка на md — 2px, а не те же 1.5: связка масштабируется ×1.5,
             и линия постоянной толщины на крупном кегле выглядит осыпавшейся. -->
        <span
          data-test="access-badge"
          class="mt-0 flex h-[27px] items-center justify-center border-[1.5px] border-[var(--text)] px-[15px] font-brand text-[1.09375rem] uppercase leading-none tracking-[0.16em] text-[var(--text)] md:h-[32px] md:border-2 md:px-[18px] md:text-[1.3125rem]"
          aria-hidden="true"
        ><span class="relative top-[0.095em] mr-[-0.16em]">Ультра</span></span>
      </div>
    </div>

    <!-- карта ввода (строго по центру экрана за счёт равных flex-зон) -->
    <form class="mx-auto w-full max-w-[20rem]" @submit.prevent="onSubmit">
      <!-- Радиусы уменьшены (26/16/16 → 20/12/12): крупные скругления читаются как
           «мягкий потребительский» тон, мелкие — как приборная панель. Иерархия
           сохранена: карточка скруглена сильнее, чем поля внутри неё. -->
      <div
        data-test="access-card"
        class="flex flex-col gap-4 rounded-[20px] border border-[var(--rim)] bg-[var(--surface)] p-6 shadow-[var(--card-shadow)]"
      >
        <!-- ярлык функции, а не вывеска: тише и мельче прежнего «БУМБАСТИК».
             v2: разрядка 6% → 10%, цвет --text-secondary = #9A9A9A на карточке
             #161616 → 6.43:1 (посчитано по WCAG, не на память) -->
        <p
          data-test="access-card-label"
          class="text-center font-label text-[0.9375rem] uppercase tracking-[0.1em] text-[var(--text-secondary)]"
        >{{ ACCESS_RU.card_label }}</p>

        <!-- объединённое поле: логин / разделитель / фраза, единая обводка.
             v2: фон полей темнее карточки (--surface-2 #0F0F0F на --surface #161616).
             Ошибка красит обводку в --negative: сообщение под полем говорит ЧТО не так,
             рамка — ГДЕ. Обводка общая на оба поля (структура карточки по ТЗ не
             менялась), поэтому подсвечивается вся пара. -->
        <div
          data-test="access-fields"
          class="overflow-hidden rounded-xl border bg-[var(--surface-2)] shadow-[inset_0_1px_0_var(--rim-glow)]"
          :class="error ? 'border-[var(--negative)]' : 'border-[var(--line)]'"
        >
          <!-- Логин НЕ редактируется: значение проставлено и заблокировано.
               readonly, а не disabled — disabled выключает поле из чтения
               скринридером и глушит его через disabled:opacity, а логин должен
               оставаться читаемым: это контекст входа. tabindex=-1 уводит фокус
               сразу на код доступа — табать по неизменяемому полю незачем.
               Цвет вторичный: яркий читался бы как «здесь ждут ввода». -->
          <div class="flex min-h-[52px] items-center px-4">
            <input
              type="text"
              :value="ACCESS_RU.login"
              readonly
              tabindex="-1"
              aria-readonly="true"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              data-test="access-login"
              class="w-full cursor-default select-none border-none bg-transparent font-mono text-[1rem] text-[var(--text-secondary)] outline-none"
            />
          </div>
          <div class="h-px bg-[var(--line)]" aria-hidden="true"></div>
          <!-- Символ маски пароля рисует БРАУЗЕР (U+2022), поменять его на «*»
               средствами CSS нельзя — только полностью самодельной маской, а это
               ломает нативный ввод (каретка при правке в середине, вставка,
               менеджеры паролей).
               Кегль маски вернули к 16px, как у текста (правка 29.07). Попытка
               сделать «крупные звёздочки» через 24px давала жирные кружки: точки
               выглядели тяжелее букв, а на экране это читается как неуверенность,
               а не как премиальность. Стандарт всех приличных форм — один кегль
               в обоих состояниях; отличается только разрядка 0.14em, чтобы маска
               читалась рядом марок, а не сплошной полосой.
               Побочный плюс: размер больше не скачет при переключении глаза.
               Placeholder своих размеров НЕ переопределяет: он наследует метрики
               поля, а на пустом поле они всегда одни и те же (см. `masked`). -->
          <div class="relative flex min-h-[52px] items-center pl-4 pr-1">
            <input
              v-model="phrase"
              :type="show ? 'text' : 'password'"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="ACCESS_RU.placeholder"
              :aria-invalid="error ? 'true' : 'false'"
              :disabled="loading"
              data-test="access-phrase"
              class="w-full border-none bg-transparent pr-2 font-mono text-[var(--text)] placeholder:text-[var(--placeholder)] outline-none disabled:opacity-60"
              :class="masked ? 'text-[1rem] leading-[1.5] tracking-[0.14em]' : 'text-[1rem] leading-[1.5] tracking-normal'"
            />
            <!-- Системное кольцо фокуса тут синее — это цвет ОС, а не наш токен, и
                 на монохромном экране оно выглядит как чужеродная подсветка. Гасим
                 outline и рисуем своё кольцо только для клавиатуры (focus-visible):
                 после тапа пальцем focus-visible не срабатывает, кольца не будет. -->
            <button
              type="button"
              data-test="access-eye"
              class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] active:bg-[var(--surface)]"
              :aria-label="show ? ACCESS_RU.hide : ACCESS_RU.show"
              :aria-pressed="show ? 'true' : 'false'"
              tabindex="-1"
              @click="show = !show"
            >
              <EyeOff v-if="show" class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
              <Eye v-else class="h-5 w-5" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- ошибка — ЕДИНСТВЕННЫЙ цветной элемент экрана (v2: цвет = сигнал,
             а не декорация). Поэтому здесь текст красный, а не монохромный, как
             в остальном приложении. --negative на тёмной витрине поднят до
             #FF5C4D = 5.94:1 на карточке (брендовый #D92D20 давал 3.75:1). -->
        <div v-if="error || netError" role="alert">
          <p
            data-test="access-error"
            class="flex items-center justify-center gap-1.5 text-[0.875rem] text-[var(--negative)]"
          >
            <AlertCircle class="h-4 w-4 shrink-0 text-[var(--negative)]" :stroke-width="2" aria-hidden="true" />
            <span>{{ netError || ACCESS_RU.wrong }}</span>
          </p>
          <!-- Подсказка — ВТОРОЙ строкой и МОНОХРОМНАЯ. Красным сказано, ЧТО не
               так; что с этим делать — уже не сигнал, а инструкция, и красить её
               в тот же цвет значило бы удвоить тревогу вместо того, чтобы её снять.
               --text-secondary #9A9A9A на карточке #161616 = 6.43:1 (посчитано). -->
          <p
            v-if="netHint"
            data-test="access-hint"
            class="mt-1.5 text-center text-[0.875rem] leading-snug text-[var(--text-secondary)]"
          >{{ netHint }}</p>
        </div>
        <p v-else-if="notice" class="text-center text-[0.875rem] text-[var(--text-muted)]">{{ notice }}</p>

        <!-- Цвет — из скоупных токенов (--accent белый, --accent-ink чёрный),
             разрядка 12%, радиус приведён к полям (12px).
             ОПТИЧЕСКИЙ ЦЕНТР: капс без выносных элементов геометрически центруется
             слишком высоко — глаз читает это как «текст уехал вверх». Сдвигаем на
             2px вниз (pt-[2px] при flex-центрировании), а не правим line-height:
             так центр не зависит от метрик шрифта. mr компенсирует трекинг после
             последней буквы — иначе слово смещено влево на пол-интервала. -->
        <button
          type="submit"
          data-test="access-submit"
          :disabled="loading"
          class="flex w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 pt-[2px] font-brand text-[1.125rem] uppercase tracking-[0.12em] text-[var(--accent-ink)] active:opacity-90 disabled:opacity-60"
          style="min-height: 52px"
        >
          <span class="mr-[-0.12em]">{{ submitLabel }}</span>
        </button>
      </div>

      <!-- «Проблемы со входом» (D-22). Под картой, а не в подвале: это следующий
           шаг того же сценария, и он должен лежать там, где взгляд уже находится
           после неудачного «СТАРТ».
           ВСЕГДА ВИДНА, а не только после ошибки. Часть отказов вообще не доходит
           до сообщения об ошибке (человек ждёт и закрывает приложение), а ссылка,
           которая появляется только при сбое, не находится тогда, когда нужна.
           Монохром: --text-secondary #9A9A9A на фоне #0A0A0A = 7.36:1 (посчитано
           по WCAG). Обёртка добирает тач-таргет до 44pt при кегле 14px. -->
      <div class="mt-4 flex justify-center">
        <button
          type="button"
          data-test="access-issue-link"
          class="inline-flex min-h-[44px] items-center justify-center px-4 text-[0.875rem] text-[var(--text-secondary)] underline decoration-[var(--text-muted)] underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-secondary)] active:opacity-70"
          @click="issueOpen = true"
        >{{ LOGIN_ISSUE_RU.link }}</button>
      </div>
    </form>

    <LoginIssueModal :open="issueOpen" :failure="failure" @close="issueOpen = false" />

    <!-- футер: только логотип «Модуль роста» под маску, приглушённым --graphite.
         Плашка с именем продукта убрана (D-21): имя продукта теперь наверху,
         в логотипе — дублировать его внизу нечем и незачем.
         v2: прежний opacity 0.62 снят — он был подобран под светлый фон и на
         тёмном утопил бы подпись совсем; приглушение теперь даёт сам токен. -->
    <div class="flex flex-1 flex-col items-center justify-end pb-10">
      <!-- Логотип кликабелен: ведёт на сайт Ранскеил в новой вкладке.
           rel="noopener noreferrer" обязателен при target="_blank" — иначе
           открытая страница получает доступ к window.opener.
           Обёртка добирает тач-таргет до 44pt: сам знак 28px высотой. -->
      <a
        data-test="access-footer-link"
        href="https://runscale.ru"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex min-h-[44px] items-center justify-center px-4 active:opacity-70"
        aria-label="Модуль роста — открыть runscale.ru"
      >
        <span class="block h-7 w-[99px] bg-[var(--graphite)]" :style="logoMask" aria-hidden="true"></span>
      </a>
    </div>
  </div>
</template>
