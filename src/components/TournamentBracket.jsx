import { motion } from 'framer-motion'
import { getRoundName, MATCH_STATUS_LABEL } from '../utils/bracket'

/**
 * Visual tournament bracket component.
 * Renders rounds and matches from left (earliest) to right (final).
 *
 * Every value shown here comes from the server: seeds, winners, BYEs and
 * statuses are decided by the RPCs, never computed in the client.
 */
export function TournamentBracket({ rounds = [], currentRound = 1, myPlayerId }) {
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
          isActive={round.round_number === currentRound && round.status === 'active'}
          isPending={round.status === 'pending'}
          isDone={round.status === 'finished'}
          myPlayerId={myPlayerId}
        />
      ))}
    </div>
  )
}

function RoundColumn({ round, roundIndex, totalRounds, isActive, isPending, isDone, myPlayerId }) {
  const matches = round.matches || []
  const spacingFactor = Math.pow(2, roundIndex)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: '190px',
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
        color: isActive ? '#00f5ff' : isPending ? '#f59e0b' : isDone ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
      }}>
        {getRoundName(round.round_number, totalRounds)}
        {isActive && (
          <span style={{
            display: 'block',
            width: '6px',
            height: '6px',
            background: '#00f5ff',
            borderRadius: '50%',
            margin: '4px auto 0',
            boxShadow: '0 0 8px rgba(0,245,255,0.8)',
          }}
          />
        )}
        {isPending && (
          <span style={{
            display: 'block',
            fontSize: '9px',
            letterSpacing: '0.1em',
            color: 'rgba(245,158,11,0.7)',
            marginTop: '3px',
          }}
          >
            Waiting for host
          </span>
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
            isPending={isPending}
            myPlayerId={myPlayerId}
            isMine={match.player1_id === myPlayerId || match.player2_id === myPlayerId}
          />
        ))}
      </div>
    </div>
  )
}

function MatchCard({ match, isActive, isPending, isMine }) {
  const p1 = match.player1
  const p2 = match.player2
  const winnerId = match.winner_id
  const isBye = match.status === 'bye'
  const isDecided = ['completed', 'bye', 'forfeit'].includes(match.status)

  const nameOf = (tp) => tp?.profiles?.display_name || 'TBD'
  const seedOf = (tp) => (tp?.seed ? `#${tp.seed}` : null)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        background: isMine
          ? 'rgba(0,245,255,0.08)'
          : isActive
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isMine ? 'rgba(0,245,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '8px',
        overflow: 'hidden',
        opacity: isPending ? 0.75 : 1,
      }}
    >
      {/* A BYE is a single line: the player advances without racing. */}
      {isBye ? (
        <div style={{ padding: '10px 12px' }}>
          <PlayerSlot
            name={nameOf(p1)}
            seed={seedOf(p1)}
            isWinner
            winnerId={winnerId}
            playerId={p1?.id}
          />
          <div style={{
            marginTop: '6px',
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(0,245,255,0.7)',
          }}>
            BYE — ADVANCES
          </div>
        </div>
      ) : (
        <>
          <PlayerSlot
            name={p2 === null ? null : nameOf(p1)}
            seed={seedOf(p1)}
            isWinner={isDecided && winnerId === match.player1_id}
            winnerId={winnerId}
            playerId={match.player1_id}
            isForfeit={match.status === 'forfeit' && winnerId === match.player2_id}
          />
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <PlayerSlot
            name={p2 === null ? null : nameOf(p2)}
            seed={seedOf(p2)}
            isWinner={isDecided && winnerId === match.player2_id}
            winnerId={winnerId}
            playerId={match.player2_id}
            isForfeit={match.status === 'forfeit' && winnerId === match.player1_id}
          />
          {match.status && match.status !== 'bye' && (
            <div style={{
              padding: '4px 12px 6px',
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: statusColor(match.status),
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
            >
              {MATCH_STATUS_LABEL[match.status] || match.status}
              {match.winner_time_ms ? ` · ${formatMs(match.winner_time_ms)}` : ''}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

function PlayerSlot({ name, seed, isWinner, isForfeit }) {
  if (name === null) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
      }}
      >
        <span style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '13px',
          color: 'rgba(255,255,255,0.2)',
          fontStyle: 'italic',
        }}
        >
          BYE
        </span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: isWinner ? 'rgba(16,185,129,0.1)' : 'transparent',
    }}
    >
      {isWinner && <span style={{ fontSize: '11px' }}>🏆</span>}
      {seed && (
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '10px',
          color: 'rgba(0,245,255,0.5)',
          minWidth: '18px',
        }}
        >
          {seed}
        </span>
      )}
      <span style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '13px',
        fontWeight: isWinner ? 700 : 500,
        color: isWinner ? '#10b981' : isForfeit ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
        letterSpacing: '0.03em',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textDecoration: isForfeit ? 'line-through' : 'none',
      }}
      >
        {name}
      </span>
    </div>
  )
}

function statusColor(status) {
  switch (status) {
    case 'completed': return 'rgba(16,185,129,0.6)'
    case 'racing': return '#00f5ff'
    case 'ready': return '#10b981'
    case 'waiting_players': return 'rgba(255,255,255,0.35)'
    case 'upcoming': return 'rgba(245,158,11,0.6)'
    case 'forfeit': return 'rgba(239,68,68,0.7)'
    default: return 'rgba(255,255,255,0.3)'
  }
}

function formatMs(ms) {
  if (!ms && ms !== 0) return null
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

export default TournamentBracket