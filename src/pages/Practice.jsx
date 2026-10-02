import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../hooks/useAuth'
import { useRace } from '../hooks/useRace'
import { TypingText } from '../components/TypingText'
import { ErrorCounter } from '../components/ErrorCounter'
import { RaceTimer } from '../components/RaceTimer'
import { recordPractice } from '../services/tournamentService'
import { calculateWPM, calculateAccuracy, formatTime } from '../utils/typing'
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Practice / qualifier.
 *
 * Runs against a throwaway phrase and only ever writes to record_practice().
 * It never creates a match, a race or a race_result, so it can never change
 * the bracket — it only moves the player's seeding position.
 *
 * There is no countdown: the player starts typing the moment the screen opens,
 * and every attempt draws a different English phrase from the pool.
 */
export default function Practice() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [phrase, setPhrase] = useState('')
  const [phase, setPhase] = useState('idle') // idle | typing | done
  const [stats, setStats] = useState(null)
  const [myBest, setMyBest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notOpen, setNotOpen] = useState(null)

  const inputRef = useRef(null)
  const phraseIdRef = useRef(null)
  const raceStarted = phase === 'typing'

  // Draws a phrase the player has not just run. The server does the picking so
  // the pool stays private to SQL and every attempt is a real random draw.
  const loadNextPhrase = useCallback(async (difficulty) => {
    const { data, error } = await supabase.rpc('practice_phrase', {
      p_difficulty: difficulty ?? null,
      p_exclude_id: phraseIdRef.current,
    })

    if (error) {
      console.error('practice_phrase error:', error)
      throw new Error(error.message || 'Could not load a phrase.')
    }
    if (!data?.text) throw new Error('Could not load a phrase.')

    phraseIdRef.current = data.id
    setPhrase(data.text)
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const { data: t, error: tErr } = await supabase
          .from('tournaments')
          .select('difficulty, host_id')
          .eq('id', tournamentId)
          .maybeSingle()

        if (cancelled) return
        if (tErr) throw tErr

        if (t && t.host_id === user.id) {
          setNotOpen('You are the host of this tournament. Hosts run it, they do not compete in it.')
          return
        }

        const { data: tp, error } = await supabase
          .from('tournament_players')
          .select('best_wpm, practice_runs, practice_score, status')
          .eq('tournament_id', tournamentId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelled) return

        if (error) throw error

        if (!tp) {
          setNotOpen('You are not registered for this tournament.')
        } else if (tp.status !== 'active') {
          setNotOpen('Practice is only available while you are still in the tournament.')
        } else {
          setMyBest(tp)
        }

        await loadNextPhrase(t?.difficulty)
      } catch (err) {
        if (!cancelled) toast.error(err.message || 'Could not load practice.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [tournamentId, user, loadNextPhrase])

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
      toast.error(err.message || 'Could not save your practice score.')
    }
  }, [tournamentId])

  const {
    typedText,
    currentIndex,
    errors,
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
      toast.error(err.message || 'Could not load a new phrase.')
    }
  }

  if (loading) {
    return (
      <div style={screen}>
        <p style={muted}>Loading practice...</p>
      </div>
    )
  }

  if (notOpen) {
    return (
      <div style={screen}>
        <div style={{ textAlign: 'center', maxWidth: '440px' }}>
          <h1 style={title}>Practice unavailable</h1>
          <p style={{ ...muted, marginBottom: '24px', fontSize: '14px' }}>{notOpen}</p>
          <button className="btn-primary" onClick={() => navigate(`/lobby/${tournamentId}`)}>
            Back to lobby
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...screen, alignItems: 'flex-start', paddingTop: '40px' }} onClick={() => inputRef.current?.focus()}>
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

      <div style={content}>
        <div style={headerRow}>
          <button
            className="btn-ghost"
            onClick={() => navigate(`/lobby/${tournamentId}`)}
            style={{ fontSize: '13px', padding: '10px 14px' }}
          >
            <ArrowLeft size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
            Lobby
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ErrorCounter errors={errors} shakeTrigger={shakeTrigger} crashTrigger={crashTrigger} />
            <RaceTimer
              raceStarted={raceStarted}
              stopped={isFinished}
              finalMs={isFinished && endTime && startTime ? endTime - startTime : null}
            />
          </div>
        </div>

        <div style={panel}>
          <div style={panelTitle}>Qualifier practice</div>
          <p style={{ ...muted, textAlign: 'center', fontSize: '13px', marginBottom: '24px' }}>
            This is not a match. It only improves your seed for the bracket.
          </p>

          {/* Current / best stats */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <StatBox label="Best WPM" value={myBest?.best_wpm ? Number(myBest.best_wpm).toFixed(0) : '—'} />
            <StatBox label="Runs" value={myBest?.practice_runs ?? 0} />
            <StatBox
              label="Seed score"
              value={myBest?.practice_score ? Number(myBest.practice_score).toFixed(1) : '—'}
              accent
            />
          </div>

          {stats && (
            <div style={{
              display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap',
              padding: '16px', borderRadius: '12px',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            }}>
              <StatBox label="WPM" value={stats.wpm.toFixed(0)} accent />
              <StatBox label="Accuracy" value={`${stats.accuracy.toFixed(0)}%`} />
              <StatBox label="Time" value={formatTime(stats.elapsedMs)} />
            </div>
          )}

          {phase === 'idle' && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '16px' }}
              onClick={() => setPhase('typing')}
            >
              <Trophy size={18} style={{ marginRight: '8px', verticalAlign: '-3px' }} />
              {myBest?.practice_runs > 0 ? 'Practise again' : 'Start practice'}
            </motion.button>
          )}

          {phase === 'typing' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <TypingText phrase={phrase} typedText={typedText} currentIndex={currentIndex} />
              </div>
              <p style={{ ...muted, textAlign: 'center', fontSize: '12px' }}>
                {isFinished ? 'Saving your score...' : 'Type the phrase above'}
              </p>
            </div>
          )}

          {phase === 'done' && (
            <button
              className="btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '16px' }}
              onClick={restart}
            >
              <RotateCcw size={18} style={{ marginRight: '8px', verticalAlign: '-3px' }} />
              Run again
            </button>
          )}
        </div>

        <AnimatePresence>
          {isCrashed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{
                textAlign: 'center', padding: '14px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px',
                fontFamily: 'Rajdhani, sans-serif', fontSize: '16px',
                fontWeight: 800, color: '#ef4444', letterSpacing: '0.08em',
              }}
            >
              4 ERRORS — BACK TO START
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function StatBox({ label, value, accent }) {
  return (
    <div style={{
      flex: '1 1 90px', padding: '12px', textAlign: 'center',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(0,245,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '10px',
    }}>
      <div style={{
        fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', fontWeight: 800,
        color: accent ? '#00f5ff' : 'white',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '10px', color: 'rgba(255,255,255,0.35)',
        fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '2px',
      }}>
        {label}
      </div>
    </div>
  )
}

const screen = {
  minHeight: '100vh', background: '#080b14', position: 'relative',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const muted = { color: 'rgba(255,255,255,0.45)', margin: 0 }
const title = { fontFamily: 'Rajdhani, sans-serif', fontSize: '28px', fontWeight: 800, color: 'white', marginBottom: '10px' }
const content = { position: 'relative', zIndex: 1, maxWidth: '720px', margin: '0 auto', width: '100%' }
const headerRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '12px', marginBottom: '20px',
}
const panel = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px', padding: '28px',
}
const panelTitle = {
  fontFamily: 'Rajdhani, sans-serif', fontSize: '22px', fontWeight: 800,
  color: 'white', textAlign: 'center', marginBottom: '6px',
}