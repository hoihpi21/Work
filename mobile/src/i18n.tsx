import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import en from './locales/en.json'
import my from './locales/my.json'
import { theme } from './theme'

export type LangCode = 'en' | 'my'

export const LANGUAGES: { code: LangCode; label: string; name: string }[] = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'my', label: 'မြန်မာ', name: 'မြန်မာ' },
]

const DICTS: Record<LangCode, Record<string, any>> = { en, my }
const STORAGE_KEY = 'bf_lang'

function getNested(obj: Record<string, any>, path: string): string | undefined {
  return path.split('.').reduce<any>((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj)
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string

type I18nCtx = {
  lang: LangCode
  setLang: (next: LangCode) => void
  t: TFunc
}

const I18nContext = createContext<I18nCtx>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'en' || saved === 'my') setLangState(saved)
      })
      .catch(() => {})
  }, [])

  const setLang = useCallback((next: LangCode) => {
    setLangState(next)
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }, [])

  const t: TFunc = useCallback(
    (key, vars) => {
      let str = getNested(DICTS[lang], key) ?? getNested(DICTS.en, key) ?? key
      if (vars && typeof str === 'string') {
        for (const [k, v] of Object.entries(vars)) {
          str = str.split(`{${k}}`).join(String(v ?? ''))
        }
      }
      return str
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)

export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('common.switchLanguage')}
      style={{ flexDirection: 'row', backgroundColor: '#efe6da', padding: 3, borderRadius: 10, alignSelf: 'flex-start', gap: 2 }}
    >
      {LANGUAGES.map((l) => {
        const active = lang === l.code
        return (
          <Pressable
            key={l.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => setLang(l.code)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: active ? '#fff' : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: active ? theme.text : theme.muted }}>{l.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
