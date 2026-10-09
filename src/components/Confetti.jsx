import { motion, useReducedMotion } from 'framer-motion'
import { useRef } from 'react'

const COLORS = ['var(--accent)', 'var(--text-primary)', 'var(--text-secondary)', 'var(--border-strong)', 'var(--text-primary)', 'var(--text-secondary)', 'var(--border-strong)', 'var(--accent)']

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
      style={{ display: 'none', position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}
      aria-hidden="true"
    >
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={false}
          animate={{ opacity: 0 }}
          transition={{ duration: 0 }}
          style={{
            position: 'absolute',
            left: p.left,
            top: motionSafe ? 0 : p.restTop,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.round ? '50%' : '2px',
            boxShadow: 'none',
          }}
        />
      ))}
    </div>
  )
}

export default Confetti
