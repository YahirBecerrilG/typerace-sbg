import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTournamentRealtime } from '../hooks/useTournament'
import { usePostgresChanges } from '../hooks/useRealtime'
import { getTournamentWithPlayers, startTournament } from '../services/tournamentService'
import { supabase } from '../services/supabase'
import { Copy, Play, Users, Crown, Check, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const PLAYER_COLORS = ['#00f5ff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#f97316', '#06b6d4', '#a855f7']

export default function Lobby() {
  const { tournamentId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const isHost = tournament?.host_id === user?.id

  const fetchData = useCallback(async () => {
    try {
      const data = await getTournamentWithPlayers(tournamentId)
      setTournament(data)
      setPlayers(data.tournament_players || [])
    } catch (err) {
      toast.error('Failed to load lobby.')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Realtime: tournament broadcast events ───────────────────────────────
  const { broadcast } = useTournamentRealtime({
    tournamentId,
    onEvent: (event, payload) => {
      if (event === 'TOURNAMENT_STARTED') {
        toast.success('Tournament starting!', { icon: '🏁' })
        navigate(`/tournament/${tournamentId}`)
      }
      if (event === 'PLAYER_JOINED') {
        fetchData()
      }
    },
    enabled: !!tournamentId,
  })

  // ─── Realtime: DB changes for tournament_players ─────────────────────────
  usePostgresChanges({
    table: 'tournament_players',
    filter: `tournament_id=eq.${tournamentId}`,
    onInsert: () => fetchData(),
    onUpdate: () => fetchData(),
    enabled: !!tournamentId,
  })

  // ─── Realtime: DB changes for tournament status ──────────────────────────
  usePostgresChanges({
    table: 'tournaments',
    filter: `id=eq.${tournamentId}`,
    onUpdate: (newData) => {
      setTournament((prev) => ({ ...prev, ...newData }))
      if (newData.status === 'active') {
        navigate(`/tournament/${tournamentId}`)
      }
    },
    enabled: !!tournamentId,
  })

  const handleStart = async () => {
    setStarting(true)
    try {
      await startTournament(tournamentId, user.id)
      await broadcast('TOURNAMENT_STARTED', { tournamentId })
      navigate(`/tournament/${tournamentId}`)
    } catch (err) {
      toast.error(err.message || 'Failed to start tournament.')
    } finally {
      setStarting(false)
    }
  }

  const copyCode = () => {
    if (!tournament?.code) return
    navigator.clipboard.writeText(tournament.code)
    toast.success('Code copied!')
  }

  if (loading) {
    return <LoadingScreen />
  }

  if (!tournament) {
    return <div style={{ color: 'white', padding: '40px' }}>Tournament not found.</div>
  }

  const canStart = isHost && players.length >= 2 && tournament.status === 'lobby'

  return (
    <div style={{ minHeight: '100vh', background: '#080b14', position: 'relative' }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: '40px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '12px',
                color: '#f59e0b',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                ● Waiting for players
              </div>
              <h1 style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: 'clamp(24px, 4vw, 40px)',
                fontWeight: 900,
                color: 'white',
                lineHeight: 1,
              }}>
                {tournament.name}
              </h1>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>
                  {tournament.difficulty} difficulty
                </span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>•</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                  Max {tournament.max_players} players
                </span>
              </div>
            </div>

            {/* Code badge */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              onClick={copyCode}
              style={{
                background: 'rgba(0,245,255,0.06)',
                border: '1px solid rgba(0,245,255,0.25)',
                borderRadius: '12px',
                padding: '14px 20px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', marginBottom: '4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Tournament Code
              </div>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '24px',
                fontWeight: 700,
                color: '#00f5ff',
                letterSpacing: '0.12em',
              }}>
                {tournament.code}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Copy size={10} /> Click to copy
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Players count */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
        }}>
          <Users size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '18px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
          }}>
            Players: <span style={{ color: '#00f5ff' }}>{players.length}</span> / {tournament.max_players}
          </span>
        </div>

        {/* Players list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
          <AnimatePresence mode="popLayout">
            {players.map((player, idx) => (
              <PlayerCard
                key={player.id}
                player={player}
                index={idx}
                isHost={player.user_id === tournament.host_id}
                isCurrentUser={player.user_id === user?.id}
                colorIndex={idx}
              />
            ))}
          </AnimatePresence>

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, tournament.max_players - players.length) }, (_, i) => (
            <motion.div
              key={`empty-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                height: '60px',
                border: '1px dashed rgba(255,255,255,0.1)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '20px',
                color: 'rgba(255,255,255,0.2)',
                fontSize: '14px',
                fontStyle: 'italic',
              }}
            >
              Waiting for player...
            </motion.div>
          ))}
        </div>

        {/* Start button (host only) */}
        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!canStart && (
              <p style={{
                textAlign: 'center',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '13px',
              }}>
                {players.length < 2
                  ? 'Need at least 2 players to start'
                  : 'Waiting for players to join...'}
              </p>
            )}
            <motion.button
              whileHover={canStart ? { scale: 1.02, y: -2 } : {}}
              whileTap={canStart ? { scale: 0.98 } : {}}
              className="btn-primary"
              disabled={!canStart || starting}
              onClick={handleStart}
              style={{
                fontSize: '17px',
                padding: '16px',
                opacity: canStart ? 1 : 0.4,
                cursor: canStart ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              <Play size={20} />
              {starting ? 'Starting Tournament...' : 'Start Tournament'}
            </motion.button>
          </div>
        )}

        {!isHost && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '10px',
          }}>
            <Clock size={18} style={{ color: 'rgba(255,255,255,0.3)', margin: '0 auto 8px', display: 'block' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
              Waiting for the host to start the tournament...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerCard({ player, index, isHost, isCurrentUser, colorIndex }) {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  const name = player.profiles?.display_name || 'Player'

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 20px',
        background: isCurrentUser ? `${color}0a` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isCurrentUser ? `${color}33` : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '10px',
      }}
    >
      {/* Avatar circle */}
      <div style={{
        width: '38px',
        height: '38px',
        borderRadius: '50%',
        background: `${color}20`,
        border: `2px solid ${color}55`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Rajdhani, sans-serif',
        fontWeight: 700,
        fontSize: '16px',
        color,
        flexShrink: 0,
      }}>
        {name[0]?.toUpperCase()}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '16px',
            fontWeight: 700,
            color: isCurrentUser ? color : 'rgba(255,255,255,0.85)',
          }}>
            {name}
          </span>
          {isHost && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(245,158,11,0.25)' }}>
              <Crown size={10} /> Host
            </span>
          )}
          {isCurrentUser && (
            <span style={{ fontSize: '11px', color: color, background: `${color}15`, padding: '2px 8px', borderRadius: '999px', border: `1px solid ${color}33` }}>
              You
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontSize: '12px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
        Ready
      </div>
    </motion.div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '3px solid rgba(0,245,255,0.2)',
          borderTopColor: '#00f5ff',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Loading lobby...</p>
      </div>
    </div>
  )
}
