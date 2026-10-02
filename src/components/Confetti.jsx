import { motion, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'

const COLORS = ['#00f5ff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#f97316', '#06b6d4', '#ef4444']

/**
 * Celebration burst for the winner screen.
 *
 * Every piece is randomised once, in the ref initialiser, and keeps that value
 * for its whole life — re-rolling inside `animate`/`style` would make pieces
 * jitter on every re-render.
 *
 * Falls back to a single static sheet when the user asks for reduced motion: the
 * colours stay, the physics disappears.
 */
export function Confetti({ count = 80 }) {
  const motionSafe = !useReducedMotion()

  const pieces = useRef(
    Array.from({ length: count }, (_, i) => {
      const size = 6 + Math.random() * 8
      return {
        id: i,
        color: COLORS[i % COLORS.length],
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 3,
        size,
        drift: (Math.random() - 0.5) * 200,
        restTop: `${Math.random() * 100}%`,
        rotate: Math.random() * 360,
        round: Math.random() > 0.5,
      }
    })
  ).current

  return (
    <div
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}
      aria-hidden="true"
    >
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={motionSafe ? { y: -20, x: 0, rotate: 0, opacity: 1 } : false}
          animate={
            motionSafe
              ? {
                  y: '110vh',
                  x: [p.drift],
                  rotate: p.rotate + 720,
                  opacity: [1, 1, 0],
                }
              : { opacity: 0.9 }
          }
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'linear',
          }}
          style={{
            position: 'absolute',
            left: p.left,
            top: motionSafe ? 0 : p.restTop,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            boxShadow: `0 0 6px ${p.color}`,
          }}
        />
      ))}
    </div>
  )
}

export default Confetti