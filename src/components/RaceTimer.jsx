import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../utils/typing'

/**
 * Live race timer that counts up from when raceStarted becomes true.
 *
 * JetBrains Mono is contractual here — the running clock is a measured value,
 * not a label, so it stays on the same monospace face as the typing text.
 */
export function RaceTimer({ raceStarted = false, stopped = false, finalMs = null }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!raceStarted || stopped) return

    startRef.current = Date.now()

    const tick = () => {
      setElapsed(Date.now() - startRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [raceStarted, stopped])

  const display = finalMs !== null ? formatTime(finalMs) : formatTime(elapsed)

  return (
    <div style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '22px',
      fontWeight: 700,
      color: raceStarted ? 'var(--accent)' : 'var(--text-muted)',
      letterSpacing: '0.05em',
      textShadow: 'none',
      minWidth: '110px',
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {display}
    </div>
  )
}

export default RaceTimer
