import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { joinTournament } from '../services/tournamentService'
import { Hash } from 'lucide-react'
import toast from 'react-hot-toast'

export default function JoinTournament() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!code.trim()) { setError('Enter a tournament code.'); return }
    setError('')
    setLoading(true)
    try {
      const tournament = await joinTournament({ code: code.trim(), userId: user.id })
      toast.success(`Joined "${tournament.name}"!`)
      navigate(`/lobby/${tournament.id}`)
    } catch (err) {
      setError(err.message || 'Failed to join tournament.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080b14',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
    }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
        style={{ padding: '48px', width: '100%', maxWidth: '440px', position: 'relative', zIndex: 1 }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: 'rgba(139,92,246,0.15)',
            border: '1px solid rgba(139,92,246,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#8b5cf6',
          }}>
            <Hash size={28} />
          </div>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
            Join Tournament
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
            Enter the code shared by the tournament host.
          </p>
        </div>

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <input
              className="input-field"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="TR-XXXX"
              maxLength={7}
              autoFocus
              style={{
                textAlign: 'center',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '0.15em',
                padding: '20px',
                ...(error ? { borderColor: '#ef4444' } : {}),
              }}
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>
                {error}
              </p>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ fontSize: '15px', padding: '14px', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Joining...' : 'Join Tournament'}
          </motion.button>

          <button
            type="button"
            className="btn-ghost"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </button>
        </form>
      </motion.div>
    </div>
  )
}
