import { supabase } from './supabase'

// ─── Generate tournament code ───────────────────────────────────────────────
export function generateTournamentCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'TR-'
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// ─── Create tournament ──────────────────────────────────────────────────────
export async function createTournament({ name, maxPlayers, difficulty, hostId }) {
  let code
  let attempts = 0

  // Ensure unique code
  while (attempts < 5) {
    code = generateTournamentCode()
    const { data } = await supabase
      .from('tournaments')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!data) break
    attempts++
  }

  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      code,
      name,
      host_id: hostId,
      max_players: maxPlayers,
      difficulty,
      status: 'lobby',
      current_round: 0,
    })
    .select()
    .single()

  if (error) throw error

  // Add host as first player
  await supabase.from('tournament_players').insert({
    tournament_id: data.id,
    user_id: hostId,
    status: 'waiting',
  })

  return data
}

// ─── Join tournament ────────────────────────────────────────────────────────
export async function joinTournament({ code, userId }) {
  // Find tournament
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()

  if (tErr) throw tErr
  if (!tournament) throw new Error('Tournament not found. Check the code and try again.')
  if (tournament.status !== 'lobby') throw new Error('This tournament has already started or ended.')

  // Check already joined
  const { data: existing } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournament.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    // Already a participant — return tournament so user can navigate to lobby
    return tournament
  }

  // Check capacity
  const { count } = await supabase
    .from('tournament_players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)

  if (count >= tournament.max_players) throw new Error('Tournament is full.')

  // Join
  const { error: pErr } = await supabase.from('tournament_players').insert({
    tournament_id: tournament.id,
    user_id: userId,
    status: 'waiting',
  })

  if (pErr) throw pErr
  return tournament
}

// ─── Get tournament with players ────────────────────────────────────────────
export async function getTournamentWithPlayers(tournamentId) {
  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      *,
      tournament_players (
        *,
        profiles (id, display_name, avatar_url)
      )
    `)
    .eq('id', tournamentId)
    .single()

  if (error) throw error
  return data
}

// ─── Start tournament ───────────────────────────────────────────────────────
export async function startTournament(tournamentId, hostId) {
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('*, tournament_players(*)')
    .eq('id', tournamentId)
    .single()

  if (error) throw error
  if (tournament.host_id !== hostId) throw new Error('Only the host can start the tournament.')
  if (tournament.status !== 'lobby') throw new Error('Tournament already started.')

  const players = tournament.tournament_players
  if (players.length < 2) throw new Error('Need at least 2 players to start.')

  // Use RPC to atomically start tournament and generate bracket
  const { data, error: rpcErr } = await supabase.rpc('start_tournament', {
    p_tournament_id: tournamentId,
    p_host_id: hostId,
  })

  if (rpcErr) throw rpcErr
  return data
}

// ─── Get tournament bracket ─────────────────────────────────────────────────
export async function getTournamentBracket(tournamentId) {
  const { data, error } = await supabase
    .from('rounds')
    .select(`
      *,
      matches (
        *,
        player1:tournament_players!matches_player1_id_fkey (
          *,
          profiles (id, display_name)
        ),
        player2:tournament_players!matches_player2_id_fkey (
          *,
          profiles (id, display_name)
        ),
        winner:tournament_players!matches_winner_id_fkey (
          *,
          profiles (id, display_name)
        ),
        races (*)
      )
    `)
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true })

  if (error) throw error
  return data
}

// ─── Get current match for player ───────────────────────────────────────────
export async function getActiveMatchForPlayer(tournamentId, userId) {
  // Find player's tournament_player record
  const { data: tp } = await supabase
    .from('tournament_players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .single()

  if (!tp) return null

  // Find active match
  const { data: match, error } = await supabase
    .from('matches')
    .select(`
      *,
      player1:tournament_players!matches_player1_id_fkey (*, profiles(*)),
      player2:tournament_players!matches_player2_id_fkey (*, profiles(*)),
      races (*, phrases(*)),
      rounds (*)
    `)
    .or(`player1_id.eq.${tp.id},player2_id.eq.${tp.id}`)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw error
  return match
}
