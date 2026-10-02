import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../services/supabase'
import { Trophy, Plus, LogIn, LogOut, Zap, Clock, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const [recentTournaments, setRecentTournaments] = useState([])
  const [loadingTournaments, setLoadingTournaments] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchRecentTournaments()
  }, [user])

  const fetchRecentTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournament_players')
        .select('tournaments(*)')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })
        .limit(5)

      if (error) throw error
      setRecentTournaments(data?.map((d) => d.tournaments).filter(Boolean) || [])
    } catch {
      // ignore
    } finally {
      setLoadingTournaments(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success('Signed out.')
  }

  const displayName = profile?.display_name || user?.user_metadata?.display_name || 'Racer'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080b14',
      position: 'relative',
    }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />

      {/* Header */}
      <header style={{
        position: 'relative',
        zIndex: 1,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,11,20,0.8)',
        backdropFilter: 'blur(12px)',
        padding: '0 24px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div className="gradient-text" style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '24px',
          fontWeight: 900,
        }}>
          TYPERACER
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
            {displayName}
          </span>
          <button onClick={handleLogout} className="btn-ghost" style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: '1000px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: '48px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', color: '#10b981', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              ● Online
            </span>
          </div>
          <h1 style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 800,
            color: 'white',
            lineHeight: 1.1,
          }}>
            Welcome back,{' '}
            <span className="neon-text-cyan">{displayName}</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '8px', fontSize: '16px' }}>
            Ready to race? Create a new tournament or join an existing one.
          </p>
        </motion.div>

        {/* Action cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '48px' }}>
          <ActionCard
            icon={<Plus size={28} />}
            title="Create Tournament"
            description="Host a new typing tournament and invite players with a code."
            color="#00f5ff"
            onClick={() => navigate('/create-tournament')}
            delay={0.1}
          />
          <ActionCard
            icon={<LogIn size={28} />}
            title="Join Tournament"
            description="Enter a tournament code to join a race already in progress."
            color="#8b5cf6"
            onClick={() => navigate('/join-tournament')}
            delay={0.2}
          />
        </div>

        {/* Recent tournaments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '20px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
            marginBottom: '16px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            Recent Tournaments
          </h2>

          {loadingTournaments ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>Loading...</div>
          ) : recentTournaments.length === 0 ? (
            <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
              <Trophy size={36} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                No tournaments yet. Create or join one to get started!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentTournaments.map((t) => (
                <TournamentRow key={t.id} tournament={t} onClick={() => navigate(`/lobby/${t.id}`)} />
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  )
}

// ─── Action Card ─────────────────────────────────────────────────────────────
function ActionCard({ icon, title, description, color, onClick, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -4, scale: 1.02 }}
      onClick={onClick}
      className="glass-card"
      style={{
        padding: '28px',
        cursor: 'pointer',
        borderColor: `${color}22`,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{
        width: '52px',
        height: '52px',
        borderRadius: '12px',
        background: `${color}15`,
        border: `1px solid ${color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        marginBottom: '16px',
      }}>
        {icon}
      </div>
      <h3 style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '20px',
        fontWeight: 700,
        color: 'white',
        marginBottom: '8px',
      }}>
        {title}
      </h3>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', lineHeight: 1.6 }}>
        {description}
      </p>
    </motion.div>
  )
}

// ─── Tournament Row ───────────────────────────────────────────────────────────
const STATUS_COLORS = { lobby: '#f59e0b', active: '#10b981', finished: '#8b5cf6' }

function TournamentRow({ tournament, onClick }) {
  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={onClick}
      className="glass-card"
      style={{
        padding: '16px 20px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '16px',
            fontWeight: 700,
            color: 'white',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {tournament.name}
          </span>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            color: '#00f5ff',
            background: 'rgba(0,245,255,0.08)',
            padding: '2px 8px',
            borderRadius: '4px',
            flexShrink: 0,
          }}>
            {tournament.code}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{
            fontSize: '12px',
            color: STATUS_COLORS[tournament.status] || 'rgba(255,255,255,0.4)',
            textTransform: 'capitalize',
          }}>
            ● {tournament.status}
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textTransform: 'capitalize' }}>
            {tournament.difficulty}
          </span>
        </div>
      </div>
      <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
    </motion.div>
  )
}
