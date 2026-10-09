import { FadeMessage } from '../components/ui/PresentationMotion'
import { entrance, hoverLift } from '../components/ui/PresentationMotion'
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Copy, Users, Gauge } from 'lucide-react'
import toast from 'react-hot-toast'
import { createTournament } from '../services/tournamentService'
import { nextPowerOfTwo } from '../utils/bracket'
import { useI18n } from '../i18n'
import { FormLayout } from '../components/ui/FormLayout'

export default function CreateTournament() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()
  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [difficulty, setDifficulty] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error(t('create.nameRequired')); return }
    setLoading(true)
    try {
      const tournament = await createTournament({
        name: name.trim(),
        maxPlayers,
        difficulty,
      })
      setCreated(tournament)
    } catch (err) {
      toast.error(err.message || t('create.failed'))
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(created.code)
    toast.success(t('common.copied'))
  }

  if (created) {
    return (
      <FormLayout title={t('create.created')} subtitle={t('shareCode.title')}>
        <motion.div data-ui-motion
          {...entrance(motionSafe, 0)}
          className="flex flex-col gap-6"
        >
          <div
            className="font-mono font-bold text-code cursor-pointer rounded-lg"
            style={{
              fontSize: 'clamp(28px, 7vw, 38px)',
              letterSpacing: '0.15em',
              padding: '22px 16px',
              background: 'rgba(177,183,192,0.06)',
              border: '1px solid var(--accent)',
            }}
            onClick={copyCode}
            role="button"
            tabIndex={0}
            aria-label={t('shareCode.copyLabel')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                copyCode()
              }
            }}
          >
            {created.code}
            <span
              className="mt-3 flex items-center justify-center gap-1.5 text-[12px] font-sans font-normal tracking-normal"
              style={{ color: 'var(--text-muted)', letterSpacing: 0 }}
            >
              <Copy size={12} aria-hidden="true" /> {t('common.clickToCopy')}
            </span>
          </div>

          <button
            type="button"
            className="btn-primary btn-block"
            style={{ fontSize: '15px', padding: '14px' }}
            onClick={() => navigate(`/lobby/${created.id}`)}
          >
            {t('create.goToLobby')}
          </button>
        </motion.div>
      </FormLayout>
    )
  }

  return (
    <FormLayout title={t('create.title')} subtitle={t('create.subtitle')}>
      <form onSubmit={handleCreate} className="flex flex-col gap-6">
        {/* Name */}
        <div>
          <label className="field-label" htmlFor="tournament-name">
            {t('create.name')}
          </label>
          <input
            id="tournament-name"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('create.namePlaceholder')}
            maxLength={60}
            autoFocus
          />
        </div>

        {/* Max players */}
        <div>
          <label className="field-label flex items-center gap-2" htmlFor="max-players">
            <Users size={14} aria-hidden="true" /> {t('create.maxPlayers')}
          </label>
          <input
            id="max-players"
            className="input-field font-mono"
            type="number"
            min={2}
            max={64}
            value={maxPlayers}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (Number.isNaN(n)) return
              setMaxPlayers(Math.min(64, Math.max(2, n)))
            }}
            style={{ maxWidth: '120px' }}
          />
          <FadeMessage className="form-help">
            {t('create.maxPlayersHint', { slots: nextPowerOfTwo(maxPlayers) })}
          </FadeMessage>
        </div>

        {/* Difficulty */}
        <fieldset>
          <legend className="field-label flex items-center gap-2">
            <Gauge size={14} aria-hidden="true" /> {t('create.difficulty')}
          </legend>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {['easy', 'medium', 'hard'].map((value) => (
              <SelectPill
                key={value}
                value={value}
                label={t(`difficulty.${value}`)}
                description={t(`difficulty.${value}Desc`)}
                selected={difficulty === value}
                onClick={() => setDifficulty(value)}
                motionSafe={motionSafe}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" className="btn-ghost sm:flex-1" onClick={() => navigate('/dashboard')}>
            {t('common.cancel')}
          </button>
          <motion.button data-ui-motion
            whileHover={hoverLift(motionSafe && !loading)}
            whileTap={motionSafe && !loading ? { y: 0, transition: { duration: 0.15, ease: 'easeOut' } } : undefined}
            type="submit"
            className="btn-primary sm:flex-2"
            disabled={loading}
          >
            {loading ? t('create.submitting') : t('create.submit')}
          </motion.button>
        </div>
      </form>
    </FormLayout>
  )
}

/** Radio-style selector: a real button group inside a <fieldset>. */
function SelectPill({ label, description, selected, onClick, motionSafe }) {
  return (
    <motion.button data-ui-motion
      whileHover={hoverLift(motionSafe)}
      whileTap={motionSafe ? { y: 0, transition: { duration: 0.15, ease: 'easeOut' } } : undefined}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className="text-left transition-all"
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-glass)'}`,
        background: selected ? 'rgba(177,183,192,0.08)' : 'var(--bg-inset)',
        boxShadow: 'none',
      }}
    >
      <span
        className="font-racing block text-sm font-bold tracking-wide"
        style={{ color: selected ? 'var(--accent)' : 'var(--text-secondary)' }}
      >
        {label}
      </span>
      {description && (
        <span
          className="difficulty-help block"
        >
          {description}
        </span>
      )}
    </motion.button>
  )
}
