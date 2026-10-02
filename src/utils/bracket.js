/**
 * Generate a tournament bracket from a list of participants.
 * Handles non-power-of-2 numbers using BYEs.
 * Returns an array of rounds, each with an array of matches.
 */
export function generateBracket(participants) {
  if (!participants || participants.length < 2) {
    throw new Error('Need at least 2 participants')
  }

  // Find next power of 2
  const n = participants.length
  let slots = 1
  while (slots < n) slots *= 2

  // Seed participants (shuffle for fairness)
  const seeded = [...participants]
  shuffleArray(seeded)

  // Pad with BYEs
  const paddedPlayers = [...seeded]
  while (paddedPlayers.length < slots) {
    paddedPlayers.push(null) // null = BYE
  }

  const rounds = []
  let currentPlayers = paddedPlayers
  let roundNumber = 1

  while (currentPlayers.length > 1) {
    const roundMatches = []
    const nextRoundPlayers = []

    for (let i = 0; i < currentPlayers.length; i += 2) {
      const player1 = currentPlayers[i]
      const player2 = currentPlayers[i + 1]

      const match = {
        matchIndex: roundMatches.length,
        player1,
        player2,
        isBye: player1 === null || player2 === null,
        winner: player1 === null ? player2 : player2 === null ? player1 : null,
      }

      roundMatches.push(match)
      // BYE matches auto-advance the non-null player
      nextRoundPlayers.push(match.winner)
    }

    rounds.push({
      roundNumber,
      name: getRoundName(roundNumber, Math.log2(slots)),
      matches: roundMatches,
    })

    currentPlayers = nextRoundPlayers
    roundNumber++
  }

  return rounds
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export function getRoundName(roundNumber, totalRounds) {
  const roundsFromEnd = totalRounds - roundNumber + 1
  switch (roundsFromEnd) {
    case 1: return 'Final'
    case 2: return 'Semifinals'
    case 3: return 'Quarterfinals'
    case 4: return 'Round of 16'
    default: return `Round ${roundNumber}`
  }
}

export function getRoundNameByTotal(roundNumber, totalRounds) {
  const roundsFromEnd = totalRounds - roundNumber + 1
  switch (roundsFromEnd) {
    case 1: return 'Final'
    case 2: return 'Semifinals'
    case 3: return 'Quarterfinals'
    case 4: return 'Round of 16'
    default: return `Round ${roundNumber}`
  }
}

export function getTotalRounds(playerCount) {
  let slots = 1
  while (slots < playerCount) slots *= 2
  return Math.log2(slots)
}
