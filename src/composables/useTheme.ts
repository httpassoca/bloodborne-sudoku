import { ref, watch } from 'vue'

export function useTheme(storageKey = 'bbs_theme') {
  const theme = ref<string>((localStorage.getItem(storageKey) as string) || 'dark')

  function applyTheme() {
    document.documentElement.dataset.theme = theme.value
    localStorage.setItem(storageKey, theme.value)
  }

  watch(theme, applyTheme, { immediate: true })

  return { theme, applyTheme }
}
