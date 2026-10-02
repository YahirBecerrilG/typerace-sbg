import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createTournament } from '../services/tournamentService'
import { Copy, Zap, Users, Gauge } from 'lucide-react'
import toast from 'react-hot-toast'

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy', description: 'Short, simple phrases', color: '#10b981' },
  { value: 'medium', label: 'Medium', description: 'Moderate complexity', color: '#f59e0b' },
  { value: 'hard', label: 'Hard', description: 'Complex, long phrases', color: '#ef4444' },
]

const PLAYER_OPTIONS = [2, 4, 8, 16]

export default function CreateTournament() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [difficulty, setDifficulty] = useState('medium')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Tournament name is required.'); return }
    setLoading(true)
    try {
      const tournament = await createTournament({
        name: name.trim(),
        maxPlayers,
        difficulty,
        hostId: user.id,
      })
      setCreated(tournament)
    } catch (err) {
      toast.error(err.message || 'Failed to create tournament.')
    } finally {
      setLoading(false)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(created.code)
    toast.success('Code copied!')
  }

  if (created) {
    return (
      <PageLayout>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card"
          style={{ padding: '48px', textAlign: 'center', maxWidth: '480px' }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏁</div>
          <h2 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '28px', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
            Tournament Created!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '32px', fontSize: '15px' }}>
            Share this code with your players.
          </p>
          <div style={{
            background: 'rgba(0,245,255,0.06)',
            border: '1px solid rgba(0,245,255,0.3)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            cursor: 'pointer',
          }} onClick={copyCode}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '36px', fontWeight: 700, color: '#00f5ff', letterSpacing: '0.15em' }}>
              {created.code}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Copy size={12} /> Click to copy
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="btn-primary"
            style={{ width: '100%', fontSize: '15px', padding: '14px' }}
            onClick={() => navigate(`/lobby/${created.id}`)}
          >
            Go to Lobby
          </motion.button>
        </motion.div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
        style={{ padding: '40px', width: '100%', maxWidth: '520px' }}
      >
        <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '32px', fontWeight: 800, color: 'white', marginBottom: '6px' }}>
          Create Tournament
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '32px' }}>
          Set up your race and invite players.
        </p>

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Name */}
          <div>
            <label className="field-label">Tournament Name</label>
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday Night Speed Run"
              maxLength={60}
              autoFocus
            />
          </div>

          {/* Max players */}
          <div>
            <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <Users size={14} /> Max Players
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {PLAYER_OPTIONS.map((n) => (
                <SelectPill
                  key={n}
                  label={`${n} Players`}
                  selected={maxPlayers === n}
                  onClick={() => setMaxPlayers(n)}
                  color="#00f5ff"
                />
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <Gauge size={14} /> Difficulty
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {DIFFICULTIES.map((d) => (
                <SelectPill
                  key={d.value}
                  label={d.label}
                  description={d.description}
                  selected={difficulty === d.value}
                  onClick={() => setDifficulty(d.value)}
                  color={d.color}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="btn-ghost" onClick={() => navigate('/dashboard')} style={{ flex: 1 }}>
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ flex: 2, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Creating...' : 'Create Tournament'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </PageLayout>
  )
}

function SelectPill({ label, description, selected, onClick, color }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px',
        borderRadius: '10px',
        border: `1px solid ${selected ? color : 'rgba(255,255,255,0.1)'}`,
        background: selected ? `${color}15` : 'transparent',
        color: selected ? color : 'rgba(255,255,255,0.5)',
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.15s',
        textAlign: 'left',
      }}
    >
      <div>{label}</div>
      {description && <div style={{ fontSize: '11px', opacity: 0.7, fontWeight: 400, fontFamily: 'Inter, sans-serif', marginTop: '2px' }}>{description}</div>}
    </motion.button>
  )
}

function PageLayout({ children }) {
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
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}
