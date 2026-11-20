import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en from './locales/en.json'
import my from './locales/my.json'

export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'my', label: 'မြန်မာ', name: 'မြန်မာ' },
]

const DICTS = { en, my }
const STORAGE_KEY = 'bf_lang'

function getNested(obj, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj)
}

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && DICTS[saved]) return saved
  } catch {
    // ignore storage errors
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('my')) {
    return 'my'
  }
  return 'en'
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang)

  const setLang = useCallback((next) => {
    if (!DICTS[next]) return
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore storage errors
    }
  }, [])

  const t = useCallback(
    (key, vars) => {
      let str = getNested(DICTS[lang], key) ?? getNested(DICTS.en, key) ?? key
      if (vars && typeof str === 'string') {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v ?? ''))
        }
      }
      return str
    },
    [lang],
  )

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang, t])

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang: () => setLang(lang === 'en' ? 'my' : 'en'),
      t,
    }),
    [lang, setLang, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
