import { motion } from 'framer-motion'

const CAR_COLORS = [
  { body: '#00f5ff', glow: 'rgba(0,245,255,0.6)', stripe: '#0099cc' },
  { body: '#8b5cf6', glow: 'rgba(139,92,246,0.6)', stripe: '#6d28d9' },
  { body: '#10b981', glow: 'rgba(16,185,129,0.6)', stripe: '#059669' },
  { body: '#f59e0b', glow: 'rgba(245,158,11,0.6)', stripe: '#d97706' },
  { body: '#ec4899', glow: 'rgba(236,72,153,0.6)', stripe: '#db2777' },
  { body: '#f97316', glow: 'rgba(249,115,22,0.6)', stripe: '#ea580c' },
  { body: '#06b6d4', glow: 'rgba(6,182,212,0.6)', stripe: '#0891b2' },
  { body: '#a855f7', glow: 'rgba(168,85,247,0.6)', stripe: '#9333ea' },
]

export function Car({ colorIndex = 0, state = 'idle', size = 48 }) {
  const color = CAR_COLORS[colorIndex % CAR_COLORS.length]

  const bodyAnimation = state === 'racing'
    ? { y: [0, -1, 0, 1, 0], transition: { repeat: Infinity, duration: 0.25 } }
    : state === 'crashed'
      ? { rotate: [0, -5, 10, -10, 5, 0], x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.6 } }
      : state === 'winner'
        ? { y: [0, -6, 0], transition: { repeat: Infinity, duration: 0.5 } }
        : {}

  return (
    <motion.svg
      width={size}
      height={size * 0.5}
      viewBox="0 0 96 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={bodyAnimation}
      style={{
        filter: `drop-shadow(0 0 8px ${color.glow})`,
        flexShrink: 0,
      }}
    >
      {/* Car body */}
      <rect x="4" y="22" width="88" height="18" rx="4" fill={color.body} />

      {/* Car cabin */}
      <path
        d="M20 22 L28 8 L68 8 L76 22 Z"
        fill={color.body}
        opacity="0.9"
      />

      {/* Windshield */}
      <path
        d="M30 20 L36 10 L60 10 L66 20 Z"
        fill="rgba(0,0,0,0.4)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.5"
      />

      {/* Racing stripe */}
      <rect x="4" y="28" width="88" height="4" rx="1" fill={color.stripe} opacity="0.7" />

      {/* Front headlights */}
      <ellipse cx="88" cy="25" rx="5" ry="4" fill="rgba(255,255,200,0.9)" />
      <ellipse cx="88" cy="33" rx="5" ry="4" fill="rgba(255,220,0,0.5)" />

      {/* Rear lights */}
      <ellipse cx="8" cy="25" rx="4" ry="3" fill="rgba(255,50,50,0.9)" />
      <ellipse cx="8" cy="33" rx="4" ry="3" fill="rgba(255,50,50,0.6)" />

      {/* Front wheel */}
      <circle cx="72" cy="40" r="6" fill="#1a1a2e" stroke={color.body} strokeWidth="2" />
      <circle cx="72" cy="40" r="2.5" fill={color.stripe} />

      {/* Rear wheel */}
      <circle cx="24" cy="40" r="6" fill="#1a1a2e" stroke={color.body} strokeWidth="2" />
      <circle cx="24" cy="40" r="2.5" fill={color.stripe} />

      {/* Speed lines (when racing) */}
      {state === 'racing' && (
        <g opacity="0.3">
          <line x1="0" y1="20" x2="-12" y2="20" stroke={color.body} strokeWidth="2" strokeDasharray="4 4" />
          <line x1="0" y1="28" x2="-16" y2="28" stroke={color.body} strokeWidth="1.5" strokeDasharray="3 5" />
          <line x1="0" y1="35" x2="-10" y2="35" stroke={color.body} strokeWidth="1" strokeDasharray="2 6" />
        </g>
      )}
    </motion.svg>
  )
}

export default Car
