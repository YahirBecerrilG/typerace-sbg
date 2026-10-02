import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMatchGateState } from '../services/tournamentService'
import { usePostgresChanges } from './useRealtime'
import { resolveMatchDestination } from '../utils/matchNavigation'

/** Realtime is the fast path; this is the safety net. */
const POLL_INTERVAL_MS = 10000

/**
 * Keeps a waiting player attached to their tournament.
 *
 * The bug this fixes: a player sitting in Practice was never told that the host
 * had opened their round. Practice had no match lookup, no realtime listener and
 * no redirect, so the only way back into the competition was to reload the page
 * and hunt for the tournament by hand.
 *
 * How the destination is chosen:
 *   - an actionable match (waiting_players | ready | racing) wins immediately,
 *     which is what sends the player to the prematch;
 *   - otherwise a completed tournament resolves to the final standings;
 *   - otherwise an eliminated/withdrawn player resolves to the tournament view;
 *   - otherwise the player stays where they are and keeps practising.
 *
 * Two independent signals feed it, so a dropped websocket can never strand a
 * player again:
 *   1. Realtime on rounds / tournaments / matches for this tournament.
 *   2. A low-frequency poll of the server-authoritative answer.
 *
 * Both funnel through `resolve()`, which is also guarded against overlapping
 * runs, so a realtime burst plus a poll tick still navigate exactly once.
 *
 * Navigation always uses `replace: true`. Pushing would let the player press
 * Back into Practice, where this gate would immediately push them forward
 * again, trapping them in a redirect loop.
 */
export function useMatchGate({ tournamentId, userId, enabled = true }) {
  const navigate = useNavigate()

  const [tournament, setTournament] = useState(null)
  const [participant, setParticipant] = useState(null)
  const [match, setMatch] = useState(null)

  // Guards, read and written only inside effects/callbacks.
  const inFlightRef = useRef(false)
  const navigatedToRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // A new destination means the gate must be allowed to act again. Without this
  // a player who leaves the prematch and comes back could be ignored.
  useEffect(() => {
    navigatedToRef.current = null
  }, [tournamentId])

  const resolve = useCallback(async () => {
    if (!enabled || !tournamentId || !userId) return
    // Two triggers can fire in the same tick (realtime + poll). One at a time.
    if (inFlightRef.current) return
    inFlightRef.current = true

    try {
      // One server-authoritative answer. The caller is resolved from auth.uid()
      // inside match_gate_state(), so the client never asserts who it is;
      // `userId` is only consulted by the pre-007 fallback path.
      const { tournament, participant, match } = await getMatchGateState(tournamentId, userId)
      if (!mountedRef.current) return

      setTournament(tournament)
      setParticipant(participant)
      setMatch(match)

      const destination = resolveMatchDestination({ tournament, participant, match })

      if (destination.type === 'stay' || !destination.to) return
      if (navigatedToRef.current === destination.to) return

      navigatedToRef.current = destination.to
      navigate(destination.to, { replace: destination.replace })
    } catch (err) {
      // A transient read failure must never trap or kick the player: the next
      // tick retries. Nothing is rendered from this error.
      console.error('Match gate check failed:', err)
    } finally {
      inFlightRef.current = false
    }
  }, [enabled, tournamentId, userId, navigate])

  // 1. Immediate check. Re-entering Practice with an open match is detected on
  //    the first tick, without waiting for realtime or a poll.
  useEffect(() => {
    resolve()
  }, [resolve])

  // 2. Realtime. `rounds` and `tournaments` are the authoritative triggers for
  //    "the host opened my round"; `matches` covers READY/racing/decided.
  const enabledRealtime = !!(enabled && tournamentId)
  usePostgresChanges({
    table: 'rounds',
    filter: `tournament_id=eq.${tournamentId}`,
    onUpdate: resolve,
    onInsert: resolve,
    enabled: enabledRealtime,
  })
  usePostgresChanges({
    table: 'tournaments',
    filter: `id=eq.${tournamentId}`,
    onUpdate: resolve,
    enabled: enabledRealtime,
  })
  usePostgresChanges({
    table: 'matches',
    onUpdate: resolve,
    onInsert: resolve,
    enabled: enabledRealtime,
  })

  // 3. Poll fallback for when Realtime never arrives: a backgrounded tab, a
  //    dropped socket, or a player who was offline when the round opened.
  useEffect(() => {
    if (!enabled || !tournamentId || !userId) return
    const id = setInterval(resolve, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled, tournamentId, userId, resolve])

  // 4. Coming back to the tab is the most likely moment to have missed an event.
  useEffect(() => {
    if (!enabled || !tournamentId || !userId) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') resolve()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', resolve)
    window.addEventListener('focus', resolve)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', resolve)
      window.removeEventListener('focus', resolve)
    }
  }, [enabled, tournamentId, userId, resolve])

  return { tournament, participant, match, refresh: resolve }
}