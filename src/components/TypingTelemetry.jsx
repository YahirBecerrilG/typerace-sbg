import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { calculateWPM, calculateAccuracy } from '../utils/typing'
import { useI18n } from '../i18n'

/**
 * Live typing telemetry.
 *
 * Presentation only. It reads values the race hook already owns (`currentIndex`,
 * `totalKeystrokes`, `errors`, `startTime`, `endTime`) and re-runs the existing
 * pure `calculateWPM` / `calculateAccuracy` helpers on each frame to produce a
 * readout that ticks while you type.
 *
 * It stores no game state, submits nothing and changes no behaviour: the WPM and
 * accuracy a player finally records still come from the untouched server write.
 * The only local state is the frame counter used to drive the animation.
 */
export function LiveTypingMetrics({
  correctChars = 0,
  totalKeystrokes = 0,
  errors = 0,
  startTime = null,
  endTime = null,
  running = false,
}) {
  const { t } = useI18n()
  const elapsedMs = useElapsedMs(startTime, endTime, running)

  const wpm = calculateWPM(correctChars, elapsedMs)
  const accuracy = calculateAccuracy(totalKeystrokes, errors)

  return (
    <div className="grid grid-cols-3 gap-px" style={{ background: 'var(--border-glass)' }}>
      <Metric
        label={t('unit.wpm')}
        value={wpm > 0 ? wpm : '—'}
        accent="var(--accent)"
        unit={running ? t('live') : null}
      />
      <Metric
        label={t('common.accuracy')}
        value={`${accuracy}%`}
        accent="var(--text-secondary)"
      />
      <Metric
        label={t('race.errors')}
        value={errors}
        accent={errors > 0 ? 'var(--danger)' : 'var(--text-primary)'}
      />
    </div>
  )
}

/** One metric cell. The value is the loudest element; the label is a whisper. */
function Metric({ label, value, accent, unit }) {
  return (
    <div className="metric p-5 text-center sm:p-6" style={{ background: 'var(--bg-card)' }}>
      <span className="label-xs">{label}</span>
      <span
        className="metric-value metric-lg mt-3"
        style={{ color: accent, justifyContent: 'center' }}
      >
        {value}
      </span>
      {unit && <span className="metric-unit mt-2 block">{unit}</span>}
    </div>
  )
}

/** Thin progress rail that mirrors the phrase fill. */
export function ProgressRail({ value = 0 }) {
  const motionSafe = !useReducedMotion()
  const clamped = Math.min(Math.max(value, 0), 100)

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: 4, background: 'var(--bg-inset)', borderRadius: 2 }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        animate={{ width: `${clamped}%` }}
        transition={{ duration: motionSafe ? 0.18 : 0, ease: 'easeOut' }}
        style={{
          height: '100%',
          background: 'var(--accent)',
          borderRadius: 2,
          boxShadow: 'none',
        }}
      />
    </div>
  )
}

/**
 * Milliseconds since `startTime`, ticking only while `running`.
 *
 * When the run is over it returns the measured final duration instead, so the
 * readout settles on a real number rather than continuing to count.
 */
function useElapsedMs(startTime, endTime, running) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!running || !startTime || endTime) return undefined

    // Elapsed time is measured here rather than during render: reading the clock
    // in render would be an impure call, so the loop publishes it as state.
    let raf = null
    const tick = () => {
      setElapsedMs(Date.now() - startTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(raf)
  }, [running, startTime, endTime])

  if (!startTime) return 0
  if (endTime) return endTime - startTime
  return elapsedMs
}
