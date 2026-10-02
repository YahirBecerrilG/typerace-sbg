import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useRace } from '../hooks/useRace'
import { useMatchRealtime, useLiveMatch } from '../hooks/useTournament'
import { Countdown } from '../components/Countdown'
import { RaceTrack } from '../components/RaceTrack'
import { TypingText } from '../components/TypingText'
import { ErrorCounter } from '../components/ErrorCounter'
import { RaceTimer } from '../components/RaceTimer'
import { LiveTypingMetrics, ProgressRail } from '../components/TypingTelemetry'
import {
  submitRaceResult,
  setMatchReady,
  setMatchPresence,
  startRace,
  recordRaceStart,
} from '../services/raceService'
import { getTotalRounds } from '../utils/bracket'
import { myPlayerInMatch, isTerminalMatchStatus } from '../utils/matchNavigation'
import { formatTime } from '../utils/typing'
import { useI18n, useLabels } from '../i18n'
import { AppShell } from '../components/ui/AppShell'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { LoadingScreen } from '../components/ui/LoadingScreen'

/**
 * Race screen.
 *
 * Composition: identity, then the two competitors as clearly separated panels,
 * then the track where their progress is visible side by side, then the phrase,
 * then the telemetry.
 *
 * The purple/cyan treatment is used with restraint — the accents live on the
 * two players, the live progress and the timer, so they carry meaning instead
 * of colouring everything. There is no card wrapping every single element.
 *
 * Nothing here changes how the race runs: the READY gate, the countdown, the
 * crash rule, the single idempotent submit, the presence flags, the broadcast
 * payloads and the URL-tampering guard are all exactly as they were.
 */
