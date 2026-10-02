import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTournamentRealtime } from '../hooks/useTournament'
import { usePostgresChanges } from '../hooks/useRealtime'
import {
  getTournamentWithPlayers,
  startTournament,
  closeRegistration,
  reopenRegistration,
  leaveTournament,
} from '../services/tournamentService'
import { Copy, Play, Users, Crown, Clock, Lock, LogOut, Dumbbell } from 'lucide-react'
import { TOURNAMENT_STATUS_LABEL } from '../utils/bracket'
import toast from 'react-hot-toast'

const PLAYER_COLORS = ['#00f5ff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#f97316', '#06b6d4', '#a855f7']

export default function Lobby() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const isHost = tournament?.host_id === user?.id

  const fetchData = useCallback(async () => {
    try {
      const data = await getTournamentWithPlayers(tournamentId)
      setTournament(data)
      // `players` already excludes the host: hosts have no participant row.
      setPlayers(data.players || [])
      setLoadError(null)
    } catch (err) {
      // PGRST116 = no row matched. Anything else is a real failure
      // (bad relationship, RLS, network) and must not look like "not found".
      if (err.code === 'PGRST116') {
        setLoadError(null)
      } else {
        console.error('Lobby load error:', err)
        setLoadError(err)
        toast.error(err.message || 'Failed to load lobby.')
      }
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
    onEvent: (event) => {
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
      // The bracket exists now: leave the lobby for the tournament view.
      if (['bracket_ready', 'round_active', 'completed'].includes(newData.status)) {
        navigate(`/tournament/${tournamentId}`, { replace: true })
      }
    },
    enabled: !!tournamentId,
  })

  const handleStart = async () => {
    setStarting(true)
    try {
      await startTournament(tournamentId)
      await broadcast('TOURNAMENT_STARTED', { tournamentId })
      navigate(`/tournament/${tournamentId}`, { replace: true })
    } catch (err) {
      toast.error(err.message || 'Failed to start tournament.')
    } finally {
      setStarting(false)
    }
  }

  const handleCloseRegistration = async () => {
    setBusy(true)
    try {
      await closeRegistration(tournamentId)
      toast.success('Registration closed. No new players can join.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleReopen = async () => {
    setBusy(true)
    try {
      await reopenRegistration(tournamentId)
      toast.success('Registration reopened.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!window.confirm('Leave this tournament? Your matches will be forfeited.')) return
    setBusy(true)
    try {
      await leaveTournament(tournamentId)
      toast.success('You left the tournament.')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
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
    return (
      <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '520px' }}>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '28px', fontWeight: 800, color: 'white', marginBottom: '10px' }}>
            {loadError ? 'Could not load tournament' : 'Tournament not found'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', marginBottom: loadError ? '8px' : '24px' }}>
            {loadError
              ? loadError.message
              : 'This tournament does not exist, or the link is no longer valid.'}
          </p>
          {loadError?.code && (
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#ef4444', marginBottom: '24px' }}>
              {loadError.code}
            </p>
          )}
          <button className="btn-primary" onClick={() => navigate('/dashboard')} style={{ fontSize: '15px', padding: '14px 28px' }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const registrationOpen = ['lobby', 'practice'].includes(tournament.status)
  // Closing registration locks the roster; it does not remove the host's
  // ability to start. START stays available in registration_closed.
  const startableStates = ['lobby', 'practice', 'registration_closed']
  const canShowStart = startableStates.includes(tournament.status)
  const activePlayers = players.filter((p) => p.status === 'active')
  const canStart = isHost && activePlayers.length >= 2 && canShowStart
  const practiceRanking = [...activePlayers]
    .filter((p) => p.practice_runs > 0)
    .sort((a, b) =>
      (Number(b.practice_score) || 0) - (Number(a.practice_score) || 0) ||
      (Number(b.best_wpm) || 0) - (Number(a.best_wpm) || 0) ||
      String(a.profiles?.display_name || '').localeCompare(String(b.profiles?.display_name || ''))
    )

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
                color: registrationOpen ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                ● {TOURNAMENT_STATUS_LABEL[tournament.status] || tournament.status}
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

        {/* Players count — participants only, the host is never counted */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}>
          <Users size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '18px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
          }}>
            Players: <span style={{ color: '#00f5ff' }}>{activePlayers.length}</span> / {tournament.max_players}
          </span>
          {isHost && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#f59e0b' }}>
              <Crown size={12} /> You are the host — you run this tournament, you do not compete in it
            </span>
          )}
        </div>

        {/* Practice entry: never affects matches, only the seeding order.
            The host runs the tournament and never competes in it, so the
            button is not offered and the host is absent from the ranking. */}
        {!isHost && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
            padding: '14px 18px', marginBottom: '24px',
            background: 'rgba(0,245,255,0.05)',
            border: '1px solid rgba(0,245,255,0.18)',
            borderRadius: '10px',
          }}>
            <Dumbbell size={16} style={{ color: '#00f5ff' }} />
            <div style={{ flex: 1, minWidth: '180px' }}>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700, color: 'white' }}>
                Qualifier practice
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                Practice runs set your seed. They never count as matches.
              </div>
            </div>
            <button
              className="btn-secondary"
              style={{ fontSize: '13px', padding: '10px 18px' }}
              onClick={() => navigate(`/tournament/${tournamentId}/practice`)}
            >
              Practise
            </button>
          </div>
        )}

        {/* Practice ranking: players only, ordered by practice_score desc.
            Realtime re-runs fetchData on every tournament_players update, so
            the table moves as players run qualifiers. */}
        {practiceRanking.length > 0 && (
          <div style={{
            marginBottom: '24px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
            }}>
              <Dumbbell size={13} />
              Practice ranking
              {isHost && (
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
                  Seeds the bracket
                </span>
              )}
            </div>

            {practiceRanking.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr auto auto auto',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  borderBottom: idx === practiceRanking.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  background: p.user_id === user?.id ? 'rgba(0,245,255,0.06)' : 'transparent',
                }}
              >
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 800, color: 'rgba(255,255,255,0.35)' }}>
                  {idx + 1}
                </span>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.profiles?.display_name || 'Player'}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: '#00f5ff' }}>
                  {Number(p.practice_score || 0).toFixed(1)}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'rgba(255,255,255,0.5)', minWidth: '70px', textAlign: 'right' }}>
                  {Number(p.best_wpm || 0).toFixed(0)} WPM
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'rgba(255,255,255,0.35)', minWidth: '48px', textAlign: 'right' }}>
                  {p.practice_runs} run{p.practice_runs === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Players list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
          <AnimatePresence mode="popLayout">
            {players.map((player, idx) => (
              <PlayerCard
                key={player.id}
                player={player}
                index={idx}
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

        {/* Host controls */}
        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {canShowStart && (
              <>
                {!canStart && (
                  <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
                    {activePlayers.length < 2
                      ? 'Need at least 2 players to start'
                      : 'Ready when you are — everyone gets locked in.'}
                  </p>
                )}
                <motion.button
                  whileHover={canStart ? { scale: 1.02, y: -2 } : {}}
                  whileTap={canStart ? { scale: 0.98 } : {}}
                  className="btn-primary"
                  disabled={!canStart || starting}
                  onClick={handleStart}
                  style={{
                    fontSize: '17px', padding: '16px', opacity: canStart ? 1 : 0.4,
                    cursor: canStart ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  }}
                >
                  <Play size={20} />
                  {starting ? 'Building bracket...' : 'Start Tournament'}
                </motion.button>
              </>
            )}

            {registrationOpen && (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={handleCloseRegistration}
                style={{ fontSize: '13px', padding: '12px' }}
              >
                <Lock size={13} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                Close registration
              </button>
            )}

            {!registrationOpen && canShowStart && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>
                Registration is closed. Roster locked with {activePlayers.length} player{activePlayers.length === 1 ? '' : 's'}.
              </p>
            )}

            {!canShowStart && tournament.status === 'registration_closed' && (
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={handleReopen}
                style={{ fontSize: '13px', padding: '12px' }}
              >
                Reopen registration
              </button>
            )}
          </div>
        )}

        {!isHost && (
          <div style={{
            textAlign: 'center', padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px',
            marginBottom: '16px',
          }}>
            <Clock size={18} style={{ color: 'rgba(255,255,255,0.3)', margin: '0 auto 8px', display: 'block' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
              Waiting for the host to start the tournament...
            </p>
          </div>
        )}

        {/* Leave (host cannot) */}
        {!isHost && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={handleLeave}
            style={{ width: '100%', fontSize: '13px', padding: '12px' }}
          >
            <LogOut size={13} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            Leave tournament
          </button>
        )}
      </div>
    </div>
  )
}

