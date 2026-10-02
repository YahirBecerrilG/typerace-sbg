import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en from './en'
import es from './es'

/**
 * Centralised UI translations.
 *
 * Design decisions:
 *   - No i18n library. `t()` is a ~20 line lookup, so a dependency would cost
 *     more than it saves here.
 *   - English is the reference locale and the fallback: a key missing from `es`
 *     renders the English string rather than a raw key path, so a partial
 *     translation degrades instead of breaking.
 *   - Persistence reuses the only preference mechanism this project has:
 *     localStorage. The language survives reloads with no account round-trip and
 *     no backend change.
 *   - `<html lang>` is kept in sync, which is what screen readers announce and
 *     what lets the browser pick the right font fallbacks.
 *
 * Typing phrases are intentionally absent from every dictionary: they come from
 * the `phrases` table and are always English.
 */

const STORAGE_KEY = 'typerace.lang'

export const LANGUAGES = [
  { code: 'en', flag: '🇺🇸', labelKey: 'lang.en', htmlLang: 'en' },
  { code: 'es', flag: '🇲🇽', labelKey: 'lang.es', htmlLang: 'es' },
]

const DICTIONARIES = { en, es }
const DEFAULT_LOCALE = 'en'

/** Read the stored preference, or guess from the browser on a first visit. */
function readStoredLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && DICTIONARIES[stored]) return stored
  } catch {
    // Private mode / disabled storage: fall through to the browser guess.
  }
  const preferred = window.navigator?.language || ''
  return preferred.toLowerCase().startsWith('es') ? 'es' : DEFAULT_LOCALE
}

function interpolate(template, vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  )
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale)

  const setLocale = useCallback((next) => {
    if (!DICTIONARIES[next]) return
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference simply will not persist; the UI still switches language.
    }
  }, [])

  // `<html lang>` drives screen-reader pronunciation and browser fallbacks.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback(
    (key, vars, fallback) => {
      const dictionary = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE]
      // A key missing from `es` renders English, not the key path.
      const template = dictionary?.[key] ?? DICTIONARIES[DEFAULT_LOCALE]?.[key] ?? fallback ?? key
      return interpolate(template, vars)
    },
    [locale]
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      languages: LANGUAGES,
      // Number formatting per locale, for values that are locale-sensitive.
      formatNumber: (n, options) =>
        new Intl.NumberFormat(locale === 'es' ? 'es-MX' : 'en-US', options).format(n),
    }),
    [locale, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

/**
 * Domain labels shared by every screen.
 *
 * These used to live in utils/bracket.js as plain English maps. They are
 * presentation, not maths, so they belong with the translations — and every
 * screen now resolves them the same way, which is what keeps the bracket, the
 * lobby and the results from drifting apart.
 */
export function useLabels() {
  const { t } = useI18n()

  return useMemo(
    () => ({
      matchStatus: (status) => t(`labels.matchStatus.${status}`, null, status || ''),
      tournamentStatus: (status) => t(`labels.tournamentStatus.${status}`, null, status || ''),
      playerStatus: (status) => t(`labels.playerStatus.${status}`, null, status || ''),
      difficulty: (value) => t(`labels.difficulty.${value}`, null, value || ''),

      /** 1 -> Champion · 2..4 -> ordinals · rest -> "{n}th place" style ordinal. */
      placement: (placement) => {
        if (!placement) return null
        if (placement === 1) return t('labels.placement.champion')
        if (placement === 2) return t('labels.placement.second')
        if (placement === 3) return t('labels.placement.third')
        if (placement === 4) return t('labels.placement.fourth')
        return t('labels.placement.ordinal', { n: placement })
      },

      /** Same maths as the old getRoundName(): count backwards from the final. */
      roundName: (roundNumber, totalRounds) => {
        const round = roundNumber || 1
        const fromEnd = (totalRounds || 0) - round + 1
        switch (fromEnd) {
          case 1:
            return t('round.final')
          case 2:
            return t('round.semifinals')
          case 3:
            return t('round.quarterfinals')
          case 4:
            return t('round.of16')
          case 5:
            return t('round.of32')
          default:
            return t('round.number', { n: round })
        }
      },
    }),
    [t]
  )
}