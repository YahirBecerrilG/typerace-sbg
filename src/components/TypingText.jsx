import { useMemo } from 'react'
import { getCharStates } from '../utils/typing'

/**
 * Renders the typing text with per-character highlighting.
 * Handles correct/incorrect/current/pending states.
 *
 * Two things here are contractual and must not change:
 *   - JetBrains Mono is the typing font. Kept inline, not themed through CSS, so
 *     a design-token change can never reach it.
 *   - The phrase is rendered verbatim. It comes from the `phrases` table and is
 *     always English, in every locale.
 *
 * `scale` only changes how large the phrase is drawn, so the training and race
 * screens can both make the phrase the centre of the composition. It never
 * touches the family, the character states or the measurement.
 *
 * `sm` reproduces the original single-size rendering; `md` and `lg` step it up
 * for the new compositions. Both callers pass the size they want explicitly, so
 * the default below only covers an unknown value.
 */
export function TypingText({ phrase, typedText, currentIndex, scale = 'md' }) {
  const charStates = useMemo(() => {
    if (!phrase) return []
    return getCharStates(phrase, typedText, currentIndex)
  }, [phrase, typedText, currentIndex])

  if (!phrase) return null

  const scales = {
    sm: { fontSize: 'clamp(15px, 2.2vw, 21px)', padding: 'clamp(18px, 3vw, 26px)' },
    md: { fontSize: 'clamp(18px, 2.9vw, 30px)', padding: 'clamp(26px, 4vw, 44px)' },
    lg: { fontSize: 'clamp(21px, 3.6vw, 40px)', padding: 'clamp(32px, 5vw, 60px)' },
  }
  const s = scales[scale] || scales.sm

  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: s.fontSize,
        lineHeight: '1.85',
        letterSpacing: '0.02em',
        userSelect: 'none',
        wordBreak: 'break-word',
        padding: s.padding,
        background: 'rgba(0,0,0,0.32)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-glass)',
        boxShadow: 'none',
      }}
    >
      {charStates.map(({ char, state }, idx) => (
        <CharacterSpan key={idx} char={char} state={state} />
      ))}
    </div>
  )
}

function CharacterSpan({ char, state }) {
  const styles = {
    pending: {
      color: 'var(--text-muted)',
    },
    correct: {
      color: 'var(--success)',
    },
    incorrect: {
      color: 'var(--danger)',
      backgroundColor: 'rgba(177,183,192,0.15)',
      borderRadius: '2px',
      textDecoration: 'underline',
      textDecorationColor: 'var(--danger)',
    },
    current: {
      color: 'var(--text-primary)',
      borderBottom: '2px solid var(--accent)',
      animation: 'blink 1s ease-in-out infinite',
    },
  }

  return (
    <span style={styles[state] || styles.pending}>
      {char === ' ' ? '\u00A0' : char}
    </span>
  )
}

export default TypingText
