import { useMemo } from 'react'
import { getCharStates } from '../utils/typing'

/**
 * Renders the typing text with per-character highlighting.
 * Handles correct/incorrect/current/pending states.
 */
export function TypingText({ phrase, typedText, currentIndex }) {
  const charStates = useMemo(() => {
    if (!phrase) return []
    return getCharStates(phrase, typedText, currentIndex)
  }, [phrase, typedText, currentIndex])

  if (!phrase) return null

  return (
    <div
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 'clamp(16px, 2.2vw, 22px)',
        lineHeight: '1.8',
        letterSpacing: '0.02em',
        userSelect: 'none',
        wordBreak: 'break-word',
        padding: '24px 28px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.06)',
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
      color: '#475569',
    },
    correct: {
      color: '#10b981',
    },
    incorrect: {
      color: '#ef4444',
      backgroundColor: 'rgba(239,68,68,0.15)',
      borderRadius: '2px',
      textDecoration: 'underline',
      textDecorationColor: '#ef4444',
    },
    current: {
      color: '#f1f5f9',
      borderBottom: '2px solid #00f5ff',
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
