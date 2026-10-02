import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Hash } from 'lucide-react'
import toast from 'react-hot-toast'
import { joinTournament } from '../services/tournamentService'
import { useI18n } from '../i18n'
import { FormLayout } from '../components/ui/FormLayout'

export default function JoinTournament() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!code.trim()) { setError(t('join.codeRequired')); return }
    setError('')
    setLoading(true)
    try {
      // The server refuses the join once registration is closed, and decides
      // whether this was a new join or an existing membership.
      const result = await joinTournament({ code: code.trim() })
      toast.success(result?.already_joined ? t('join.alreadyJoined') : t('join.success'))
      navigate(`/lobby/${result.tournament_id}`)
    } catch (err) {
      // Server messages stay verbatim; only the client-side fallback is local.
      setError(err.message || t('join.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormLayout title={t('join.title')} subtitle={t('join.subtitle')}>
      <span
        className="mb-8 grid h-14 w-14 place-items-center rounded-2xl"
        style={{
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid var(--border-violet)',
          color: 'var(--violet)',
        }}
        aria-hidden="true"
      >
        <Hash size={26} />
      </span>

      <form onSubmit={handleJoin} className="flex flex-col gap-5">
        <div>
          <label className="sr-only" htmlFor="tournament-code">
            {t('shareCode.copyLabel')}
          </label>
          <input
            id="tournament-code"
            className="input-field font-mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('join.placeholder')}
            maxLength={7}
            autoFocus
            aria-invalid={error ? 'true' : undefined}
            style={{
              textAlign: 'center',
              fontSize: '24px',
              fontWeight: 700,
              letterSpacing: '0.15em',
              padding: '20px',
            }}
          />
          {error && (
            <p className="field-error text-center" role="alert">
              {error}
            </p>
          )}
        </div>

        <motion.button
          whileHover={motionSafe && !loading ? { scale: 1.02 } : undefined}
          whileTap={motionSafe && !loading ? { scale: 0.98 } : undefined}
          type="submit"
          className="btn-primary btn-block"
          disabled={loading}
          style={{ fontSize: '15px', padding: '14px' }}
        >
          {loading ? t('join.submitting') : t('join.submit')}
        </motion.button>

        <button type="button" className="btn-ghost btn-block" onClick={() => navigate('/dashboard')}>
          {t('common.backToDashboard')}
        </button>
      </form>
    </FormLayout>
  )
}