import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../services/supabase'
import { getMatch } from '../services/tournamentService'
import { usePostgresChanges } from './useRealtime'

/**
 * Tournament lobby realtime hook.
 * Listens on a broadcast channel for lobby events.
 */
export function useTournamentRealtime({ tournamentId, onEvent, enabled = true }) {
  const channelRef = useRef(null)
  // Keep the callback current without resubscribing the channel on every render
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    if (!enabled || !tournamentId) return

    const channel = supabase.channel(`tournament:${tournamentId}`)

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        onEventRef.current?.(payload.event, payload.payload)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [tournamentId, enabled])

  const broadcast = useCallback(async (event, payload = {}) => {
    if (!channelRef.current) return
    await channelRef.current.send({ type: 'broadcast', event, payload })
  }, [])

  return { broadcast }
}

/**
 * Match / Race realtime hook.
 * Used during an active race for progress updates.
 */
export function useMatchRealtime({ matchId, onEvent, enabled = true }) {
  const channelRef = useRef(null)
  // Keep the callback current without resubscribing the channel on every render
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    if (!enabled || !matchId) return

    const channel = supabase.channel(`match:${matchId}`)

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        onEventRef.current?.(payload.event, payload.payload)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [matchId, enabled])

  const broadcast = useCallback(async (event, payload = {}) => {
    if (!channelRef.current) return
    await channelRef.current.send({ type: 'broadcast', event, payload })
  }, [])

  return { broadcast }
}

/**
 * Keep a match row live.
 *
 * Reads the match once, then re-reads it whenever Postgres reports a change on
 * that row. This is what drives READY/READY, the opponent leaving (forfeit)
 * and the final result — the client never decides any of it.
 */
export function useLiveMatch(matchId, { enabled = true } = {}) {
  const [match, setMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!matchId) return null
    try {
      const data = await getMatch(matchId)
      setMatch(data)
      setError(null)
      return data
    } catch (err) {
      setError(err)
      return null
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Realtime patches arrive as the bare new row, so merge: the embedded
  // player/profile objects in our first read are not part of the payload.
  usePostgresChanges({
    table: 'matches',
    filter: matchId ? `id=eq.${matchId}` : undefined,
    onUpdate: (row) => setMatch((prev) => (prev ? { ...prev, ...row } : prev)),
    onInsert: (row) => setMatch((prev) => (prev ? { ...prev, ...row } : prev)),
    enabled: enabled && !!matchId,
  })

  return { match, loading, error, refresh, setMatch }
}
