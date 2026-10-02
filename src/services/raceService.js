import { supabase } from './supabase'

// ─── Submit race result (server validates) ──────────────────────────────────
export async function submitRaceResult({ raceId, matchId, playerId, typedText, elapsedMs }) {
  const { data, error } = await supabase.rpc('finish_race', {
    p_race_id: raceId,
    p_match_id: matchId,
    p_player_id: playerId,
    p_typed_text: typedText,
    p_elapsed_ms: elapsedMs,
  })

  if (error) throw error
  return data
}

// ─── Get race details ───────────────────────────────────────────────────────
export async function getRaceDetails(raceId) {
  const { data, error } = await supabase
    .from('races')
    .select('*, phrases(*), matches(*, rounds(*))')
    .eq('id', raceId)
    .single()

  if (error) throw error
  return data
}

// ─── Record race participation ───────────────────────────────────────────────
export async function recordRaceStart(raceId, playerId) {
  const { error } = await supabase
    .from('race_participants')
    .upsert({
      race_id: raceId,
      player_id: playerId,
      started_at: new Date().toISOString(),
    }, { onConflict: 'race_id,player_id' })

  if (error) throw error
}
