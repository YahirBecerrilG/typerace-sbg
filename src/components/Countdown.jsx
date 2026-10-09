import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useI18n } from '../i18n'

const STEPS = [3, 2, 1, 'GO!']
const STEP_COLORS = {
  3: 'var(--text-primary)',
  2: 'var(--text-primary)',
  1: 'var(--text-primary)',
  'GO!': 'var(--accent)',
}

/**
 * Animated 3-2-1-GO countdown overlay.
 * Calls onComplete when done.
 */
export function Countdown({ onComplete }) {
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()
  const [stepIndex, setStepIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timers = []

    STEPS.forEach((_, idx) => {
      timers.push(
        setTimeout(() => {
          setStepIndex(idx)
        }, idx * 1000)
      )
    })

    // After last step, complete
    timers.push(
      setTimeout(() => {
        setVisible(false)
        setTimeout(() => onComplete?.(), 300)
      }, STEPS.length * 1000)
    )

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  const current = STEPS[stepIndex]
  const color = STEP_COLORS[current] || 'var(--accent)'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={motionSafe ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={motionSafe ? { opacity: 0 } : undefined}
          transition={{ duration: motionSafe ? 0.3 : 0, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(8,11,20,0.85)',
            backdropFilter: 'none',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={motionSafe ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={motionSafe ? { opacity: 0 } : undefined}
              transition={{ duration: motionSafe ? 0.3 : 0, ease: 'easeOut' }}
              style={{ textAlign: 'center' }}
            >
              <div
                className="font-racing"
                style={{
                  fontSize: 'clamp(80px, 15vw, 140px)',
                  fontWeight: 900,
                  color,
                  textShadow: 'none',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {current}
              </div>
              {current !== 'GO!' && (
                <div
                  className="font-racing"
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '20px',
                    marginTop: '8px',
                    letterSpacing: '0.2em',
                  }}
                >
                  {t('race.getReady')}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Countdown