export default function Race() {
  const { matchId, raceId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const labels = useLabels()
  const motionSafe = !useReducedMotion()

  const { match, loading, error } = useLiveMatch(matchId)

  const [phrase, setPhrase] = useState('')

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
  // Never translated: phrases are English in every locale.
  useEffect(() => {
    const r = match?.races?.[0]
    if (r?.phrases?.text) setPhrase(r.phrases.text)
  }, [match])

  // ─── Identify the two players ─────────────────────────────────────────────
  // Derived from the loaded match instead of being stored in state. The URL is
  // attacker-controlled, so "am I actually in this match?" must be answered from
  // the server's row, synchronously — an effect would leave one render where
  // `myPlayer` is still null and the opponent is already on screen.
  const myPlayer = myPlayerInMatch(match, user?.id)
  const opponentPlayer =
    match?.player1_id === myPlayer?.id ? match?.player2
      : match?.player2_id === myPlayer?.id ? match?.player1
        : null

  const iAmPlayer1 = match?.player1_id === myPlayer?.id
  const opponentReady = iAmPlayer1 ? match?.player2_ready : match?.player1_ready

  // ─── Terminal match: Back must not reopen a decided race ──────────────────
  // The overlay stays visible (the player still sees the result). Instead of
  // auto-navigating, we plant a sentinel entry so Back is swallowed here, and
  // the overlay's own CTA leaves with replace() to consume it.
  const isTerminal = !!status && isTerminalMatchStatus(status)
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
  // Only once we are confirmed to be one of the two players, so a stranger who
  // guessed a match URL never issues writes at all.
  useEffect(() => {
    if (!matchId || !myPlayer) return
    setMatchPresence(matchId, true)
    return () => {
      // Fire-and-forget: clears our READY flag so nobody waits forever.
      setMatchPresence(matchId, false)
    }
  }, [matchId, myPlayer])

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
    totalKeystrokes,
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

  if (loading || authLoading) {
    return (
      <AppShell>
        <LoadingScreen label={t('race.loading')} />
      </AppShell>
    )
  }

  // The match could not be read (wrong id, or RLS refused it because this user
  // is neither a competitor nor the host). Nothing about the match is rendered.
  if (!match || error) {
    return <RaceUnavailable />
  }

  // URL tampering guard: the row loaded, but this session is not one of the two
  // players. Rendering anyway would leak the opponent's display name and the
  // phrase to a third party, so the screen is refused instead.
  if (!myPlayer) {
    return <RaceUnavailable />
  }

  return (
    <AppShell width="shell">
      {/* Click anywhere to re-focus the capture input on touch devices. */}
      <div onClick={() => inputRef.current?.focus()}>
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
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

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
            motionSafe={motionSafe}
          />
        )}
      </AnimatePresence>

      <main className="pb-20">
        {/* ─── Identity ─── */}
        <header className="mb-10 flex flex-wrap items-end justify-between gap-5 pt-8">
          <div className="min-w-0">
            <span className="eyebrow">{t('race.eyebrow')}</span>
            <h1
              className="display-s mt-4 overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ color: 'var(--text-primary)' }}
            >
              {tournament?.name || t('race.titleFallback')}
            </h1>
            <p
              className="font-racing mt-3 flex flex-wrap items-center gap-2.5 text-[12px] font-semibold uppercase"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
            >
              <span style={{ color: 'var(--cyan)' }}>
                {labels.roundName(round?.round_number || 1, totalRounds)}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span>{labels.matchStatus(status)}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <ErrorCounter errors={errors} shakeTrigger={shakeTrigger} crashTrigger={crashTrigger} />
            <RaceTimer
              raceStarted={raceStarted}
              stopped={isFinished}
              finalMs={isFinished && myTimeMs ? myTimeMs : null}
            />
          </div>
        </header>

        {/* ═══ READY gate — the two competitors, clearly separated ════════ */}
        {phase === 'ready_gate' && (
          <motion.section
            initial={motionSafe ? { opacity: 0, y: 18 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="panel panel-accent panel-pad-lg mb-10 text-center"
          >
            <h2 className="display-m" style={{ color: 'var(--text-primary)' }}>
              {amReady ? t('race.waitingOpponent') : t('race.readyTitle')}
            </h2>
            <p className="body-copy mx-auto mt-4 max-w-md">{t('race.readyHelp')}</p>

            {/* Head-to-head: two equal-weight competitor panels. */}
            <div className="mx-auto mt-10 grid max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
              <CompetitorPanel
                name={myPlayer?.profiles?.display_name || t('common.youShort')}
                ready={amReady}
                isMine
              />
              <span
                className="font-racing text-sm font-extrabold tracking-[0.18em]"
                style={{ color: 'var(--text-muted)' }}
              >
                VS
              </span>
              <CompetitorPanel
                name={opponentPlayer?.profiles?.display_name || t('common.opponent')}
                ready={!!opponentReady}
              />
            </div>

            <motion.button
              whileHover={motionSafe && !amReady ? { scale: 1.02 } : undefined}
              whileTap={motionSafe && !amReady ? { scale: 0.98 } : undefined}
              className="btn-primary btn-xl btn-cta mx-auto mt-10"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              disabled={amReady}
              onClick={handleReady}
            >
              {amReady ? t('race.readyDone') : startingRace ? t('race.starting') : t('race.readyCta')}
            </motion.button>

            {amReady && (
              <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('race.leavingNote')}
              </p>
            )}
          </motion.section>
        )}

        {/* ═══ Waiting for opponent ════════════════════════════════════════ */}
        {phase === 'waiting' && (
          <motion.section
            initial={motionSafe ? { opacity: 0, y: 18 } : false}
            animate={{ opacity: 1, y: 0 }}
            className="panel panel-accent panel-pad-lg mb-10 text-center"
          >
            <h2 className="display-m" style={{ color: 'var(--text-primary)' }}>
              {t('race.finishedTitle')}
            </h2>
            <div className="mt-6 flex items-center justify-center gap-3">
              <span
                className="animate-spin rounded-full border-2"
                style={{
                  width: 18,
                  height: 18,
                  borderColor: 'var(--border-subtle)',
                  borderTopColor: 'var(--neon-cyan)',
                }}
                aria-hidden="true"
              />
              <span className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>
                {submitting
                  ? t('race.savingTime')
                  : t('race.waitingOpponentFinish', {
                      name: opponentPlayer?.profiles?.display_name || t('race.opponentFallback'),
                    })}
              </span>
            </div>
            {myTimeMs && <TimeBox value={formatTime(myTimeMs)} />}
          </motion.section>
        )}

        {(phase === 'racing' || phase === 'waiting') && (
          <>
            {/* ═══ Track — both players, one clear comparison ═══════════════ */}
            <motion.section
              animate={crashTrigger > 0 && motionSafe ? {
                backgroundColor: ['rgba(239,68,68,0)', 'rgba(239,68,68,0.12)', 'rgba(239,68,68,0)'],
              } : {}}
              transition={{ duration: 0.6 }}
              className="panel panel-pad relative mb-8 overflow-hidden"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-grid-fine opacity-30"
              />

              <div className="relative">
                <div
                  className="font-racing mb-4 flex justify-between text-[10px] font-bold uppercase"
                  style={{ color: 'var(--text-muted)', letterSpacing: '0.16em' }}
                >
                  <span>{t('race.start')}</span>
                  <span>{t('race.finish')}</span>
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
              </div>
            </motion.section>

            {/* ═══ Phrase — JetBrains Mono, English, untouched ═════════════ */}
            <div className="mb-6">
              <TypingText phrase={phrase} typedText={typedText} currentIndex={currentIndex} scale="md" />
            </div>

            <div className="mb-7">
              <ProgressRail value={progress} />
            </div>

            {/* ═══ Telemetry ═════════════════════════════════════════════════ */}
            <LiveTypingMetrics
              correctChars={currentIndex}
              totalKeystrokes={totalKeystrokes}
              errors={errors}
              startTime={startTime}
              endTime={endTime}
              running={raceStarted && !isFinished}
            />

            <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              {isFinished ? t('race.hintWaiting') : t('race.hint')}
            </p>
          </>
        )}

        {submitError && (
          <div
            className="panel mt-6 p-5"
            style={{ borderColor: 'rgba(239,68,68,0.35)' }}
          >
            <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '8px' }}>{submitError}</div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('race.retryNote')}
            </p>
          </div>
        )}
      </main>
    </AppShell>
  )
}

