import { motion } from 'framer-motion'
import { Car } from './Car'

const PLAYER_COLORS = [
  { bg: 'rgba(0,245,255,0.08)', border: 'rgba(0,245,255,0.3)', text: '#00f5ff' },
  { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.3)', text: '#8b5cf6' },
  { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', text: '#10b981' },
  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  { bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.3)', text: '#ec4899' },
  { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)', text: '#f97316' },
  { bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.3)', text: '#06b6d4' },
  { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.3)', text: '#a855f7' },
]

/**
 * A single race track lane showing a player's car and progress.
 */
export function RaceTrack({ player, progress = 0, isCurrentPlayer = false, carState = 'idle', colorIndex = 0 }) {
  const colors = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  const clampedProgress = Math.min(Math.max(progress, 0), 100)
  // Car left position: 2% at start, up to ~90% at finish (reserve space for car width)
  const carLeftPercent = 2 + (clampedProgress / 100) * 86

  return (
    <div
      className="track-lane relative"
      style={{
        height: '68px',
        marginBottom: '12px',
        background: isCurrentPlayer
          ? `linear-gradient(90deg, ${colors.bg} 0%, transparent 100%)`
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isCurrentPlayer ? colors.border : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Road dashes */}
      <div className="track-dashes" />

      {/* Start line */}
      <div style={{
        position: 'absolute',
        left: '2%',
        top: 0,
        bottom: 0,
        width: '2px',
        background: 'rgba(255,255,255,0.15)',
      }} />

      {/* Finish line (checkered) */}
      <div style={{
        position: 'absolute',
        right: '2%',
        top: 0,
        bottom: 0,
        width: '16px',
        background: `repeating-linear-gradient(
          45deg,
          rgba(255,255,255,0.15) 0px,
          rgba(255,255,255,0.15) 4px,
          transparent 4px,
          transparent 8px
        )`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ fontSize: '12px' }}>🏁</span>
      </div>

      {/* Car */}
      <motion.div
        style={{
          position: 'absolute',
          left: `${carLeftPercent}%`,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
        animate={{ left: `${carLeftPercent}%` }}
        transition={{ type: 'spring', stiffness: 60, damping: 20 }}
      >
        <Car colorIndex={colorIndex} state={carState} size={56} />
      </motion.div>

      {/* Player name */}
      <div style={{
        position: 'absolute',
        right: '5%',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '2px',
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: colors.text,
          fontFamily: 'Rajdhani, sans-serif',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {player?.display_name || 'Player'}
        </span>
        <span style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {Math.round(clampedProgress)}%
        </span>
      </div>
    </div>
  )
}

export default RaceTrack