function PlayerCard({ player, index, isCurrentUser, colorIndex }) {
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  const name = player.profiles?.display_name || 'Player'
  const withdrawn = player.status === 'withdrawn'

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
        opacity: withdrawn ? 0.5 : 1,
      }}
    >
      {/* Avatar circle */}
      <div style={{
        width: '38px', height: '38px', borderRadius: '50%',
        background: `${color}20`, border: `2px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '16px',
        color, flexShrink: 0,
      }}>
        {name[0]?.toUpperCase()}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontWeight: 700,
            color: isCurrentUser ? color : 'rgba(255,255,255,0.85)',
          }}>
            {name}
          </span>
          {isCurrentUser && (
            <span style={{ ...badge(color, `${color}15`, `${color}33`), marginLeft: 0 }}>You</span>
          )}
        </div>

        {player.practice_runs > 0 && (
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '3px', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600 }}>
            {player.practice_runs} practice run{player.practice_runs === 1 ? '' : 's'} · best {Number(player.best_wpm).toFixed(0)} WPM · score {Number(player.practice_score).toFixed(1)}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        color: withdrawn ? 'rgba(255,255,255,0.3)' : '#10b981',
        fontSize: '12px', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {!withdrawn && (
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
        )}
        {withdrawn ? 'Withdrawn' : 'In'}
      </div>
    </motion.div>
  )
}

const badge = (color, bg, border) => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  fontSize: '11px', color, background: bg, padding: '2px 8px',
  borderRadius: '999px', border: `1px solid ${border}`,
  fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
})

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
