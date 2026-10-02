/**
 * Bracket mathematics.
 *
 * This mirrors the SQL helpers in
 * supabase/migrations/005_tournament_v2.sql
 * (next_power_of_two, bracket_seed_order, bracket_bye_seeds).
 *
 * The server is authoritative: it builds the real bracket inside
 * start_tournament(). This module is used for display and for tests.
 *
 * Presentation strings (placement labels, round names, status captions) live in
 * src/i18n — this file is maths and phase predicates only.
 */

// ─── Slot maths ──────────────────────────────────────────────────────────────

export function nextPowerOfTwo(n) {
  const target = Math.max(2, n || 0)
  let slots = 1
  while (slots < target) slots *= 2
  return slots
}

export function getTotalRounds(playerCount) {
  let slots = 1
  while (slots < Math.max(2, playerCount || 0)) slots *= 2
  return Math.round(Math.log2(slots))
}

/**
 * Standard bracket seed order.
 * 4 -> [1,4,2,3] · 8 -> [1,8,4,5,2,7,3,6]
 */
export function bracketSeedOrder(slots) {
  let order = [1]
  while (order.length < slots) {
    const size = order.length
    const next = []
    order.forEach((s, i) => {
      next[i * 2] = s
      next[i * 2 + 1] = size * 2 + 1 - s
    })
    order = next
  }
  return order
}

/**
 * Seeds that receive a BYE, spread evenly across the bracket so that two
 * byes can never meet in the same early match.
 */
export function bracketByeSeeds(slots, byes) {
  if (!byes || byes <= 0) return []
  const order = bracketSeedOrder(slots)
  const result = []
  for (let i = 0; i < byes; i++) {
    const pos = Math.floor((i * slots) / byes)
    result.push(order[pos])
  }
  return result
}

// ─── Bracket construction ────────────────────────────────────────────────────

/**
 * Rank participants into bracket slots.
 *
 * `players` must already be sorted best-first (by practice score).
 * A slot is empty — a BYE — when its seed number is above the player count,
 * which is exactly what leaves the top seeds advancing without a race.
 */
export function buildSlots(players) {
  const list = players || []
  const count = list.length
  const slots = nextPowerOfTwo(count)
  const order = bracketSeedOrder(slots)

  const grid = order.map((seed) => (seed > count ? null : list[seed - 1] ?? null))

  return {
    slots,
    byes: slots - count,
    totalRounds: getTotalRounds(count),
    order,
    grid,
  }
}

/**
 * Round 1 matches for the current slot grid.
 * A BYE advances the player without a race and never counts as a win.
 */
export function buildFirstRoundMatches(players) {
  const { slots, byes, totalRounds, order, grid } = buildSlots(players)
  const matches = []

  for (let i = 0; i < slots; i += 2) {
    const p1 = grid[i] ?? null
    const p2 = i + 1 < slots ? grid[i + 1] ?? null : null

    if (!p1 && !p2) continue

    if (!p1 || !p2) {
      // BYE: advance the real player without a race and without a win credit.
      const byePlayer = p1 ?? p2
      matches.push({
        index: matches.length + 1,
        player1: byePlayer,
        player2: null,
        isBye: true,
        winner: byePlayer,
        round: 1,
      })
    } else {
      matches.push({
        index: matches.length + 1,
        player1: p1,
        player2: p2,
        isBye: false,
        winner: null,
        round: 1,
      })
    }
  }

  return { slots, byes, totalRounds, seedOrder: order, matches }
}

// ─── Placement ───────────────────────────────────────────────────────────────

/**
 * Final standing for a player knocked out in `roundNumber` of a bracket with
 * `totalRounds` rounds:  2^(total - round) + 1
 * 8-slot bracket -> R1 losers place 5, R2 losers place 3, final loser place 2.
 */
export function placementFor(totalRounds, roundNumber) {
  return Math.pow(2, Math.max(totalRounds - roundNumber, 0)) + 1
}

// ─── Tournament phase ─────────────────────────────────────────────────────────

/** True when the tournament still accepts new participants. */
export function isRegistrationOpen(tournament) {
  return tournament?.status === 'lobby' || tournament?.status === 'practice'
}

/** True once the bracket exists and no further joins are possible. */
export function hasStarted(tournament) {
  return ['bracket_ready', 'round_active', 'completed'].includes(tournament?.status)
}
