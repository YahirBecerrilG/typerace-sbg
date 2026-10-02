import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRace } from '../hooks/useRace'
import { useMatchRealtime } from '../hooks/useTournament'
import { Countdown } from '../components/Countdown'
import { RaceTrack } from '../components/RaceTrack'
import { TypingText } from '../components/TypingText'
import { ErrorCounter } from '../components/ErrorCounter'
import { RaceTimer } from '../components/RaceTimer'
import { submitRaceResult } from '../services/raceService'
import { supabase } from '../services/supabase'
import { getRoundNameByTotal } from '../utils/bracket'
import { formatTime } from '../utils/typing'
import toast from 'react-hot-toast'

export default function Race() {
  const { matchId, raceId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  // ─── State ──────────────────────────────────────────────────────────────
  const [match, setMatch] = useState(null)
  const [race, setRace] = useState(null)
  const [phrase, setPhrase] = useState(null)
  const [myPlayer, setMyPlayer] = useState(null)
  const [opponentPlayer, setOpponentPlayer] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showCountdown, setShowCountdown] = useState(true)
  const [raceStarted, setRaceStarted] = useState(false)

  // Opponent progress from realtime
  const [opponentProgress, setOpponentProgress] = useState(0)
  const [opponentErrors, setOpponentErrors] = useState(0)
  const [opponentFinished, setOpponentFinished] = useState(false)

  // Match result
  const [matchResult, setMatchResult] = useState(null) // { winner, loser, winnerTime }
  const [submitting, setSubmitting] = useState(false)

  const inputRef = useRef(null)
  const hasSubmittedRef = useRef(false)

  // ─── Load match & race data ──────────────────────────────────────────────
  useEffect(() => {
    loadRaceData()
  }, [matchId, raceId, user])

  const loadRaceData = async () => {
    try {
      const { data: raceData, error } = await supabase
        .from('races')
        .select(`
          *,
          phrases(*),
          matches(
            *,
            player1:tournament_players!matches_player1_id_fkey(*, profiles(*)),
            player2:tournament_players!matches_player2_id_fkey(*, profiles(*)),
            rounds(*, tournaments(*))
          )
        `)
        .eq('id', raceId)
        .single()

      if (error) throw error

      const matchData = raceData.matches
      setMatch(matchData)
      setRace(raceData)
      setPhrase(raceData.phrases?.text || '')

      // Identify which player is "me"
      const p1 = matchData.player1
      const p2 = matchData.player2
      if (p1?.user_id === user.id) {
        setMyPlayer(p1)
        setOpponentPlayer(p2)
      } else {
        setMyPlayer(p2)
        setOpponentPlayer(p1)
      }
    } catch (err) {
      toast.error('Failed to load race data.')
      navigate(-1)
    } finally {
      setLoading(false)
    }
  }

  // ─── Racing engine ───────────────────────────────────────────────────────
  const { broadcast } = useMatchRealtime({
    matchId,
    onEvent: (event, payload) => {
      if (event === 'PLAYER_PROGRESS') {
        // Only update opponent
        if (payload.playerId !== myPlayer?.id) {
          setOpponentProgress(payload.progress)
          setOpponentErrors(payload.errors)
        }
      }
      if (event === 'PLAYER_FINISHED') {
        if (payload.playerId !== myPlayer?.id) {
          setOpponentFinished(true)
        }
      }
      if (event === 'MATCH_RESULT') {
        setMatchResult(payload)
      }
    },
    enabled: !!matchId && !!myPlayer,
  })

  const handleBroadcastProgress = useCallback(({ playerId, matchId: mId, progress, errors }) => {
    broadcast('PLAYER_PROGRESS', { playerId, matchId: mId, progress, errors })
  }, [broadcast])

  const handleFinish = useCallback(async ({ typedText, elapsedMs, errors: finalErrors }) => {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true

    // Broadcast finish to opponent
    broadcast('PLAYER_FINISHED', { playerId: myPlayer.id, elapsedMs, matchId })

    // Submit to server for validation
    setSubmitting(true)
    try {
      const result = await submitRaceResult({
        raceId,
        matchId,
        playerId: myPlayer.id,
        typedText,
        elapsedMs,
      })
      // Server will broadcast MATCH_RESULT via DB triggers
      // But also broadcast directly for speed
      if (result?.winner_id) {
        const resultPayload = {
          winnerId: result.winner_id,
          winnerTime: result.winner_time_ms,
          player1Id: match.player1_id,
          player2Id: match.player2_id,
        }
        broadcast('MATCH_RESULT', resultPayload)
        setMatchResult(resultPayload)
      }
    } catch (err) {
      toast.error('Failed to submit result. Please contact the host.')
    } finally {
      setSubmitting(false)
    }
  }, [raceId, matchId, myPlayer, match, broadcast])

  const {
    typedText,
    currentIndex,
    errors,
    progress,
    isCrashed,
    isFinished,
    startTime,
    endTime,
    shakeTrigger,
    crashTrigger,
    handleKeyPress,
  } = useRace({
    phrase,
    matchId,
    playerId: myPlayer?.id,
    onBroadcastProgress: handleBroadcastProgress,
    onFinish: handleFinish,
    raceStarted,
  })

  // ─── Keyboard capture ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!raceStarted || matchResult) return
      // Ignore modifier-only keypresses
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length === 1) {
        e.preventDefault()
        handleKeyPress(e.key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [raceStarted, handleKeyPress, matchResult])

  // Focus invisible input on mobile
  useEffect(() => {
    if (raceStarted) inputRef.current?.focus()
  }, [raceStarted])

  // ─── Countdown done ──────────────────────────────────────────────────────
  const handleCountdownComplete = useCallback(() => {
    setShowCountdown(false)
    setRaceStarted(true)
  }, [])

  // ─── Crash animation ─────────────────────────────────────────────────────
  const iAmWinner = matchResult && (
    matchResult.winnerId === myPlayer?.id
  )
  const myCarState = isCrashed ? 'crashed' : isFinished ? (iAmWinner ? 'winner' : 'idle') : raceStarted ? 'racing' : 'idle'
  const opponentCarState = opponentFinished ? 'idle' : raceStarted ? 'racing' : 'idle'

  // Round info
  const round = match?.rounds
  const tournament = round?.tournaments
  const totalRounds = tournament ? Math.ceil(Math.log2(tournament.max_players || 2)) : 1

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#080b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>Preparing race...</p>
      </div>
    )
  }

  return (
    <div
      style={{ minHeight: '100vh', background: '#080b14', position: 'relative', overflowX: 'hidden' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Invisible input for mobile keyboard */}
      <input
        ref={inputRef}
        style={{ position: 'fixed', opacity: 0, top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none' }}
        onKeyDown={(e) => {
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault()
            handleKeyPress(e.key)
          }
        }}
        readOnly={!raceStarted}
      />

      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.25 }} />

      {/* Countdown overlay */}
      {showCountdown && <Countdown onComplete={handleCountdownComplete} />}

      {/* Match result overlay */}
      <AnimatePresence>
        {matchResult && (
          <MatchResultOverlay
            matchResult={matchResult}
            myPlayer={myPlayer}
            opponentPlayer={opponentPlayer}
            elapsedMs={endTime && startTime ? endTime - startTime : null}
            tournamentId={tournament?.id || match?.rounds?.tournament_id}
            onNavigate={navigate}
          />
        )}
      </AnimatePresence>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1000px', margin: '0 auto', padding: '24px 20px' }}>
        {/* ─── Header ─── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '28px',
        }}>
          <div>
            <div style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '22px',
              fontWeight: 800,
              color: 'white',
            }}>
              {tournament?.name || 'Race'}
            </div>
            <div style={{
              display: 'flex',
              gap: '10px',
              marginTop: '4px',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.4)',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              <span>{getRoundNameByTotal(round?.round_number || 1, totalRounds)}</span>
              <span>•</span>
              <span>Match {(round?.round_number || 0) + 1}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ErrorCounter errors={errors} shakeTrigger={shakeTrigger} crashTrigger={crashTrigger} />
            <RaceTimer
              raceStarted={raceStarted}
              stopped={isFinished}
              finalMs={isFinished && endTime && startTime ? endTime - startTime : null}
            />
          </div>
        </div>

        {/* ─── Race Track ─── */}
        <motion.div
          animate={crashTrigger > 0 ? {
            backgroundColor: ['rgba(239,68,68,0)', 'rgba(239,68,68,0.12)', 'rgba(239,68,68,0)'],
          } : {}}
          transition={{ duration: 0.6 }}
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '12px',
            fontSize: '11px',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
          }}>
            <span>START</span>
            <span>FINISH 🏁</span>
          </div>

          {/* My lane */}
          <RaceTrack
            player={myPlayer?.profiles}
            progress={progress}
            isCurrentPlayer={true}
            carState={myCarState}
            colorIndex={0}
          />

          {/* Opponent lane */}
          <RaceTrack
            player={opponentPlayer?.profiles}
            progress={opponentProgress}
            isCurrentPlayer={false}
            carState={opponentCarState}
            colorIndex={1}
          />
        </motion.div>

        {/* ─── Crash feedback ─── */}
        <AnimatePresence>
          {isCrashed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              style={{
                textAlign: 'center',
                padding: '16px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>💥</div>
              <div style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '20px',
                fontWeight: 800,
                color: '#ef4444',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                CRASH! 4 Errors — Back to Start!
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Typing area ─── */}
        <div style={{ marginBottom: '16px' }}>
          <TypingText phrase={phrase} typedText={typedText} currentIndex={currentIndex} />
        </div>

        {/* ─── Progress bar ─── */}
        <div style={{
          height: '4px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: '12px',
        }}>
          <motion.div
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, #00f5ff, #8b5cf6)',
              borderRadius: '2px',
              boxShadow: '0 0 10px rgba(0,245,255,0.4)',
            }}
          />
        </div>

        {/* ─── Hint ─── */}
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
          {raceStarted
            ? 'Type the text above — every character counts'
            : 'Get ready to race...'}
        </div>
      </div>
    </div>
  )
}

