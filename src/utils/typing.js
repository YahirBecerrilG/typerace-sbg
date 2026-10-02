/**
 * Typing validation utilities
 */

export const MAX_ERRORS = 4

/**
 * Validate a typed character against the expected phrase character.
 * Returns 'correct' | 'incorrect'
 */
export function validateChar(typed, expected) {
  return typed === expected ? 'correct' : 'incorrect'
}

/**
 * Calculate progress percentage based on correct characters typed.
 * Progress only increases when characters are correct — errors don't advance.
 */
export function calculateProgress(currentIndex, phraseLength) {
  if (phraseLength === 0) return 0
  return Math.min((currentIndex / phraseLength) * 100, 100)
}

/**
 * Calculate WPM given start time and characters typed correctly.
 * Standard: 5 characters = 1 word
 */
export function calculateWPM(correctChars, elapsedMs) {
  if (elapsedMs <= 0) return 0
  const minutes = elapsedMs / 60000
  const words = correctChars / 5
  return Math.round(words / minutes)
}

/**
 * Calculate accuracy percentage
 */
export function calculateAccuracy(totalKeystrokes, errors) {
  if (totalKeystrokes === 0) return 100
  return Math.round(((totalKeystrokes - errors) / totalKeystrokes) * 100)
}

/**
 * Get character states for display
 * Returns array of { char, state: 'pending' | 'correct' | 'incorrect' | 'current' }
 */
export function getCharStates(phrase, typedText, currentIndex) {
  return phrase.split('').map((char, idx) => {
    if (idx < currentIndex) {
      // Already typed
      return {
        char,
        state: typedText[idx] === char ? 'correct' : 'incorrect',
      }
    } else if (idx === currentIndex) {
      return { char, state: 'current' }
    } else {
      return { char, state: 'pending' }
    }
  })
}

/**
 * Format elapsed time as MM:SS.mmm
 */
export function formatTime(ms) {
  if (!ms) return '0:00.000'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const millis = ms % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/**
 * Throttle function – limit how often fn is called
 */
export function throttle(fn, limitMs) {
  let lastCall = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastCall >= limitMs) {
      lastCall = now
      return fn.apply(this, args)
    }
  }
}