// ─── Access denied / not found ─────────────────────────────────────────────
/**
 * Shown when the match cannot be shown to this session: a wrong id, a match the
 * user is not competing in, or a row RLS refused to return.
 *
 * The copy is deliberately identical in every failure case and names no
 * opponent, no round and no reason, so this screen cannot be used to probe which
 * match ids exist or who is in them.
 */
function RaceUnavailable() {
  const navigate = useNavigate()
  const { t } = useI18n()

  return (
    <AppShell width="panel">
      <main className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <span className="mb-4 text-[48px] leading-none" aria-hidden="true">🔒</span>
        <h1
          className="font-racing mb-3 text-3xl font-extrabold"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('race.unavailableTitle')}
        </h1>
        <p className="mb-7 max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('race.unavailableBody')}
        </p>
        <button
          className="btn-primary btn-lg"
          onClick={() => navigate('/dashboard', { replace: true })}
        >
          {t('common.backToDashboard')}
        </button>
      </main>
    </AppShell>
  )
}

// ─── Competitor panel ───────────────────────────────────────────────────────
/** One side of the head-to-head on the READY gate. */
function CompetitorPanel({ name, ready, isMine = false }) {
  const { t } = useI18n()
  const accent = isMine ? '#00f5ff' : '#8b5cf6'

  return (
    <div
      className="min-w-0 px-3 py-6 sm:px-6 sm:py-8"
      style={{
        borderRadius: 'var(--radius-lg)',
        background: ready ? 'rgba(16,185,129,0.09)' : 'var(--bg-inset)',
        border: `1px solid ${ready ? 'rgba(16,185,129,0.38)' : 'var(--border-glass)'}`,
        boxShadow: ready ? '0 0 34px -16px rgba(16,185,129,0.7)' : 'none',
      }}
    >
      <div
        className="font-racing overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold sm:text-lg"
        style={{ color: ready ? '#10b981' : 'var(--text-secondary)' }}
        title={name}
      >
        {name}
      </div>
      <div
        className="font-racing mt-2 text-[10px] font-bold uppercase"
        style={{ color: ready ? '#10b981' : accent, letterSpacing: '0.14em' }}
      >
        {ready ? t('labels.matchStatus.ready') : '—'}
      </div>
    </div>
  )
}

/** Final time. JetBrains Mono so digits never jitter while typing. */
function TimeBox({ value }) {
  return (
    <div
      className="mx-auto mt-8 w-fit px-8 py-5"
      style={{
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-inset)',
        border: '1px solid var(--border-glass)',
      }}
    >
      <span className="num text-[26px] font-bold" style={{ color: '#00f5ff' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Match Result Overlay ────────────────────────────────────────────────────
function MatchResultOverlay({
  iWon, byForfeit, status, myTimeMs, winnerTime, opponentName, tournamentId, onNavigate, motionSafe,
}) {
  const { t } = useI18n()
  const target = tournamentId ? `/tournament/${tournamentId}` : '/dashboard'
  const opponent = opponentName || t('race.opponentFallback')

  const message = byForfeit
    ? t('race.victoryByForfeit', { name: opponent })
    : status === 'forfeit'
      ? t('race.defeatByForfeit')
      : iWon
        ? t('race.beatOpponent', { name: opponent })
        : t('race.opponentWins', { name: opponent })

  const glow = iWon ? '16,185,129' : '239,68,68'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
      style={{
        background: 'rgba(5,6,14,0.9)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <motion.div
        initial={motionSafe ? { scale: 0.94, y: 24 } : false}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="panel panel-accent relative w-full overflow-hidden text-center"
        style={{ padding: 'clamp(30px, 6vw, 52px)', maxWidth: 480 }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(460px 260px at 50% 0%, rgba(${glow},0.24), transparent 70%)`,
          }}
        />

        <div className="relative">
          <span className="mb-5 block text-[58px] leading-none" aria-hidden="true">
            {iWon ? '🏆' : '😔'}
          </span>

          <div
            className="font-racing font-black"
            style={{
              fontSize: 'clamp(32px, 7vw, 46px)',
              lineHeight: 1,
              color: iWon ? '#10b981' : '#ef4444',
              textShadow: `0 0 34px rgba(${glow},0.5)`,
            }}
          >
            {iWon ? t('race.victory') : t('race.defeat')}
          </div>

          <p className="mt-5 text-[15px]" style={{ color: 'var(--text-secondary)' }}>
            {message}
          </p>

          {(winnerTime || myTimeMs) && (
            <div className="mt-8">
              <TimeBox value={formatTime(iWon ? (myTimeMs || winnerTime) : winnerTime || myTimeMs)} />
            </div>
          )}

          <motion.button
            whileHover={motionSafe ? { scale: 1.02 } : undefined}
            whileTap={motionSafe ? { scale: 0.98 } : undefined}
            className="btn-primary btn-xl btn-cta mt-9"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => onNavigate(target, { replace: true })}
          >
            {iWon ? t('race.continue') : t('race.backToTournament')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}