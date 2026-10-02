import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Trophy, Target } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { useRace } from '../hooks/useRace'
import { useMatchGate } from '../hooks/useMatchGate'
import { TypingText } from '../components/TypingText'
import { ErrorCounter } from '../components/ErrorCounter'
import { RaceTimer } from '../components/RaceTimer'
import { LiveTypingMetrics, ProgressRail } from '../components/TypingTelemetry'
import { recordPractice } from '../services/tournamentService'
import { practiceUnavailableReason } from '../utils/matchNavigation'
import { calculateWPM, calculateAccuracy, formatTime } from '../utils/typing'
import { useI18n } from '../i18n'
import { usePracticeReason } from '../i18n/reasons'
import { AppShell } from '../components/ui/AppShell'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { LoadingScreen } from '../components/ui/LoadingScreen'

/**
 * Practice / qualifier.
 *
 * Presented as a training mode: the phrase is the single dominant object on the
 * screen, and the telemetry sits underneath it in one clear hierarchy — WPM
 * loudest, accuracy next, errors last.
 *
 * Runs against a throwaway phrase and only ever writes to record_practice().
 * It never creates a match, a race or a race_result, so it can never change
 * the bracket — it only moves the player's seeding position.
 *
 * There is no countdown: the player starts typing the moment the screen opens,
 * and every attempt draws a different English phrase from the pool.
 *
 * Practice is not a dead end. useMatchGate watches this tournament for as long
 * as the screen is open and, the moment the host opens the player's round,
 * navigates to the prematch. It also re-checks on mount, on a timer and on
 * tab focus, so a player who was away (or whose socket dropped) still lands in
 * the right place on the next tick instead of being stranded.
 *
 * Nothing in the data flow, the handlers or the match gate was touched by this
 * redesign — only the composition and the presentation.
 */
