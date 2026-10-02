import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACTIONABLE_MATCH_STATUSES,
  TERMINAL_MATCH_STATUSES,
  isActionableMatchStatus,
  isTerminalMatchStatus,
  myPlayerInMatch,
  isMatchParticipant,
  raceOfMatch,
  racePathForMatch,
  resolveMatchDestination,
  practiceUnavailableReason,
} from './matchNavigation.js'

const ME = '11111111-1111-1111-1111-111111111111'
const OPPONENT = '22222222-2222-2222-2222-222222222222'
const HOST = '33333333-3333-3333-3333-333333333333'
const TOURNAMENT = '44444444-4444-4444-4444-444444444444'
const MATCH = '55555555-5555-5555-5555-555555555555'
const RACE = '66666666-6666-6666-6666-666666666666'
const MY_ROW = 'aaaaaaa1-0000-0000-0000-000000000000'
const THEIR_ROW = 'aaaaaaa2-0000-0000-0000-000000000000'

function makeMatch(overrides = {}) {
  return {
    id: MATCH,
    status: 'waiting_players',
    player1_id: MY_ROW,
    player2_id: THEIR_ROW,
    player1: { id: MY_ROW, user_id: ME, profiles: { display_name: 'Me' } },
    player2: { id: THEIR_ROW, user_id: OPPONENT, profiles: { display_name: 'Rival' } },
    races: [{ id: RACE, phrase_id: 'p1' }],
    ...overrides,
  }
}

const player = { id: MY_ROW, user_id: ME, status: 'active', role: 'player' }

// ─── Status vocabulary (must mirror the migrations, nothing invented) ─────────

test('actionable statuses are exactly the three prematch states', () => {
  assert.deepEqual(ACTIONABLE_MATCH_STATUSES, ['waiting_players', 'ready', 'racing'])
  assert.equal(isActionableMatchStatus('waiting_players'), true)
  assert.equal(isActionableMatchStatus('ready'), true)
  assert.equal(isActionableMatchStatus('racing'), true)
})

test('an upcoming match is NOT actionable: the host has not opened the round', () => {
  assert.equal(isActionableMatchStatus('upcoming'), false)
})

test('terminal statuses are decided and never re-entered', () => {
  assert.deepEqual(TERMINAL_MATCH_STATUSES, ['completed', 'bye', 'forfeit'])
  for (const s of TERMINAL_MATCH_STATUSES) {
    assert.equal(isActionableMatchStatus(s), false)
    assert.equal(isTerminalMatchStatus(s), true)
  }
})

// ─── Membership resolution ───────────────────────────────────────────────────

test('resolves my participant row from either slot', () => {
  assert.equal(myPlayerInMatch(makeMatch(), ME)?.id, MY_ROW)
  assert.equal(
    myPlayerInMatch(makeMatch({ player1_id: THEIR_ROW, player2_id: MY_ROW }), ME)?.id,
    MY_ROW
  )
})

test('a non-participant resolves to no player row', () => {
  assert.equal(myPlayerInMatch(makeMatch(), HOST), null)
  assert.equal(isMatchParticipant(makeMatch(), HOST), false)
  assert.equal(isMatchParticipant(makeMatch(), ME), true)
})

// ─── Prematch URL ────────────────────────────────────────────────────────────

test('builds the prematch URL from match + race ids', () => {
  assert.equal(racePathForMatch(makeMatch()), `/race/${MATCH}/${RACE}`)
})

test('never builds a URL for a terminal match (a finished race cannot reopen)', () => {
  for (const status of TERMINAL_MATCH_STATUSES) {
    assert.equal(racePathForMatch(makeMatch({ status })), null)
  }
})

test('never builds a URL for an unopened round', () => {
  assert.equal(racePathForMatch(makeMatch({ status: 'upcoming' })), null)
})

test('returns null instead of a half-built URL when the match has no race', () => {
  // A BYE has no race row. Producing /race/<match>/undefined would render a
  // READY screen with no phrase and no way to finish.
  assert.equal(racePathForMatch(makeMatch({ races: [] })), null)
  assert.equal(racePathForMatch(makeMatch({ races: undefined })), null)
  assert.equal(racePathForMatch(makeMatch({ races: [{}] })), null)
  assert.equal(raceOfMatch(makeMatch({ races: [] })), null)
})

// ─── The Practice -> prematch policy ─────────────────────────────────────────

test('a player waiting in practice is sent to the prematch when the round opens', () => {
  const dest = resolveMatchDestination({
    tournament: { id: TOURNAMENT, status: 'round_active', host_id: HOST },
    participant: player,
    match: makeMatch({ status: 'waiting_players' }),
  })
  assert.equal(dest.type, 'race')
  assert.equal(dest.to, `/race/${MATCH}/${RACE}`)
  assert.equal(dest.replace, true, 'must replace so Back cannot re-enter practice')
})

test('the same applies once the player is READY and while racing', () => {
  for (const status of ['ready', 'racing']) {
    const dest = resolveMatchDestination({
      tournament: { id: TOURNAMENT, status: 'round_active', host_id: HOST },
      participant: player,
      match: makeMatch({ status }),
    })
    assert.equal(dest.type, 'race', `status ${status}`)
    assert.equal(dest.to, `/race/${MATCH}/${RACE}`)
  }
})

