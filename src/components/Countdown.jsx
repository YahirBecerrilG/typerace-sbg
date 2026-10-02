import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STEPS = [3, 2, 1, 'GO!']
const STEP_COLORS = {
  3: '#ef4444',
  2: '#f59e0b',
  1: '#10b981',
  'GO!': '#00f5ff',
}

/**
 * Animated 3-2-1-GO countdown overlay.
 * Calls onComplete when done.
 */
export function Countdown({ onComplete }) {
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
  const color = STEP_COLORS[current] || '#00f5ff'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(8,11,20,0.85)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{ textAlign: 'center' }}
            >
              <div
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: 'clamp(80px, 15vw, 140px)',
                  fontWeight: 900,
                  color,
                  textShadow: `0 0 60px ${color}, 0 0 120px ${color}`,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}
              >
                {current}
              </div>
              {current !== 'GO!' && (
                <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Rajdhani', fontSize: '20px', marginTop: '8px', letterSpacing: '0.2em' }}>
                  GET READY
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
