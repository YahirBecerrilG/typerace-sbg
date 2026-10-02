import { motion } from 'framer-motion'
import { getRoundNameByTotal } from '../utils/bracket'

/**
 * Visual tournament bracket component.
 * Renders rounds and matches from left (earliest) to right (final).
 */
export function TournamentBracket({ rounds = [], currentRound = 1 }) {
  if (!rounds || rounds.length === 0) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px' }}>
        Bracket not yet generated
      </div>
    )
  }

  const totalRounds = rounds.length

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0',
      overflowX: 'auto',
      padding: '20px 0',
      minHeight: '200px',
    }}>
      {rounds.map((round, rIdx) => (
        <RoundColumn
          key={round.id || rIdx}
          round={round}
          roundIndex={rIdx}
          totalRounds={totalRounds}
          isActive={round.round_number === currentRound}
          isDone={round.status === 'finished'}
        />
      ))}
    </div>
  )
}

function RoundColumn({ round, roundIndex, totalRounds, isActive, isDone }) {
  const matches = round.matches || []
  const spacingFactor = Math.pow(2, roundIndex)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: '180px',
      position: 'relative',
    }}>
      {/* Round label */}
      <div style={{
        textAlign: 'center',
        padding: '0 8px 16px',
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: isActive ? '#00f5ff' : isDone ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
      }}>
        {round.name || getRoundNameByTotal(round.round_number, totalRounds)}
        {isActive && (
          <span style={{
            display: 'block',
            width: '6px',
            height: '6px',
            background: '#00f5ff',
            borderRadius: '50%',
            margin: '4px auto 0',
            boxShadow: '0 0 8px rgba(0,245,255,0.8)',
          }} />
        )}
      </div>

      {/* Matches */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${spacingFactor * 8}px`,
        padding: `${spacingFactor * 16}px 8px`,
      }}>
        {matches.map((match, mIdx) => (
          <MatchCard
            key={match.id || mIdx}
            match={match}
            isActive={isActive}
            colorIndex={mIdx * 2}
          />
        ))}
      </div>
    </div>
  )
}

function MatchCard({ match, isActive, colorIndex }) {
  const p1 = match.player1?.profiles || match.player1
  const p2 = match.player2?.profiles || match.player2
  const winner = match.winner_id

  const p1Name = p1?.display_name || (match.player1 === null ? 'BYE' : 'TBD')
  const p2Name = p2?.display_name || (match.player2 === null ? 'BYE' : 'TBD')
  const p1Id = match.player1_id
  const p2Id = match.player2_id

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        background: isActive
          ? 'rgba(0,245,255,0.05)'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isActive ? 'rgba(0,245,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        minWidth: '160px',
      }}
    >
      {/* Player 1 */}
      <PlayerSlot
        name={p1Name}
        isWinner={winner === p1Id}
        isBye={match.player1 === null}
      />
      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
      {/* Player 2 */}
      <PlayerSlot
        name={p2Name}
        isWinner={winner === p2Id}
        isBye={match.player2 === null}
      />
    </motion.div>
  )
}

function PlayerSlot({ name, isWinner, isBye }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: isWinner ? 'rgba(16,185,129,0.1)' : 'transparent',
      opacity: isBye ? 0.3 : 1,
    }}>
      {isWinner && (
        <span style={{ fontSize: '12px' }}>🏆</span>
      )}
      <span style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        fontWeight: isWinner ? 700 : 500,
        color: isWinner ? '#10b981' : isBye ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
        letterSpacing: '0.03em',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
    </div>
  )
}

export default TournamentBracket
