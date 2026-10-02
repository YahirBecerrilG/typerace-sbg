import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

const COLORS = ['#00f5ff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#f97316', '#06b6d4', '#ef4444']

export function Confetti({ count = 80 }) {
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360,
    }))
  ).current

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{
            y: '110vh',
            x: [(Math.random() - 0.5) * 200],
            rotate: p.rotate + 720,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'linear',
          }}
          style={{
            position: 'absolute',
            left: p.left,
            top: 0,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            boxShadow: `0 0 6px ${p.color}`,
          }}
        />
      ))}
    </div>
  )
}

export default Confetti