// ─── Match Result Overlay ─────────────────────────────────────────────────────
function MatchResultOverlay({ matchResult, myPlayer, opponentPlayer, elapsedMs, tournamentId, onNavigate }) {
  const iWon = matchResult.winnerId === myPlayer?.id

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'rgba(8,11,20,0.9)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <motion.div
        initial={{ scale: 0.8, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="glass-card"
        style={{ padding: '48px', textAlign: 'center', maxWidth: '440px', width: '100%' }}
      >
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>
          {iWon ? '🏆' : '😔'}
        </div>
        <div style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '40px',
          fontWeight: 900,
          color: iWon ? '#10b981' : '#ef4444',
          marginBottom: '8px',
          textShadow: iWon ? '0 0 30px rgba(16,185,129,0.5)' : '0 0 30px rgba(239,68,68,0.5)',
        }}>
          {iWon ? 'VICTORY!' : 'DEFEATED'}
        </div>
        <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '32px', fontSize: '15px' }}>
          {iWon
            ? `You beat ${opponentPlayer?.profiles?.display_name || 'your opponent'}!`
            : `${opponentPlayer?.profiles?.display_name || 'Opponent'} wins this round.`}
        </p>

        {elapsedMs && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '28px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '22px',
            color: '#00f5ff',
          }}>
            {formatTime(elapsedMs)}
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: '15px' }}
          onClick={() => tournamentId ? onNavigate(`/tournament/${tournamentId}`) : onNavigate('/dashboard')}
        >
          {iWon ? 'Continue to Next Round →' : 'Back to Tournament'}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
