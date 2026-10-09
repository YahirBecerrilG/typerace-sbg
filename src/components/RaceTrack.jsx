import { motion, useReducedMotion } from 'framer-motion'
import { Car } from './Car'
import { useI18n } from '../i18n'

const PLAYER_COLORS = [
  { text: 'var(--accent)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
  { text: 'var(--text-secondary)', fill: 'rgba(177,183,192,0.28)', glow: 'var(--border-strong)' },
]

/**
 * A single race track lane showing a player's car and progress.
 *
 * Presentation only — same props, same maths. The car sits at 2%..88% so there
 * is always room for the car itself at the finish line, and the nameplate lives
 * outside the driving area so it can never overlap the car.
 */
export function RaceTrack({ player, progress = 0, isCurrentPlayer = false, carState = 'idle', colorIndex = 0 }) {
  const motionSafe = !useReducedMotion()
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
        border: `1px solid ${isCurrentPlayer ? 'rgba(177,183,192,0.24)' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: 'none',
      }}
    >
      {/* Road surface and travelled distance */}
      <div className="track-road" />
      <div
        className="track-fill"
        style={{
          width: `${clampedProgress * 0.86}%`,
          background: isCurrentPlayer ? 'var(--accent)' : 'var(--text-muted)',
          boxShadow: 'none',
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
            'var(--border-strong)',
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
        transition={{ duration: motionSafe ? 0.18 : 0, ease: 'easeOut' }}
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
