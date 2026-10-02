import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MAX_ERRORS, calculateProgress, throttle } from '../utils/typing'

const CRASH_RESET_DELAY_MS = 1200

/**
 * Core racing / typing engine hook.
 * Handles local typing state and throttled realtime broadcasts.
 */
export function useRace({
  phrase,
  matchId,
  playerId,
  onBroadcastProgress,
  onFinish,
  raceStarted = false,
}) {
  const [typedText, setTypedText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [errors, setErrors] = useState(0)
  const [totalKeystrokes, setTotalKeystrokes] = useState(0)
  const [isCrashed, setIsCrashed] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [shakeTrigger, setShakeTrigger] = useState(0)
  const [crashTrigger, setCrashTrigger] = useState(0)

  const isCrashedRef = useRef(false)
  const isFinishedRef = useRef(false)
  const typedRef = useRef('')
  const currentIndexRef = useRef(0)
  const errorsRef = useRef(0)
  const keystrokesRef = useRef(0)
  const crashTimerRef = useRef(null)

  // playerId / matchId / onBroadcastProgress resolve asynchronously (myPlayer is
  // loaded in an effect), so the broadcaster must read the CURRENT values instead
  // of the ones captured on the first render.
  const liveRef = useRef({ playerId, matchId, onBroadcastProgress })
  useEffect(() => {
    liveRef.current = { playerId, matchId, onBroadcastProgress }
  })

  const progress = calculateProgress(currentIndex, phrase?.length || 1)

  const broadcastNow = useCallback((prog, errs) => {
    const live = liveRef.current
    live.onBroadcastProgress?.({
      playerId: live.playerId,
      matchId: live.matchId,
      progress: prog,
      errors: errs,
    })
  }, [])

  // Throttled broadcast — max 1 update per 100ms
  const broadcastThrottled = useMemo(
    () => throttle((prog, errs) => broadcastNow(prog, errs), 100),
    [broadcastNow]
  )

  const resetTyping = useCallback(() => {
    if (crashTimerRef.current) {
      clearTimeout(crashTimerRef.current)
      crashTimerRef.current = null
    }

    setTypedText('')
    setCurrentIndex(0)
    setErrors(0)
    setIsCrashed(false)

    isCrashedRef.current = false
    typedRef.current = ''
    currentIndexRef.current = 0
    errorsRef.current = 0

    // Local-only reset. startTime / endTime / isFinished are deliberately left
    // untouched so the race timer keeps running and the match is not restarted.
    // Broadcast unthrottled: the opponent's view of this player must never be
    // left stuck on the pre-crash progress.
    broadcastNow(0, 0)
  }, [broadcastNow])

  // Full reset: clears the timer and the finished flag as well.
  // Used when a whole new run begins (e.g. practice "run again").
  // Deliberately separate from resetTyping, which must NOT restart the timer.
  const resetRace = useCallback(() => {
    resetTyping()
    setTotalKeystrokes(0)
    setIsFinished(false)
    setStartTime(null)
    setEndTime(null)
    isFinishedRef.current = false
    keystrokesRef.current = 0
  }, [resetTyping])

  const handleKeyPress = useCallback((key) => {
    if (!raceStarted || isFinishedRef.current || isCrashedRef.current) return
    if (!phrase || key.length !== 1) return

    const expectedChar = phrase[currentIndexRef.current]
    if (expectedChar === undefined) return

    setTotalKeystrokes((k) => k + 1)
    keystrokesRef.current += 1

    if (key === expectedChar) {
      // Correct character
      const newIndex = currentIndexRef.current + 1
      const newTyped = typedRef.current + key

      currentIndexRef.current = newIndex
      typedRef.current = newTyped

      setCurrentIndex(newIndex)
      setTypedText(newTyped)

      const prog = calculateProgress(newIndex, phrase.length)
      broadcastThrottled(prog, errorsRef.current)

      // Check finish
      if (newIndex >= phrase.length) {
        const now = Date.now()
        setEndTime(now)
        setIsFinished(true)
        isFinishedRef.current = true
        onFinish?.({
          typedText: newTyped,
          elapsedMs: now - startTime,
          errors: errorsRef.current,
          totalKeystrokes: keystrokesRef.current,
        })
      }
    } else {
      // Wrong character
      const newErrors = errorsRef.current + 1
      errorsRef.current = newErrors
      setErrors(newErrors)
      setShakeTrigger((s) => s + 1)

      if (newErrors >= MAX_ERRORS) {
        // CRASH — freeze input, play the animation, then hand control back.
        // isCrashedRef guards synchronously so the same keypress cannot slip
        // through before React re-renders.
        isCrashedRef.current = true
        setIsCrashed(true)
        setCrashTrigger((c) => c + 1)

        // Publish the crash immediately (unthrottled) so the opponent sees the
        // player hit MAX_ERRORS rather than a frozen frame.
        broadcastNow(calculateProgress(currentIndexRef.current, phrase.length), newErrors)

        if (crashTimerRef.current) clearTimeout(crashTimerRef.current)
        crashTimerRef.current = setTimeout(() => {
          crashTimerRef.current = null
          resetTyping()
        }, CRASH_RESET_DELAY_MS)
      }
    }
  }, [raceStarted, phrase, startTime, broadcastThrottled, broadcastNow, resetTyping, onFinish])

  // Cancel a pending crash reset if the component unmounts mid-animation
  useEffect(() => {
    return () => {
      if (crashTimerRef.current) clearTimeout(crashTimerRef.current)
    }
  }, [])

  // Record start time when race begins
  useEffect(() => {
    if (raceStarted && !startTime) {
      setStartTime(Date.now())
    }
  }, [raceStarted, startTime])

  return {
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
    resetTyping,
    resetRace,
  }
}
