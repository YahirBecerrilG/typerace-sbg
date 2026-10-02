import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../services/supabase'
import { Trophy, Plus, LogIn, LogOut, ChevronRight } from 'lucide-react'
import { TOURNAMENT_STATUS_LABEL, placementLabel } from '../utils/bracket'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const [entries, setEntries] = useState([])
  const [loadingTournaments, setLoadingTournaments] = useState(true)

  const fetchRecentTournaments = useCallback(async () => {
    if (!user) {
      setEntries([])
      setLoadingTournaments(false)
      return
    }
    try {
      // Hosting and playing are two separate relationships: a host has no
      // tournament_players row at all, so the host list is read from
      // tournaments.host_id and the playing list from the participant table.
      const [hosted, joined] = await Promise.all([
        supabase
          .from('tournaments')
          .select('*')
          .eq('host_id', user.id)
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('tournament_players')
          .select('status, placement, tournaments(*)')
          .eq('user_id', user.id)
          .eq('role', 'player')
          .order('joined_at', { ascending: false })
          .limit(12),
      ])

      if (hosted.error) throw hosted.error
      if (joined.error) throw joined.error

      const hostedEntries = (hosted.data || [])
        .filter((t) => t)
        .map((t) => ({ tournament: t, role: 'admin', myStatus: null, placement: null }))

      const playingEntries = (joined.data || [])
        .map((d) => ({ tournament: d.tournaments, role: 'player', myStatus: d.status, placement: d.placement }))
        .filter((d) => d.tournament)

      // Never show the same tournament twice if a host somehow also has a
      // leftover participant row on an old, already-run bracket.
      const hostedIds = new Set(hostedEntries.map((e) => e.tournament.id))
      setEntries([
        ...hostedEntries,
        ...playingEntries.filter((e) => !hostedIds.has(e.tournament.id)),
      ])
    } catch {
      // ignore
    } finally {
      setLoadingTournaments(false)
    }
  }, [user])

  useEffect(() => {
    fetchRecentTournaments()
  }, [fetchRecentTournaments])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success('Signed out.')
  }

  const displayName = profile?.display_name || user?.user_metadata?.display_name || 'Racer'

  const hosting = entries.filter((e) => e.role === 'admin')
  const playing = entries.filter((e) => e.role === 'player')

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
          ) : entries.length === 0 ? (
            <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
              <Trophy size={36} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                No tournaments yet. Create or join one to get started!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {hosting.length > 0 && (
                <TournamentGroup
                  title="Hosting"
                  hint="You are the admin of these tournaments."
                  color="#f59e0b"
                  entries={hosting}
                />
              )}
              {playing.length > 0 && (
                <TournamentGroup
                  title="Playing"
                  hint="You joined these as a player."
                  color="#00f5ff"
                  entries={playing}
                />
              )}
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

function TournamentGroup({ title, hint, color, entries }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
        <span style={{
          fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 800,
          letterSpacing: '0.12em', textTransform: 'uppercase', color,
        }}
        >
          {title}
        </span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{hint}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {entries.map((e) => (
          <TournamentRow
            key={e.tournament.id}
            tournament={e.tournament}
            isAdmin={e.role === 'admin'}
            myStatus={e.myStatus}
            onClick={() => navigate(routeFor(e.tournament))}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Tournament Row ───────────────────────────────────────────────────────────
const STATUS_COLORS = {
  lobby: '#f59e0b',
  practice: '#f59e0b',
  registration_closed: '#a855f7',
  bracket_ready: '#00f5ff',
  round_active: '#10b981',
  completed: '#8b5cf6',
}

/** A started tournament belongs on the overview, not the lobby. */
function routeFor(t) {
  return ['bracket_ready', 'round_active', 'completed'].includes(t.status)
    ? `/tournament/${t.id}`
    : `/lobby/${t.id}`
}

function TournamentRow({ tournament, onClick, isAdmin, myStatus }) {
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
          {isAdmin && (
            <span style={{
              fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em',
              color: '#f59e0b', background: 'rgba(245,158,11,0.12)',
              padding: '2px 7px', borderRadius: '4px',
              border: '1px solid rgba(245,158,11,0.25)', flexShrink: 0,
            }}>
              HOST
            </span>
          )}
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
            ● {TOURNAMENT_STATUS_LABEL[tournament.status] || tournament.status}
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textTransform: 'capitalize' }}>
            {tournament.difficulty}
          </span>
          {myStatus && myStatus !== 'active' && (
            <span style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
            }}>
              {placementLabel(myStatus.placement) || myStatus}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
    </motion.div>
  )
}
