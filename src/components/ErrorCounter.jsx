import { motion, useReducedMotion } from 'framer-motion'
import { MAX_ERRORS } from '../utils/typing'
import { useI18n } from '../i18n'

/**
 * Error counter display with visual feedback.
 *
 * The dots are driven by MAX_ERRORS, so the crash threshold can never drift out
 * of sync with the race rules — this component only renders it.
 */
export function ErrorCounter({ errors = 0, shakeTrigger = 0, crashTrigger: _crashTrigger }) {
  const motionSafe = !useReducedMotion()
  const { t } = useI18n()
  const dots = Array.from({ length: MAX_ERRORS }, (_, i) => i < errors)

  return (
    <motion.div
      key={`shake-${shakeTrigger}`}
      animate={shakeTrigger > 0 ? {
        borderColor: 'var(--danger)',
        transition: { duration: motionSafe ? 0.18 : 0, ease: 'easeOut' }
      } : {}}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 16px',
        background: errors > 0
          ? `rgba(239,68,68,${0.05 + errors * 0.05})`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${errors > 0 ? `rgba(239,68,68,${0.2 + errors * 0.15})` : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '10px',
        transition: 'all 0.2s ease',
      }}
    >
      <span
        className="font-racing"
        style={{
          fontSize: '13px',
          fontWeight: 600,
        color: errors > 0 ? 'var(--danger)' : 'rgba(255,255,255,0.5)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {t('race.errors')}
      </span>
      <div style={{ display: 'flex', gap: '5px' }}>
        {dots.map((filled, i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{
              scale: 1,
              backgroundColor: filled ? 'var(--danger)' : 'rgba(255,255,255,0.1)',
              boxShadow: 'none',
            }}
            transition={{ duration: motionSafe ? 0.18 : 0, ease: 'easeOut' }}
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              border: `1px solid ${filled ? 'var(--danger)' : 'rgba(255,255,255,0.2)'}`,
            }}
          />
        ))}
      </div>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '13px',
        color: errors > 0 ? 'var(--danger)' : 'rgba(255,255,255,0.4)',
        fontWeight: 600,
      }}>
        {errors}/{MAX_ERRORS}
      </span>
    </motion.div>
  )
}

export default ErrorCounter
