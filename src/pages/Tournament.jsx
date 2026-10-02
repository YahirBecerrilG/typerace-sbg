import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTournamentRealtime } from '../hooks/useTournament'
import { usePostgresChanges } from '../hooks/useRealtime'
import { getTournamentWithPlayers, getTournamentBracket } from '../services/tournamentService'
import { TournamentBracket } from '../components/TournamentBracket'
import { supabase } from '../services/supabase'
import toast from 'react-hot-toast'

export default function Tournament() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkingMatch, setCheckingMatch] = useState(false)

  const fetchBracket = useCallback(async () => {
    try {
      const data = await getTournamentBracket(tournamentId)
      setBracket(data || [])
    } catch (err) {
      console.error('Bracket fetch error:', err)
    }
  }, [tournamentId])

  const fetchTournament = useCallback(async () => {
    try {
      const data = await getTournamentWithPlayers(tournamentId)
      setTournament(data)
    } catch (err) {
      toast.error('Failed to load tournament.')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    fetchTournament()
    fetchBracket()
  }, [fetchTournament, fetchBracket])

  // Look for player's active match and navigate to race
  const checkActiveMatch = useCallback(async () => {
    if (checkingMatch) return
    setCheckingMatch(true)
    try {
      // Find my tournament_player entry
      const { data: tp } = await supabase
        .from('tournament_players')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!tp) return

      // Find my active match
      const { data: match } = await supabase
        .from('matches')
        .select('id, races(id)')
        .or(`player1_id.eq.${tp.id},player2_id.eq.${tp.id}`)
        .eq('status', 'active')
        .maybeSingle()

      if (match && match.races?.[0]?.id) {
        navigate(`/race/${match.id}/${match.races[0].id}`)
      }
    } finally {
      setCheckingMatch(false)
    }
  }, [tournamentId, user, navigate, checkingMatch])

  useEffect(() => {
    checkActiveMatch()
  }, [])

  // ─── Realtime ───────────────────────────────────────────────────────────
  const { broadcast } = useTournamentRealtime({
    tournamentId,
    onEvent: (event, payload) => {
      if (event === 'ROUND_STARTED' || event === 'MATCH_READY') {
        fetchBracket()
        checkActiveMatch()
      }
      if (event === 'TOURNAMENT_FINISHED') {
        navigate(`/results/${tournamentId}`)
      }
    },
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'matches',
    onUpdate: () => { fetchBracket() },
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'tournaments',
    filter: `id=eq.${tournamentId}`,
    onUpdate: (newData) => {
      setTournament((prev) => ({ ...prev, ...newData }))
      if (newData.status === 'finished') {
        navigate(`/results/${tournamentId}`)
      }
    },
    enabled: !!tournamentId,
  })

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>Loading tournament...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080b14', position: 'relative' }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' }}>
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '40px' }}>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: '#10b981', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>
            ● Tournament Active
          </div>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: 'white' }}>
            {tournament?.name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: '6px', fontSize: '14px' }}>
            Round {tournament?.current_round || 1} • {tournament?.difficulty} difficulty
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px' }}>
            Tournament Bracket
          </div>
          <div className="glass-card" style={{ padding: '24px', overflowX: 'auto' }}>
            <TournamentBracket rounds={bracket} currentRound={tournament?.current_round || 1} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{ marginTop: '32px', textAlign: 'center' }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '16px 24px',
            background: 'rgba(0,245,255,0.06)',
            border: '1px solid rgba(0,245,255,0.15)',
            borderRadius: '12px',
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f5ff', animation: 'pulse 1.5s infinite', boxShadow: '0 0 8px rgba(0,245,255,0.6)' }} />
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
              Waiting for your match to begin...
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
