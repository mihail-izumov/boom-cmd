import { ref } from 'vue'

// Опциональная мелкая подпись над крупным заголовком в шапке навигации
// (например «данные от 11.06.2026» в Аналитике). Модульный reactive-синглгон,
// чтобы экран сам решал, что показать, не правя AppShell / конфиг вкладок.
//
// Использование (внутри экрана с keep-alive):
//   const { setCaption, clearCaption } = useNavCaption()
//   onActivated(() => setCaption('данные от …'))
//   onDeactivated(() => clearCaption())
// На прочих экранах caption остаётся null и не рендерится.

const caption = ref(null)

export function setCaption(v) {
  caption.value = v && String(v).trim() ? String(v) : null
}
export function clearCaption() {
  caption.value = null
}

export function useNavCaption() {
  return { caption, setCaption, clearCaption }
}
