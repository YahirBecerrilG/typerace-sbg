import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePostgresChanges } from '../hooks/useRealtime'
import {
  getTournamentWithPlayers,
  getTournamentBracket,
  getActiveMatchForPlayer,
  startNextRound,
} from '../services/tournamentService'
import { TournamentBracket } from '../components/TournamentBracket'
import { TOURNAMENT_STATUS_LABEL, placementLabel, getRoundName, getTotalRounds } from '../utils/bracket'
import { Play, ArrowRight, Trophy, Crown } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Tournament overview: bracket, standings and the controls for whoever is
 * playing. Admin powers live on tournaments.host_id — a PLAYER never gets a
 * mutating control here, and the server rejects it regardless.
 */
export default function Tournament() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState([])
  const [players, setPlayers] = useState([])
  const [myMatch, setMyMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [startingRound, setStartingRound] = useState(false)

  const isHost = tournament?.host_id === user?.id
  const myPlayerId = players.find((p) => p.user_id === user?.id)?.id
  const totalRounds = getTotalRounds(tournament?.bracket_slots || tournament?.max_players || 2)

  const refreshBracket = useCallback(async () => {
    try {
      const data = await getTournamentBracket(tournamentId)
      setBracket(data || [])
    } catch (err) {
      console.error('Bracket fetch error:', err)
    }
  }, [tournamentId])

  const refreshTournament = useCallback(async () => {
    try {
      const data = await getTournamentWithPlayers(tournamentId)
      setTournament(data)
      setPlayers(data.players || [])
    } catch {
      toast.error('Failed to load tournament.')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  const refreshMyMatch = useCallback(async () => {
    try {
      const match = await getActiveMatchForPlayer(tournamentId, user.id)
      setMyMatch(match)
    } catch (err) {
      console.error('Match lookup error:', err)
    }
  }, [tournamentId, user])

  const refreshAll = useCallback(() => {
    refreshTournament()
    refreshBracket()
    refreshMyMatch()
  }, [refreshTournament, refreshBracket, refreshMyMatch])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // ─── Realtime: any match change re-reads the bracket ─────────────────────
  usePostgresChanges({
    table: 'matches',
    onUpdate: () => { refreshBracket(); refreshMyMatch() },
    onInsert: () => { refreshBracket(); refreshMyMatch() },
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'rounds',
    filter: `tournament_id=eq.${tournamentId}`,
    onUpdate: refreshAll,
    onInsert: refreshAll,
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'tournament_players',
    filter: `tournament_id=eq.${tournamentId}`,
    onUpdate: refreshTournament,
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'tournaments',
    filter: `id=eq.${tournamentId}`,
    onUpdate: (newData) => {
      setTournament((prev) => ({ ...prev, ...newData }))
      if (newData.status === 'completed') {
        navigate(`/results/${tournamentId}`, { replace: true })
      }
    },
    enabled: !!tournamentId,
  })

  // ─── Admin: open the next round ──────────────────────────────────────────
  const handleStartRound = async () => {
    setStartingRound(true)
    try {
      await startNextRound(tournamentId)
      toast.success('Round started!')
      refreshAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setStartingRound(false)
    }
  }

  // ─── Enter my match ──────────────────────────────────────────────────────
  const enterMatch = useCallback(() => {
    if (!myMatch?.races?.[0]?.id) return
    navigate(`/race/${myMatch.id}/${myMatch.races[0].id}`)
  }, [myMatch, navigate])

  if (loading) {
    return (
      <div style={screen}>
        <p style={muted}>Loading tournament...</p>
      </div>
    )
  }

  const status = tournament?.status
  const pendingRound = bracket.find((r) => r.status === 'pending')
  const activeRound = bracket.find((r) => r.status === 'active')
  const champion = players.find((p) => p.status === 'champion')
  const myStatus = players.find((p) => p.user_id === user?.id)

  return (
    <div style={{ ...screen, alignItems: 'flex-start', padding: '40px 24px' }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />

      <div style={content}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '32px' }}>
          <div style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '12px',
            color: status === 'completed' ? '#f59e0b' : '#10b981',
            fontWeight: 700, letterSpacing: '0.15em',
            textTransform: 'uppercase', marginBottom: '6px',
          }}
          >
            ● {TOURNAMENT_STATUS_LABEL[status] || status}
          </div>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: 'white' }}>
            {tournament?.name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '6px', fontSize: '14px' }}>
            {totalRounds > 0 && (
              <>
                {getRoundName(activeRound?.round_number || tournament?.current_round || 1, totalRounds)}
                {' • '}
              </>
            )}
            {tournament?.difficulty} difficulty
            {tournament?.bracket_slots > 0 && ` • ${tournament.bracket_slots} slots`}
            {tournament?.bracket_byes > 0 && ` • ${tournament.bracket_byes} BYE${tournament.bracket_byes === 1 ? '' : 's'}`}
          </p>
        </motion.div>

        {/* Your status / CTA */}
        {myStatus?.status === 'eliminated' && (
          <StatusBanner
            color="#ef4444"
            title={`${placementLabel(myStatus.placement) || 'Eliminated'}`}
            body="You are out. Stay here to follow the rest of the bracket."
          />
        )}

        {isHost && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
            padding: '14px 18px', marginBottom: '24px',
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '12px',
          }}>
            <Crown size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
              You are the host. You can watch every round, open the next one and close the tournament — you are not seeded, ranked or matched.
            </span>
          </div>
        )}

        {myStatus?.status === 'withdrawn' && (
          <StatusBanner color="rgba(255,255,255,0.4)" title="Withdrawn" body="You left this tournament." />
        )}

        {champion && (
          <StatusBanner
            color="#f59e0b"
            title={`${champion.profiles?.display_name || 'Player'} is the champion`}
            body="View the final standings."
            action={{ label: 'Full results', onClick: () => navigate(`/results/${tournamentId}`) }}
          />
        )}

        {myMatch && (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="btn-primary"
            onClick={enterMatch}
            style={{
              width: '100%', padding: '18px', fontSize: '16px', marginBottom: '24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            }}
          >
            <Play size={18} />
            {myMatch.status === 'racing'
              ? 'Return to your race'
              : myMatch.status === 'ready'
                ? 'Your match is ready — join now'
                : 'Enter your match'}
            <ArrowRight size={16} />
          </motion.button>
        )}

        {/* Admin: next round */}
        {isHost && pendingRound && status !== 'completed' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
            padding: '18px 20px', marginBottom: '24px',
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '12px',
          }}
          >
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontWeight: 800, color: 'white' }}>
                {getRoundName(pendingRound.round_number, totalRounds)} is ready
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                Players are waiting. Opening the round lets them READY up.
              </div>
            </div>
            <button
              className="btn-primary"
              disabled={startingRound}
              onClick={handleStartRound}
              style={{ padding: '13px 22px', fontSize: '14px', opacity: startingRound ? 0.7 : 1 }}
            >
              <Play size={15} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
              {startingRound ? 'Starting...' : 'Start round'}
            </button>
          </div>
        )}

        {/* Bracket */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700,
            color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '16px',
          }}
          >
            Bracket
          </div>
          <div className="glass-card" style={{ padding: '20px', overflowX: 'auto' }}>
            <TournamentBracket
              rounds={bracket}
              currentRound={activeRound?.round_number || tournament?.current_round || 1}
              myPlayerId={myPlayerId}
            />
          </div>
        </motion.div>

        {/* Standings */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          style={{ marginTop: '32px' }}
        >
          <div style={{
            fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 700,
            color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: '16px',
          }}
          >
            Standings
          </div>
          <div className="glass-card" style={{ padding: '8px' }}>
            {[...players]
              .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999) || (a.seed ?? 999) - (b.seed ?? 999))
              .map((p, i) => (
                <StandingsRow key={p.id} player={p} index={i} isMe={p.user_id === user?.id} />
              ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function StatusBanner({ color, title, body, action }) {
  return (
    <div style={{
      padding: '16px 20px', marginBottom: '24px',
      background: `${color}14`, border: `1px solid ${color}40`, borderRadius: '12px',
      display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
    }}
    >
      <Trophy size={18} style={{ color }} />
      <div style={{ flex: 1, minWidth: '180px' }}>
        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontWeight: 800, color: 'white' }}>
          {title}
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{body}</div>
      </div>
      {action && (
        <button className="btn-secondary" onClick={action.onClick} style={{ padding: '10px 18px', fontSize: '13px' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

function StandingsRow({ player, index, isMe }) {
  const statusColor = {
    champion: '#f59e0b',
    active: '#10b981',
    eliminated: 'rgba(255,255,255,0.35)',
    withdrawn: 'rgba(255,255,255,0.25)',
  }[player.status] || 'rgba(255,255,255,0.5)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px', borderRadius: '8px',
      background: isMe ? 'rgba(0,245,255,0.06)' : 'transparent',
    }}
    >
      <span style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: '12px',
        color: 'rgba(255,255,255,0.3)', minWidth: '20px',
      }}
      >
        {player.seed ? `#${player.seed}` : `${index + 1}`}
      </span>
      <span style={{
        fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: 600,
        color: 'rgba(255,255,255,0.9)', flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
      >
        {player.profiles?.display_name || 'Player'}
        {isMe && <span style={{ color: '#00f5ff', marginLeft: '6px', fontSize: '11px' }}>YOU</span>}
      </span>

      {Number(player.practice_score) > 0 && (
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600 }}>
          {Number(player.practice_score).toFixed(0)} seed
        </span>
      )}

      {player.wins > 0 && (
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 600 }}>
          {player.wins}W
        </span>
      )}

      <span style={{
        fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase', color: statusColor,
        minWidth: '80px', textAlign: 'right',
      }}
      >
        {placementLabel(player.placement) || player.status}
      </span>
    </div>
  )
}

const screen = {
  minHeight: '100vh', background: '#080b14', position: 'relative',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const muted = { color: 'rgba(255,255,255,0.4)' }
const content = { position: 'relative', zIndex: 1, maxWidth: '1100px', margin: '0 auto', width: '100%' }