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
 *
 * The callbacks are held in a ref instead of the dependency list. Two reasons:
 *   - without it every inline arrow callback (`onUpdate: () => refresh()`)
 *     would tear down and re-join the channel on every render, which is how
 *     duplicate listeners and missed events appear;
 *   - the ref always holds the newest closure, so the handler cannot act on a
 *     stale tournamentId / user.
 *
 * The subscription itself therefore only depends on (table, filter, enabled).
 */
export function usePostgresChanges({ table, schema = 'public', filter, onInsert, onUpdate, onDelete, enabled = true }) {
  const handlersRef = useRef({ onInsert, onUpdate, onDelete })
  useEffect(() => {
    handlersRef.current = { onInsert, onUpdate, onDelete }
  })

  // `filter` is part of the channel identity, so a changed filter must resubscribe.
  // Defaults to undefined (PostgREST: no filter) rather than a fake string.
  const safeFilter = filter || undefined

  useEffect(() => {
    if (!enabled) return

    const channel = supabase.channel(`pg-${schema}-${table}-${safeFilter || 'all'}`)

    // Argument shapes are part of the public contract of this hook and must not
    // change: callers receive the ROW, not the raw realtime payload.
    //   onInsert -> payload.new
    //   onUpdate -> (newRow, oldRow)
    //   onDelete -> payload.old
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema, table, filter: safeFilter },
        (payload) => handlersRef.current.onInsert?.(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema, table, filter: safeFilter },
        (payload) => handlersRef.current.onUpdate?.(payload.new, payload.old)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema, table, filter: safeFilter },
        (payload) => handlersRef.current.onDelete?.(payload.old)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [schema, table, safeFilter, enabled])
}