test('a player is left alone while the round is still parked as upcoming', () => {
  const dest = resolveMatchDestination({
    tournament: { id: TOURNAMENT, status: 'bracket_ready', host_id: HOST },
    participant: player,
    match: makeMatch({ status: 'upcoming' }),
  })
  assert.equal(dest.type, 'stay')
  assert.equal(dest.to, null)
})

test('practice keeps working while nobody has been matched yet', () => {
  for (const status of ['lobby', 'practice', 'registration_closed']) {
    const dest = resolveMatchDestination({
      tournament: { id: TOURNAMENT, status, host_id: HOST },
      participant: player,
      match: null,
    })
    assert.equal(dest.type, 'stay', `tournament ${status}`)
  }
})

test('an actionable match outranks a completed tournament flag', () => {
  // Defensive: the match row is the per-player authority. If a stale tournament
  // row still says round_active while the match is waiting, we must still race.
  const dest = resolveMatchDestination({
    tournament: { id: TOURNAMENT, status: 'round_active', host_id: HOST },
    participant: player,
    match: makeMatch(),
  })
  assert.equal(dest.type, 'race')
})

test('a completed tournament goes to the final standings', () => {
  const dest = resolveMatchDestination({
    tournament: { id: TOURNAMENT, status: 'completed', host_id: HOST },
    participant: player,
    match: null,
  })
  assert.equal(dest.type, 'results')
  assert.equal(dest.to, `/results/${TOURNAMENT}`)
  assert.equal(dest.replace, true)
})

test('a champion goes to the final standings', () => {
  const dest = resolveMatchDestination({
    tournament: { id: TOURNAMENT, status: 'completed', host_id: HOST },
    participant: { ...player, status: 'champion', placement: 1 },
    match: null,
  })
  assert.equal(dest.type, 'results')
})

test('an eliminated or withdrawn player is sent to the overview', () => {
  for (const status of ['eliminated', 'withdrawn']) {
    const dest = resolveMatchDestination({
      tournament: { id: TOURNAMENT, status: 'round_active', host_id: HOST },
      participant: { ...player, status },
      match: null,
    })
    assert.equal(dest.type, 'tournament', `participant ${status}`)
    assert.equal(dest.to, `/tournament/${TOURNAMENT}`)
  }
})

test('never navigates when there is no tournament to navigate within', () => {
  const dest = resolveMatchDestination({
    tournament: null,
    participant: null,
    match: makeMatch({ races: [] }),
  })
  assert.equal(dest.type, 'stay')
})

test('an actionable match with no race never sends the player into a dead screen', () => {
  const dest = resolveMatchDestination({
    tournament: { id: TOURNAMENT, status: 'round_active', host_id: HOST },
    participant: player,
    match: makeMatch({ races: [] }),
  })
  assert.equal(dest.type, 'stay')
})

test('resolveMatchDestination tolerates being called with nothing', () => {
  assert.deepEqual(resolveMatchDestination(), { type: 'stay', to: null, replace: false })
  assert.deepEqual(resolveMatchDestination({}), { type: 'stay', to: null, replace: false })
})

// ─── Practice availability ───────────────────────────────────────────────────

test('the host can never practise in their own tournament', () => {
  const reason = practiceUnavailableReason({
    tournament: { id: TOURNAMENT, status: 'lobby', host_id: ME },
    participant: null,
    userId: ME,
  })
  assert.match(reason, /host/i)
})

test('a non-participant cannot practise', () => {
  const reason = practiceUnavailableReason({
    tournament: { id: TOURNAMENT, status: 'lobby', host_id: HOST },
    participant: null,
    userId: ME,
  })
  assert.match(reason, /not registered/i)
})

test('an active player can practise while the tournament still accepts it', () => {
  for (const status of ['lobby', 'practice', 'registration_closed']) {
    const reason = practiceUnavailableReason({
      tournament: { id: TOURNAMENT, status, host_id: HOST },
      participant: player,
      userId: ME,
    })
    assert.equal(reason, null, `tournament ${status}`)
  }
})

test('an active player cannot practise once the bracket is running', () => {
  for (const status of ['bracket_ready', 'round_active', 'completed']) {
    const reason = practiceUnavailableReason({
      tournament: { id: TOURNAMENT, status, host_id: HOST },
      participant: player,
      userId: ME,
    })
    assert.ok(reason, `tournament ${status} must block practice`)
  }
})

test('each finished participant status explains itself', () => {
  const cases = [
    ['eliminated', /knocked out/i],
    ['withdrawn', /left/i],
    ['champion', /won/i],
  ]
  for (const [status, re] of cases) {
    const reason = practiceUnavailableReason({
      tournament: { id: TOURNAMENT, status: 'round_active', host_id: HOST },
      participant: { ...player, status },
      userId: ME,
    })
    assert.match(reason, re, `participant ${status}`)
  }
})

test('a missing tournament is reported without leaking details', () => {
  const reason = practiceUnavailableReason({ tournament: null })
  assert.match(reason, /does not exist/i)
})