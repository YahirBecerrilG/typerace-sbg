import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../services/supabase'

/**
 * Tournament lobby realtime hook.
 * Listens on a broadcast channel for lobby events.
 */
export function useTournamentRealtime({ tournamentId, onEvent, enabled = true }) {
  const channelRef = useRef(null)

  useEffect(() => {
    if (!enabled || !tournamentId) return

    const channel = supabase.channel(`tournament:${tournamentId}`)

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        onEvent?.(payload.event, payload.payload)
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

  useEffect(() => {
    if (!enabled || !matchId) return

    const channel = supabase.channel(`match:${matchId}`)

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        onEvent?.(payload.event, payload.payload)
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
