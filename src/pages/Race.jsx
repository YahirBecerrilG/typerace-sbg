import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRace } from '../hooks/useRace'
import { useMatchRealtime, useLiveMatch } from '../hooks/useTournament'
import { Countdown } from '../components/Countdown'
import { RaceTrack } from '../components/RaceTrack'
import { TypingText } from '../components/TypingText'
import { ErrorCounter } from '../components/ErrorCounter'
import { RaceTimer } from '../components/RaceTimer'
import {
  submitRaceResult,
  setMatchReady,
  setMatchPresence,
  startRace,
  recordRaceStart,
} from '../services/raceService'
import { getRoundName, getTotalRounds, MATCH_STATUS_LABEL } from '../utils/bracket'
import { formatTime } from '../utils/typing'
import toast from 'react-hot-toast'

const TERMINAL_STATUSES = ['completed', 'bye', 'forfeit']

export default function Race() {
  const { matchId, raceId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { match, loading } = useLiveMatch(matchId)

  const [phrase, setPhrase] = useState('')
  const [myPlayer, setMyPlayer] = useState(null)
  const [opponentPlayer, setOpponentPlayer] = useState(null)

  // 'ready_gate' -> 'countdown' -> 'racing' -> 'waiting' -> 'done'
  const [phase, setPhase] = useState('ready_gate')
  const [showCountdown, setShowCountdown] = useState(false)
  const [amReady, setAmReady] = useState(false)
  const [readyPending, setReadyPending] = useState(false)
  const [startingRace, setStartingRace] = useState(false)

  const [opponentProgress, setOpponentProgress] = useState(0)
  const [, setOpponentErrors] = useState(0)
  const [opponentFinished, setOpponentFinished] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const inputRef = useRef(null)
  const hasSubmittedRef = useRef(false)
  const countdownFiredRef = useRef(false)

  const status = match?.status
  const round = match?.rounds
  const tournament = round?.tournaments
  const tournamentId = round?.tournament_id
  const totalRounds = getTotalRounds(tournament?.bracket_slots || tournament?.max_players || 2)

  // ─── Phrase comes from the race row embedded in the match ─────────────────
  useEffect(() => {
    const r = match?.races?.[0]
    if (r?.phrases?.text) setPhrase(r.phrases.text)
  }, [match])

  // ─── Identify the two players ─────────────────────────────────────────────
  useEffect(() => {
    if (!match || !user?.id) return
    const p1 = match.player1
    const p2 = match.player2
    if (p1?.user_id === user.id) {
      setMyPlayer(p1)
      setOpponentPlayer(p2)
    } else if (p2?.user_id === user.id) {
      setMyPlayer(p2)
      setOpponentPlayer(p1)
    }
  }, [match, user])

  const iAmPlayer1 = match?.player1_id === myPlayer?.id
  const opponentReady = iAmPlayer1 ? match?.player2_ready : match?.player1_ready

  // ─── Terminal match: Back must not reopen a decided race ──────────────────
  // The overlay stays visible (the player still sees the result). Instead of
  // auto-navigating, we plant a sentinel entry so Back is swallowed here, and
  // the overlay's own CTA leaves with replace() to consume it.
  const isTerminal = !!status && TERMINAL_STATUSES.includes(status)
  useEffect(() => {
    if (!isTerminal) return

    window.history.pushState({ raceGuard: true }, '')
    const onPop = () => {
      // Re-plant the sentinel: the back button can never reach a finished race.
      window.history.pushState({ raceGuard: true }, '')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [isTerminal])

  // ─── Presences ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!matchId) return
    setMatchPresence(matchId, true)
    return () => {
      // Fire-and-forget: clears our READY flag so nobody waits forever.
      setMatchPresence(matchId, false)
    }
  }, [matchId])

  // ─── READY gate ───────────────────────────────────────────────────────────
  const handleReady = useCallback(async () => {
    if (!matchId || amReady || readyPending) return
    try {
      setReadyPending(true)
      // Optimistic: the button must not double-fire while realtime catches up.
      setAmReady(true)
      await setMatchReady(matchId, true)
    } catch (err) {
      setAmReady(false)
      toast.error(err.message)
    } finally {
      setReadyPending(false)
    }
  }, [matchId, amReady, readyPending])

  useEffect(() => {
    // Reflect our own flag when the row updates from anywhere.
    if (!match || !myPlayer) return
    const mine = iAmPlayer1 ? match.player1_ready : match.player2_ready
    if (mine) setAmReady(true)
  }, [match, myPlayer, iAmPlayer1])

  // ─── Both ready -> open the race, then countdown ──────────────────────────
  useEffect(() => {
    if (status !== 'ready' || phase !== 'ready_gate') return

    let cancelled = false
    ;(async () => {
      setStartingRace(true)
      try {
        const res = await startRace(matchId)
        if (cancelled) return
        if (res?.ok) {
          setPhase('countdown')
          setShowCountdown(true)
        } else if (res?.already_racing) {
          setPhase('countdown')
          setShowCountdown(true)
        } else {
          setPhase('ready_gate')
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message)
      } finally {
        if (!cancelled) setStartingRace(false)
      }
    })()

    return () => { cancelled = true }
  }, [status, phase, matchId])

  // If we re-enter a race that is already running, resume into the countdown.
  useEffect(() => {
    if (status === 'racing' && phase === 'ready_gate') {
      setPhase('countdown')
      setShowCountdown(true)
    }
  }, [status, phase])

  const handleCountdownComplete = useCallback(() => {
    if (countdownFiredRef.current) return
    countdownFiredRef.current = true
    setShowCountdown(false)
    setPhase('racing')
    recordRaceStart(raceId)
  }, [raceId])

  const raceStarted = phase === 'racing' || phase === 'waiting'

  const { broadcast } = useMatchRealtime({
    matchId,
    onEvent: (event, payload) => {
      if (event === 'PLAYER_PROGRESS' && payload.playerId !== myPlayer?.id) {
        setOpponentProgress(payload.progress)
        setOpponentErrors(payload.errors)
      }
      if (event === 'PLAYER_FINISHED' && payload.playerId !== myPlayer?.id) {
        setOpponentFinished(true)
      }
    },
    enabled: !!matchId && !!myPlayer,
  })

  const handleBroadcastProgress = useCallback(
    ({ playerId, matchId: mId, progress, errors }) => {
      broadcast('PLAYER_PROGRESS', { playerId, matchId: mId, progress, errors })
    },
    [broadcast]
  )

  // ─── Finish: one idempotent submit ────────────────────────────────────────
  const handleFinish = useCallback(
    async ({ typedText, elapsedMs }) => {
      if (hasSubmittedRef.current) return
      hasSubmittedRef.current = true

      broadcast('PLAYER_FINISHED', { playerId: myPlayer.id, elapsedMs, matchId })

      setSubmitting(true)
      setSubmitError(null)
      try {
        const result = await submitRaceResult({
          raceId,
          matchId,
          playerId: myPlayer.id,
          typedText,
          elapsedMs,
        })

        if (result?.pending) {
          // Server has my time; the match resolves when the opponent submits.
          setPhase('waiting')
          return
        }
        // Otherwise the match row flips to 'completed' and realtime drives
        // the result overlay. No client-side winner is ever computed.
      } catch (err) {
        // Keep the error visible; the server ignores duplicates so a reload is safe.
        setSubmitError(err.message)
        toast.error(err.message)
      } finally {
        setSubmitting(false)
      }
    },
    [raceId, matchId, myPlayer, broadcast]
  )

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

  // ─── Keyboard capture (single source of truth) ────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!raceStarted || isFinished) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length === 1) {
        e.preventDefault()
        handleKeyPress(e.key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [raceStarted, handleKeyPress, isFinished])

  useEffect(() => {
    if (raceStarted && !isFinished) inputRef.current?.focus()
  }, [raceStarted, isFinished])

  // ─── Result ───────────────────────────────────────────────────────────────
  const decided = status === 'completed' || status === 'forfeit'
  const iWon = decided && match?.winner_id === myPlayer?.id
  const forfeitWin = status === 'forfeit' && match?.winner_id === myPlayer?.id

  const myTimeMs =
    endTime && startTime ? endTime - startTime : null
  const winnerTime = match?.winner_time_ms

  const myCarState = decided
    ? (iWon ? 'winner' : 'idle')
    : isCrashed
      ? 'crashed'
      : raceStarted
        ? 'racing'
        : 'idle'
  const opponentCarState = decided
    ? (iWon ? 'idle' : 'winner')
    : opponentFinished
      ? 'idle'
      : raceStarted
        ? 'racing'
        : 'idle'

  if (loading) {
    return (
      <div style={fullScreen}>
        <p style={muted}>Preparing race...</p>
      </div>
    )
  }

  return (
    <div
      style={{ ...fullScreen, position: 'relative', overflowX: 'hidden' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Invisible input only exists to raise the soft keyboard on mobile.
          Keydown is handled solely by the window listener above, otherwise
          every keypress would be processed twice. */}
      <input
        ref={inputRef}
        style={{ position: 'fixed', opacity: 0, top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none' }}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        readOnly
      />

      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.25 }} />

      {showCountdown && phase !== 'done' && (
        <Countdown onComplete={handleCountdownComplete} />
      )}

      <AnimatePresence>
        {decided && (
          <MatchResultOverlay
            iWon={iWon}
            byForfeit={forfeitWin}
            status={status}
            myTimeMs={myTimeMs}
            winnerTime={winnerTime}
            opponentName={opponentPlayer?.profiles?.display_name}
            tournamentId={tournamentId}
            onNavigate={navigate}
          />
        )}
      </AnimatePresence>

      <div style={content}>
        {/* ─── Header ─── */}
        <div style={headerRow}>
          <div>
            <div style={title}>{tournament?.name || 'Race'}</div>
            <div style={subtitle}>
              <span>{getRoundName(round?.round_number || 1, totalRounds)}</span>
              <span>•</span>
              <span>{MATCH_STATUS_LABEL[status] || status}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ErrorCounter errors={errors} shakeTrigger={shakeTrigger} crashTrigger={crashTrigger} />
            <RaceTimer
              raceStarted={raceStarted}
              stopped={isFinished}
              finalMs={isFinished && myTimeMs ? myTimeMs : null}
            />
          </div>
        </div>

        {/* ─── READY gate ─── */}
        {phase === 'ready_gate' && (
          <div style={panel}>
            <div style={panelTitle}>
              {amReady ? 'Waiting for your opponent…' : 'Ready to race?'}
            </div>
            <p style={{ ...muted, textAlign: 'center', marginBottom: '20px', fontSize: '14px' }}>
              Both players must be READY before the countdown starts.
            </p>

            <div style={readyRow}>
              <ReadyPill
                name="You"
                ready={amReady}
                isMe
              />
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700 }}>
                VS
              </div>
              <ReadyPill
                name={opponentPlayer?.profiles?.display_name || 'Opponent'}
                ready={!!opponentReady}
              />
            </div>

            <motion.button
              whileHover={amReady ? {} : { scale: 1.02 }}
              whileTap={amReady ? {} : { scale: 0.98 }}
              className="btn-primary"
              style={{ width: '100%', padding: '14px', marginTop: '24px', fontSize: '15px' }}
              disabled={amReady}
              onClick={handleReady}
            >
              {amReady ? 'READY ✓' : startingRace ? 'Starting…' : "I'M READY"}
            </motion.button>

            {amReady && (
              <p style={{ ...muted, textAlign: 'center', marginTop: '12px', fontSize: '12px' }}>
                Leaving this screen clears your READY flag.
              </p>
            )}
          </div>
        )}

        {/* ─── Waiting for opponent ─── */}
        {phase === 'waiting' && (
          <div style={panel}>
            <div style={panelTitle}>Finished!</div>
            <div style={waitingRow}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                style={spinner}
              />
              <span style={{ ...muted, fontSize: '14px' }}>
                {submitting
                  ? 'Saving your time…'
                  : `Waiting for ${opponentPlayer?.profiles?.display_name || 'your opponent'} to finish…`}
              </span>
            </div>
            {myTimeMs && (
              <div style={timeBox}>{formatTime(myTimeMs)}</div>
            )}
          </div>
        )}

        {(phase === 'racing' || phase === 'waiting') && (
          <>
            {/* ─── Race Track ─── */}
            <motion.div
              animate={crashTrigger > 0 ? {
                backgroundColor: ['rgba(239,68,68,0)', 'rgba(239,68,68,0.12)', 'rgba(239,68,68,0)'],
              } : {}}
              transition={{ duration: 0.6 }}
              style={trackCard}
            >
              <div style={trackLabels}>
                <span>START</span>
                <span>FINISH</span>
              </div>

              <RaceTrack
                player={myPlayer?.profiles}
                progress={progress}
                isCurrentPlayer={true}
                carState={myCarState}
                colorIndex={0}
              />
              <RaceTrack
                player={opponentPlayer?.profiles}
                progress={opponentProgress}
                isCurrentPlayer={false}
                carState={opponentCarState}
                colorIndex={1}
              />
            </motion.div>

            <div style={{ marginBottom: '16px' }}>
              <TypingText phrase={phrase} typedText={typedText} currentIndex={currentIndex} />
            </div>

            <div style={progressTrack}>
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                style={progressFill}
              />
            </div>

            <div style={hint}>
              {isFinished ? 'Waiting for the result…' : 'Type the text above — every character counts'}
            </div>
          </>
        )}

        {submitError && (
          <div style={{ ...panel, marginTop: '16px', borderColor: 'rgba(239,68,68,0.35)' }}>
            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '10px' }}>{submitError}</div>
            <p style={{ ...muted, fontSize: '12px' }}>
              Reload this page to retry — duplicate submissions are ignored by the server.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Ready pill ─────────────────────────────────────────────────────────────
function ReadyPill({ name, ready, isMe }) {
  return (
    <div style={{
      flex: 1,
      padding: '16px',
      borderRadius: '12px',
      background: ready ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${ready ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`,
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '15px',
        fontWeight: 700,
        color: ready ? '#10b981' : 'rgba(255,255,255,0.45)',
        letterSpacing: '0.05em',
        marginBottom: '4px',
      }}>
        {isMe ? 'YOU' : (name || 'OPPONENT')}
      </div>
      <div style={{
        fontSize: '11px',
        fontFamily: 'Rajdhani, sans-serif',
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: ready ? '#10b981' : 'rgba(255,255,255,0.25)',
      }}>
        {ready ? 'READY' : 'NOT READY'}
      </div>
    </div>
  )
}

// ─── Match Result Overlay ────────────────────────────────────────────────────
function MatchResultOverlay({
  iWon, byForfeit, status, myTimeMs, winnerTime, opponentName, tournamentId, onNavigate,
}) {
  const target = tournamentId ? `/tournament/${tournamentId}` : '/dashboard'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={overlay}
    >
      <motion.div
        initial={{ scale: 0.8, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="glass-card"
        style={{ padding: '48px', textAlign: 'center', maxWidth: '440px', width: '100%' }}
      >
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>{iWon ? '🏆' : '😔'}</div>
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
        <p style={{ ...muted, marginBottom: '24px', fontSize: '15px' }}>
          {byForfeit
            ? `${opponentName || 'Your opponent'} left the match.`
            : status === 'forfeit'
              ? 'You left the match.'
              : iWon
                ? `You beat ${opponentName || 'your opponent'}!`
                : `${opponentName || 'Your opponent'} wins this round.`}
        </p>

        {(winnerTime || myTimeMs) && (
          <div style={timeBox}>
            {formatTime(iWon ? (myTimeMs || winnerTime) : winnerTime || myTimeMs)}
          </div>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn-primary"
          style={{ width: '100%', padding: '14px', fontSize: '15px' }}
          onClick={() => onNavigate(target, { replace: true })}
        >
          {iWon ? 'Continue to Tournament →' : 'Back to Tournament'}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const fullScreen = {
  minHeight: '100vh',
  background: '#080b14',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const muted = { color: 'rgba(255,255,255,0.5)', margin: 0 }
const content = { position: 'relative', zIndex: 1, maxWidth: '1000px', margin: '0 auto', padding: '24px 20px', width: '100%' }
const headerRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  flexWrap: 'wrap', gap: '12px', marginBottom: '28px',
}
const title = { fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', fontWeight: 800, color: 'white' }
const subtitle = {
  display: 'flex', gap: '10px', marginTop: '4px', fontSize: '13px',
  color: 'rgba(255,255,255,0.4)', fontFamily: 'Rajdhani, sans-serif',
  fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
}
const panel = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px', padding: '28px', marginBottom: '24px',
}
const panelTitle = {
  fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', fontWeight: 800,
  color: 'white', textAlign: 'center', marginBottom: '8px',
}
const readyRow = { display: 'flex', alignItems: 'center', gap: '14px' }
const waitingRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '12px', marginBottom: '20px',
}
const spinner = {
  width: '18px', height: '18px', borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.15)',
  borderTopColor: '#00f5ff',
}
const timeBox = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px', padding: '14px', marginBottom: '24px',
  fontFamily: 'JetBrains Mono, monospace', fontSize: '22px', color: '#00f5ff',
  textAlign: 'center',
}
const trackCard = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px', padding: '20px', marginBottom: '24px',
}
const trackLabels = {
  display: 'flex', justifyContent: 'space-between', marginBottom: '12px',
  fontSize: '11px', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
  letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
}
const progressTrack = {
  height: '4px', background: 'rgba(255,255,255,0.06)',
  borderRadius: '2px', overflow: 'hidden', marginBottom: '12px',
}
const progressFill = {
  height: '100%', background: 'linear-gradient(90deg, #00f5ff, #8b5cf6)',
  borderRadius: '2px', boxShadow: '0 0 10px rgba(0,245,255,0.4)',
}
const hint = { textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }
const overlay = {
  position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(8,11,20,0.9)',
  backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: '24px',
}