export default function Practice() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const localiseReason = usePracticeReason()
  const motionSafe = !useReducedMotion()

  const [phrase, setPhrase] = useState('')
  const [phase, setPhase] = useState('idle') // idle | typing | done
  const [stats, setStats] = useState(null)
  const [myBest, setMyBest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notOpen, setNotOpen] = useState(null)

  const inputRef = useRef(null)
  const phraseIdRef = useRef(null)
  const raceStarted = phase === 'typing'

  // Host authority lives on tournaments.host_id; a host is never a player, so
  // the gate stays off for them and Practice keeps showing the explanatory card.
  const [isHost, setIsHost] = useState(false)
  // The participant row doubles as the gate's master switch: the moment we know
  // this user is a player, the gate starts watching for their match. It stays
  // on even when practice itself is closed, because that is exactly the player
  // who must be pulled into a round that is already running.
  const [participantRow, setParticipantRow] = useState(null)
  const [tournamentRow, setTournamentRow] = useState(null)

  const canWatchForMatch = !isHost && !!participantRow

  const { match } = useMatchGate({
    tournamentId,
    userId: user?.id,
    enabled: canWatchForMatch,
  })

  // Draws a phrase the player has not just run. The server does the picking so
  // the pool stays private to SQL and every attempt is a real random draw.
  const loadNextPhrase = useCallback(async (difficulty) => {
    const { data, error } = await supabase.rpc('practice_phrase', {
      p_difficulty: difficulty ?? null,
      p_exclude_id: phraseIdRef.current,
    })

    if (error) {
      console.error('practice_phrase error:', error)
      throw new Error(error.message || t('practice.phraseFailed'))
    }
    if (!data?.text) throw new Error(t('practice.phraseFailed'))

    phraseIdRef.current = data.id
    setPhrase(data.text)
  }, [t])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        // Named `row`, not `t`: this scope also uses the translate function.
        const { data: row, error: rowError } = await supabase
          .from('tournaments')
          .select('id, difficulty, host_id, status')
          .eq('id', tournamentId)
          .maybeSingle()

        if (cancelled) return
        if (rowError) throw rowError

        setTournamentRow(row)

        if (row?.host_id && row.host_id === user.id) {
          setIsHost(true)
          setNotOpen(
            practiceUnavailableReason({ tournament: row, participant: null, userId: user.id })
          )
          return
        }

        const { data: tp, error: playerError } = await supabase
          .from('tournament_players')
          .select('best_wpm, practice_runs, practice_score, status')
          .eq('tournament_id', tournamentId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return

        if (playerError) throw playerError

        setParticipantRow(tp)

        // One shared policy decides whether practice may run, so the wording
        // here can never drift from the wording used by the match gate.
        setNotOpen(practiceUnavailableReason({ tournament: row, participant: tp, userId: user.id }))

        if (tp?.status === 'active') setMyBest(tp)

        await loadNextPhrase(row?.difficulty)
      } catch (err) {
        if (!cancelled) toast.error(err.message || t('practice.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [tournamentId, user, loadNextPhrase, t])

  // ─── Save the run ─────────────────────────────────────────────────────────
  const handleFinish = useCallback(async ({ typedText, elapsedMs, errors: finalErrors, totalKeystrokes }) => {
    const wpm = calculateWPM(typedText.length, elapsedMs)
    const accuracy = calculateAccuracy(totalKeystrokes, finalErrors)

    setStats({ wpm, accuracy, elapsedMs })
    setPhase('done')

    try {
      const res = await recordPractice(tournamentId, { wpm, accuracy })
      if (res) {
        setMyBest((prev) => ({
          ...prev,
          best_wpm: res.best_wpm,
          avg_wpm: res.avg_wpm,
          practice_runs: res.runs,
          practice_score: res.practice_score,
        }))
      }
    } catch (err) {
      // The run still counts locally; seeding just will not improve.
      toast.error(err.message || t('practice.saveFailed'))
    }
  }, [tournamentId, t])

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
    resetRace,
  } = useRace({
    phrase,
    matchId: null,
    playerId: null,
    onFinish: handleFinish,
    raceStarted,
  })

  // ─── Keyboard ─────────────────────────────────────────────────────────────
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

  // ─── Run again ────────────────────────────────────────────────────────────
  const restart = async () => {
    resetRace()
    setStats(null)
    // No countdown between attempts either: a fresh phrase, then type away.
    setPhase('typing')
    try {
      await loadNextPhrase()
    } catch (err) {
      setPhase('idle')
      toast.error(err.message || t('practice.newPhraseFailed'))
    }
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingScreen label={t('practice.loading')} />
      </AppShell>
    )
  }

  // Where "Practice unavailable" should send the player. Once the bracket exists
  // the lobby is the wrong screen: the tournament view is where matches,
  // placement and the bracket live.
  const tournamentStarted = ['bracket_ready', 'round_active', 'completed'].includes(tournamentRow?.status)
  const exitPath = tournamentStarted
    ? `/tournament/${tournamentId}`
    : `/lobby/${tournamentId}`
  const exitLabel = tournamentStarted ? t('practice.exitTournament') : t('practice.exitLobby')

  if (notOpen) {
    return (
      <AppShell width="panel">
        <main className="flex min-h-[70vh] flex-col items-center justify-center text-center">
          <span className="mb-4 text-[44px] leading-none" aria-hidden="true">🚧</span>
          <h1
            className="font-racing mb-3 text-2xl font-extrabold"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('practice.unavailableTitle')}
          </h1>
          <p className="mb-7 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
            {localiseReason(notOpen)}
          </p>
          <button className="btn-primary btn-lg" onClick={() => navigate(exitPath)}>
            {exitLabel}
          </button>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell width="shell">
      <div onClick={() => inputRef.current?.focus()}>
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

      <main className="pb-20">
        {/* ── Compact header ── */}
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 pt-8">
          <div>
            <span className="eyebrow">{t('practice.eyebrow')}</span>
            <h1 className="display-s mt-4" style={{ color: 'var(--text-primary)' }}>
              {t('practice.title')}
            </h1>
            <p className="caption mt-2 max-w-md">{t('practice.subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <ErrorCounter errors={errors} shakeTrigger={shakeTrigger} crashTrigger={crashTrigger} />
            <RaceTimer
              raceStarted={raceStarted}
              stopped={isFinished}
              finalMs={isFinished && endTime && startTime ? endTime - startTime : null}
            />
            <button className="btn-quiet" onClick={() => navigate(`/lobby/${tournamentId}`)}>
              <ArrowLeft size={14} aria-hidden="true" style={{ marginRight: 7 }} />
              {t('practice.backToLobby')}
            </button>
          </div>
        </header>

        {/* A match exists but is not enterable yet (no race row attached).
            The gate normally redirects the moment it finds one; this is the
            visible fallback so the player is never left guessing. */}
        {match && (
          <div
            className="mb-6 flex items-center gap-2 px-5 py-3 text-[13px]"
            style={{
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#f59e0b',
            }}
            role="status"
          >
            <Target size={15} aria-hidden="true" />
            {t('practice.matchOpening')}
          </div>
        )}

        {/* ═══ The stage: the phrase is the protagonist ═══════════════════ */}
        <section
          className="panel panel-accent relative overflow-hidden"
          style={{ boxShadow: '0 40px 90px -50px rgba(0,245,255,0.4)' }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(900px 420px at 50% -10%, rgba(0,245,255,0.11), transparent 68%),' +
                'radial-gradient(700px 380px at 50% 110%, rgba(139,92,246,0.12), transparent 68%)',
            }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid-fine opacity-40" />

          <div className="relative p-6 sm:p-10 lg:p-14">
            {phase === 'idle' && (
              <motion.button
                whileHover={motionSafe ? { scale: 1.02 } : undefined}
                whileTap={motionSafe ? { scale: 0.98 } : undefined}
                className="btn-primary btn-xl btn-cta"
                style={{ margin: '0 auto', display: 'flex', alignItems: 'center' }}
                onClick={() => setPhase('typing')}
              >
                <Trophy size={18} aria-hidden="true" style={{ marginRight: 9 }} />
                {myBest?.practice_runs > 0 ? t('practice.again') : t('practice.start')}
              </motion.button>
            )}

            {(phase === 'typing' || phase === 'done') && (
              <>
                {/* Typing text: JetBrains Mono, English phrase — untouched. */}
                <TypingText
                  phrase={phrase}
                  typedText={typedText}
                  currentIndex={currentIndex}
                  scale="lg"
                />

                <div className="mt-8">
                  <ProgressRail value={progress} />
                </div>

                <p className="mt-6 text-center text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
                  {isFinished ? t('practice.saving') : t('practice.typeHint')}
                </p>
              </>
            )}

            {phase === 'done' && (
              <div className="mt-9 flex justify-center">
                <button className="btn-primary btn-lg" onClick={restart}>
                  <RotateCcw size={17} aria-hidden="true" style={{ marginRight: 8 }} />
                  {t('practice.runAgain')}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ═══ Telemetry ════════════════════════════════════════════════════ */}
        <section className="mt-8">
          <LiveTypingMetrics
            correctChars={currentIndex}
            totalKeystrokes={totalKeystrokes}
            errors={errors}
            startTime={startTime}
            endTime={endTime}
            running={raceStarted && !isFinished}
          />

          {/* Last completed run, when there is one. */}
          {stats && (
            <motion.div
              initial={motionSafe ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-5"
              style={{
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(16,185,129,0.06)',
                border: '1px solid rgba(16,185,129,0.22)',
              }}
            >
              <SmallStat label={t('practice.lastRun')} value={`${stats.wpm.toFixed(0)} ${t('unit.wpm')}`} />
              <SmallStat label={t('common.accuracy')} value={`${stats.accuracy.toFixed(0)}%`} />
              <SmallStat label={t('race.start')} value={formatTime(stats.elapsedMs)} />
            </motion.div>
          )}
        </section>

        {/* ═══ Qualifier record ════════════════════════════════════════════ */}
        <section className="mt-8">
          <div
            className="mb-5 flex items-end justify-between gap-4 border-b pb-4"
            style={{ borderColor: 'var(--border-glass)' }}
          >
            <span className="eyebrow">{t('practice.recordLabel')}</span>
            <p className="caption max-w-sm text-right">{t('practice.recordHint')}</p>
          </div>

          <div className="grid grid-cols-1 gap-px sm:grid-cols-3" style={{ background: 'var(--border-glass)' }}>
            <RecordMetric
              label={t('practice.bestWpm')}
              value={myBest?.best_wpm ? Number(myBest.best_wpm).toFixed(0) : '—'}
              unit={t('unit.wpm')}
              accent="var(--neon-cyan)"
            />
            <RecordMetric label={t('practice.runs')} value={myBest?.practice_runs ?? 0} />
            <RecordMetric
              label={t('practice.seedScore')}
              value={myBest?.practice_score ? Number(myBest.practice_score).toFixed(1) : '—'}
              accent="var(--violet)"
            />
          </div>
        </section>

        <AnimatePresence>
          {isCrashed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-racing mt-8 text-center font-extrabold tracking-[0.1em]"
              style={{
                padding: '15px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 'var(--radius-lg)',
                fontSize: '16px',
                color: '#ef4444',
              }}
              role="alert"
            >
              {t('practice.crashed')}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </AppShell>
  )
}

function SmallStat({ label, value }) {
  return (
    <div className="text-center">
      <span className="label-xs block">{label}</span>
      <span className="num mt-2 block text-[19px] font-bold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

function RecordMetric({ label, value, unit, accent = 'var(--text-primary)' }) {
  return (
    <div className="metric p-7" style={{ background: 'rgba(10,14,26,0.8)' }}>
      <span className="label-xs">{label}</span>
      <span className="metric-value metric-lg mt-3" style={{ color: accent }}>
        {value}
      </span>
      {unit && <span className="metric-unit mt-2 block">{unit}</span>}
    </div>
  )
}