import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../services/supabase'

/**
 * Generic realtime channel hook.
 * Subscribes to a Supabase Realtime channel and calls onMessage when events arrive.
 */
export function useRealtimeChannel({ channelName, onMessage, enabled = true }) {
  const channelRef = useRef(null)

  useEffect(() => {
    if (!enabled || !channelName) return

    const channel = supabase.channel(channelName, {
      config: { presence: { key: channelName } },
    })

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        onMessage?.(payload)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName, enabled])

  const send = useCallback(async (event, payload) => {
    if (!channelRef.current) return
    await channelRef.current.send({
      type: 'broadcast',
      event,
      payload,
    })
  }, [])

  return { send }
}

/**
 * Subscribe to Supabase Postgres changes on a table.
 */
export function usePostgresChanges({ table, schema = 'public', filter, onInsert, onUpdate, onDelete, enabled = true }) {
  useEffect(() => {
    if (!enabled) return

    let sub = supabase
      .channel(`${table}-changes-${filter || 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema, table, filter },
        (payload) => onInsert?.(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema, table, filter },
        (payload) => onUpdate?.(payload.new, payload.old)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema, table, filter },
        (payload) => onDelete?.(payload.old)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [table, filter, enabled])
}
