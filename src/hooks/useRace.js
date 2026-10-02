import { useState, useEffect, useRef, useCallback } from 'react'
import { MAX_ERRORS, calculateProgress, throttle } from '../utils/typing'

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

  const progress = calculateProgress(currentIndex, phrase?.length || 1)

  // Throttled broadcast — max 1 update per 100ms
  const broadcastThrottled = useRef(
    throttle((prog, errs) => {
      onBroadcastProgress?.({
        playerId,
        matchId,
        progress: prog,
        errors: errs,
      })
    }, 100)
  ).current

  const resetTyping = useCallback(() => {
    setTypedText('')
    setCurrentIndex(0)
    setErrors(0)
    setIsCrashed(false)
    isCrashedRef.current = false
    typedRef.current = ''
    currentIndexRef.current = 0
    errorsRef.current = 0

    broadcastThrottled(0, 0)
  }, [broadcastThrottled])

  const handleKeyPress = useCallback((key) => {
    if (!raceStarted || isFinishedRef.current || isCrashedRef.current) return
    if (!phrase || key.length !== 1) return

    const expectedChar = phrase[currentIndexRef.current]
    if (expectedChar === undefined) return

    setTotalKeystrokes((k) => k + 1)

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
        })
      }
    } else {
      // Wrong character
      const newErrors = errorsRef.current + 1
      errorsRef.current = newErrors
      setErrors(newErrors)
      setShakeTrigger((s) => s + 1)

      if (newErrors >= MAX_ERRORS) {
        // CRASH — reset everything
        isCrashedRef.current = true
        setIsCrashed(true)
        setCrashTrigger((c) => c + 1)

        setTimeout(() => {
          resetTyping()
        }, 1200)
      }
    }
  }, [raceStarted, phrase, startTime, broadcastThrottled, resetTyping, onFinish])

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
  }
}
