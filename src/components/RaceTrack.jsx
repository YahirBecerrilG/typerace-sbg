import { motion } from 'framer-motion'
import { Car } from './Car'
import { useI18n } from '../i18n'

const PLAYER_COLORS = [
  { text: '#00f5ff', fill: 'rgba(0,245,255,0.28)', glow: 'rgba(0,245,255,0.45)' },
  { text: '#8b5cf6', fill: 'rgba(139,92,246,0.28)', glow: 'rgba(139,92,246,0.45)' },
  { text: '#10b981', fill: 'rgba(16,185,129,0.28)', glow: 'rgba(16,185,129,0.45)' },
  { text: '#f59e0b', fill: 'rgba(245,158,11,0.28)', glow: 'rgba(245,158,11,0.45)' },
  { text: '#ec4899', fill: 'rgba(236,72,153,0.28)', glow: 'rgba(236,72,153,0.45)' },
  { text: '#f97316', fill: 'rgba(249,115,22,0.28)', glow: 'rgba(249,115,22,0.45)' },
  { text: '#06b6d4', fill: 'rgba(6,182,212,0.28)', glow: 'rgba(6,182,212,0.45)' },
  { text: '#a855f7', fill: 'rgba(168,85,247,0.28)', glow: 'rgba(168,85,247,0.45)' },
]

/**
 * A single race track lane showing a player's car and progress.
 *
 * Presentation only — same props, same maths. The car sits at 2%..88% so there
 * is always room for the car itself at the finish line, and the nameplate lives
 * outside the driving area so it can never overlap the car.
 */
export function RaceTrack({ player, progress = 0, isCurrentPlayer = false, carState = 'idle', colorIndex = 0 }) {
  const { t } = useI18n()
  const colors = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  const clampedProgress = Math.min(Math.max(progress, 0), 100)
  // Car left position: 2% at start, up to ~88% at finish (reserve space for car width)
  const carLeftPercent = 2 + (clampedProgress / 100) * 86

  const name = player?.display_name || t('common.player')
  const initial = name[0]?.toUpperCase()

  return (
    <div
      className="track-lane"
      style={{
        height: '92px',
        marginBottom: '14px',
        border: `1px solid ${isCurrentPlayer ? 'rgba(0,245,255,0.24)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isCurrentPlayer ? `0 0 34px -14px ${colors.glow}` : 'none',
      }}
    >
      {/* Road surface and travelled distance */}
      <div className="track-road" />
      <div
        className="track-fill"
        style={{
          width: `${clampedProgress * 0.86}%`,
          background: isCurrentPlayer
            ? `linear-gradient(90deg, ${colors.fill}, ${colors.text})`
            : 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.2))',
          boxShadow: isCurrentPlayer ? `0 0 14px ${colors.glow}` : 'none',
        }}
        aria-hidden="true"
      />

      {/* Start line */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0"
        style={{ left: '2%', width: '2px', background: 'rgba(255,255,255,0.16)' }}
      />

      {/* Finish line (checkered) */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-[2%] flex w-[16px] items-center justify-center"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 4px, transparent 4px, transparent 8px)',
        }}
      >
        <span style={{ fontSize: '13px' }}>🏁</span>
      </span>

      {/* Nameplate — left, outside the driving area. */}
      <div
        className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2.5"
        style={{ left: '5%' }}
      >
        <span
          className="font-racing grid shrink-0 place-items-center rounded-full font-bold"
          style={{
            width: '32px',
            height: '32px',
            fontSize: '13px',
            color: colors.text,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${isCurrentPlayer ? colors.glow : 'var(--border-glass)'}`,
          }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <span
          className="font-racing max-w-[160px] truncate text-[12px] font-bold uppercase"
          style={{ color: colors.text, letterSpacing: '0.06em' }}
          title={name}
        >
          {name}
        </span>
      </div>

      {/* Car */}
      <motion.div
        className="absolute top-1/2 -translate-y-1/2"
        style={{ left: `calc(${carLeftPercent}% - 28px)` }}
        animate={{ left: `calc(${carLeftPercent}% - 28px)` }}
        transition={{ type: 'spring', stiffness: 60, damping: 20 }}
      >
        <Car colorIndex={colorIndex} state={carState} size={56} />
      </motion.div>

      {/* Live percentage */}
      <span
        className="num absolute top-1/2 -translate-y-1/2 text-[12px]"
        style={{ right: '8%', color: 'var(--text-muted)' }}
      >
        {Math.round(clampedProgress)}%
      </span>
    </div>
  )
}

export default RaceTrack