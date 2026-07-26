import { markRaw, shallowRef } from 'vue'

// Правый верхний угол шапки навигации — управляемый слот (v2.3).
// Тот же приём, что у useNavCaption: модульный синглтон, чтобы экран сам решал,
// что показать справа, не правя AppShell и конфиг вкладок.
//
// Занят парк-фильтром на разделах с `parkFilter: true` — там слот не трогаем.
// Раздел «Сводки сети» кладёт сюда селектор месяца: он относится ко всему разделу,
// а не к отдельному блоку, потому и живёт в шапке, как парк-фильтр.
//
// Использование (внутри экрана с keep-alive):
//   onActivated(() => setTrailing(MyPill, { ...props, 'onUpdate:modelValue': fn }))
//   onDeactivated(() => clearTrailing())
// Компонент кладём через markRaw: реактивной обёртки ему не нужно.

const trailing = shallowRef(null) // { component, props } | null

export function setTrailing(component, props = {}) {
  trailing.value = component ? { component: markRaw(component), props } : null
}
export function clearTrailing() {
  trailing.value = null
}

export function useNavTrailing() {
  return { trailing, setTrailing, clearTrailing }
}
