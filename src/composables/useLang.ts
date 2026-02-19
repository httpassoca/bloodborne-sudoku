import { ref, watch } from 'vue'
import { LANGS, t as tt } from '../i18n'

export function useLang(storageKey = 'bbs_lang') {
  const lang = ref<string>((localStorage.getItem(storageKey) as string) || 'en')

  watch(
    lang,
    () => {
      localStorage.setItem(storageKey, lang.value)
    },
    { immediate: true }
  )

  function t(key: string, params?: Record<string, any>) {
    return tt(lang.value, key, params)
  }

  return { lang, langOptions: LANGS, t }
}
