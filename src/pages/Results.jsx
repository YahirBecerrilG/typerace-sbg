import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../services/supabase'
import { TournamentBracket } from '../components/TournamentBracket'
import { Confetti } from '../components/Confetti'
import { getTournamentBracket, getTournamentWithPlayers } from '../services/tournamentService'
import { formatTime } from '../utils/typing'
import toast from 'react-hot-toast'

export default function Results() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState([])
  const [winner, setWinner] = useState(null)
  const [myStats, setMyStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResults()
  }, [tournamentId])

  const loadResults = async () => {
    try {
      const [tData, bData] = await Promise.all([
        getTournamentWithPlayers(tournamentId),
        getTournamentBracket(tournamentId),
      ])

      setTournament(tData)
      setBracket(bData || [])

      // Find winner from last round's final match
      const lastRound = bData?.[bData.length - 1]
      const finalMatch = lastRound?.matches?.[0]
      if (finalMatch?.winner_id) {
        const { data: winnerTp } = await supabase
          .from('tournament_players')
          .select('*, profiles(*)')
          .eq('id', finalMatch.winner_id)
          .single()
        setWinner(winnerTp)
      }

      // Get my stats
      const { data: myTp } = await supabase
        .from('tournament_players')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (myTp) setMyStats(myTp)
    } catch (err) {
      toast.error('Failed to load results.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>Loading results...</p>
      </div>
    )
  }

  const iWon = winner?.user_id === user?.id

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
          style={{ textAlign: 'center', marginBottom: '56px' }}
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
          }}>
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
            {winner?.profiles?.display_name || 'Unknown'}
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
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '48px' }}
        >
          <StatCard label="Difficulty" value={tournament?.difficulty} accent="#f59e0b" capitalize />
          <StatCard label="Players" value={tournament?.max_players} accent="#00f5ff" />
          <StatCard label="Your Status" value={iWon ? '🏆 Winner' : 'Participant'} accent={iWon ? '#10b981' : '#8b5cf6'} />
        </motion.div>

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
          }}>
            Final Bracket
          </div>
          <div className="glass-card" style={{ padding: '24px', overflowX: 'auto', marginBottom: '32px' }}>
            <TournamentBracket rounds={bracket} currentRound={999} />
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
