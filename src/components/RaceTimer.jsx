import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../utils/typing'

/**
 * Live race timer that counts up from when raceStarted becomes true.
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
      color: raceStarted ? '#00f5ff' : 'rgba(255,255,255,0.3)',
      letterSpacing: '0.05em',
      textShadow: raceStarted ? '0 0 15px rgba(0,245,255,0.5)' : 'none',
      minWidth: '110px',
      textAlign: 'center',
    }}>
      {display}
    </div>
  )
}

export default RaceTimer
