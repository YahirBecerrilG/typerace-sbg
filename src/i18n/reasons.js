import { useCallback } from 'react'
import { useI18n } from './index'

/**
 * Translation bridge for the reason strings produced by
 * utils/matchNavigation.js#practiceUnavailableReason.
 *
 * That helper is deliberately frozen: it is the tested navigation policy and it
 * returns a ready-to-display sentence rather than a code. Rather than change its
 * contract, the English sentence is mapped here to its dictionary key.
 *
 * The lookup is keyed by the exact source text, so if a sentence is ever reworded
 * the lookup simply misses and `t()` falls back to rendering the English
 * original — the screen degrades to English instead of breaking or showing a raw
 * key path.
 */
const PRACTICE_REASON_KEYS = {
  'This tournament does not exist, or the link is no longer valid.':
    'practice.reason.missing',
  'You are the host of this tournament. Hosts run it, they do not compete in it.':
    'practice.reason.host',
  'You are not registered for this tournament.':
    'practice.reason.notRegistered',
  'You left this tournament.':
    'practice.reason.withdrawn',
  'You have been knocked out of this tournament.':
    'practice.reason.eliminated',
  'You won this tournament.':
    'practice.reason.champion',
  'Practice is closed: the bracket is already running. You can follow your matches from the tournament page.':
    'practice.reason.closed',
}

/**
 * Returns `localise(reason)` — pass the reason straight from
 * practiceUnavailableReason and get the sentence in the active language.
 */
export function usePracticeReason() {
  const { t } = useI18n()

  return useCallback(
    (reason) => {
      if (!reason) return null
      const key = PRACTICE_REASON_KEYS[reason]
      // `fallback` keeps the untranslated sentence when the lookup misses.
      return t(key ?? '', null, reason)
    },
    [t]
  )
}