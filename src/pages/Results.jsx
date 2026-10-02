import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { TournamentBracket } from '../components/TournamentBracket'
import { Confetti } from '../components/Confetti'
import { getTournamentBracket, getTournamentWithPlayers } from '../services/tournamentService'
import { placementLabel } from '../utils/bracket'
import toast from 'react-hot-toast'

export default function Results() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState([])
  const [players, setPlayers] = useState([])
  const [myStats, setMyStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadResults = useCallback(async () => {
    try {
      const [tData, bData] = await Promise.all([
        getTournamentWithPlayers(tournamentId),
        getTournamentBracket(tournamentId),
      ])

      setTournament(tData)
      setBracket(bData || [])
      // `players` is participants only: the host has no participant row and is
      // never ranked, placed or counted here.
      const list = tData.players || []
      setPlayers(list)
      setMyStats(list.find((p) => p.user_id === user.id) || null)
    } catch {
      toast.error('Failed to load results.')
    } finally {
      setLoading(false)
    }
  }, [tournamentId, user])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>Loading results...</p>
      </div>
    )
  }

  // The champion is a participant row flagged by the server, not a guess from
  // the last match.
  const champion = players.find((p) => p.status === 'champion')
  const iWon = champion?.user_id === user?.id
  const ranked = [...players]
    .filter((p) => p.placement !== null && p.placement !== undefined)
    .sort((a, b) => a.placement - b.placement)

  return (
    <div style={{ minHeight: '100vh', background: '#080b14', position: 'relative' }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
      {iWon && <Confetti count={100} />}

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1000px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Winner announcement */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          style={{ textAlign: 'center', marginBottom: '48px' }}
        >
          <motion.div
            animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
            transition={{ duration: 1, delay: 0.5 }}
            style={{ fontSize: '80px', marginBottom: '16px', display: 'block' }}
          >
            🏆
          </motion.div>

          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#f59e0b',
            marginBottom: '8px',
          }}
          >
            Tournament Champion
          </div>

          <h1 style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 900,
            lineHeight: 1.1,
          }}
            className="gradient-text"
          >
            {champion?.profiles?.display_name || 'Unknown'}
          </h1>

          <div style={{ marginTop: '12px', color: 'rgba(255,255,255,0.4)', fontSize: '16px' }}>
            {tournament?.name}
          </div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '40px' }}
        >
          <StatCard label="Difficulty" value={tournament?.difficulty} accent="#f59e0b" capitalize />
          <StatCard label="Players" value={players.filter((p) => p.status !== 'withdrawn').length} accent="#00f5ff" />
          <StatCard
            label="Your Result"
            value={placementLabel(myStats?.placement) || (myStats ? myStats.status : '—')}
            accent={iWon ? '#f59e0b' : myStats?.status === 'eliminated' ? '#ef4444' : '#8b5cf6'}
          />
        </motion.div>

        {/* Podium / placements */}
        {ranked.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            style={{ marginBottom: '40px' }}
          >
            <div style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '16px',
              fontWeight: 700,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '16px',
            }}
            >
              Final Standings
            </div>
            <div className="glass-card" style={{ padding: '8px' }}>
              {ranked.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', borderRadius: '8px',
                    background: p.user_id === user.id ? 'rgba(0,245,255,0.06)' : 'transparent',
                  }}
                >
                  <span style={{
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', fontWeight: 800,
                    color: placementColor(p.placement), minWidth: '28px',
                  }}
                  >
                    #{p.placement}
                  </span>
                  <span style={{
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontWeight: 600,
                    color: 'rgba(255,255,255,0.9)', flex: 1,
                  }}
                  >
                    {p.profiles?.display_name || 'Player'}
                    {p.user_id === user.id && (
                      <span style={{ color: '#00f5ff', marginLeft: '6px', fontSize: '11px' }}>YOU</span>
                    )}
                  </span>
                  {p.wins > 0 && (
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{p.wins}W</span>
                  )}
                  <span style={{
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: placementColor(p.placement), minWidth: '90px', textAlign: 'right',
                  }}
                  >
                    {placementLabel(p.placement)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Bracket */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '16px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}
          >
            Final Bracket
          </div>
          <div className="glass-card" style={{ padding: '24px', overflowX: 'auto', marginBottom: '32px' }}>
            <TournamentBracket
              rounds={bracket}
              currentRound={bracket.length ? bracket[bracket.length - 1].round_number : 1}
              myPlayerId={myStats?.id}
            />
          </div>
        </motion.div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="btn-primary"
            onClick={() => navigate('/create-tournament')}
            style={{ fontSize: '15px', padding: '14px 28px' }}
          >
            Play Again
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="btn-ghost"
            onClick={() => navigate('/dashboard')}
            style={{ fontSize: '15px', padding: '14px 28px' }}
          >
            Back to Dashboard
          </motion.button>
        </div>
      </div>
    </div>
  )
}

function placementColor(placement) {
  if (placement === 1) return '#f59e0b'
  if (placement === 2) return '#94a3b8'
  if (placement === 3) return '#b45309'
  return 'rgba(255,255,255,0.5)'
}

function StatCard({ label, value, accent, capitalize }) {
  return (
    <div className="glass-card" style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '24px',
        fontWeight: 800,
        color: accent || 'white',
        textTransform: capitalize ? 'capitalize' : 'none',
      }}>
        {value || '—'}
      </div>
    </div>
  )
}
