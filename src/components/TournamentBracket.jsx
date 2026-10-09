import { stagger, listItem, hoverLift } from './ui/PresentationMotion'
import { motion, useReducedMotion } from 'framer-motion'
import { useI18n, useLabels } from '../i18n'

/**
 * Visual tournament bracket component.
 * Renders rounds and matches from left (earliest) to right (final).
 *
 * Every value shown here comes from the server: seeds, winners, BYEs and
 * statuses are decided by the RPCs, never computed in the client. Round names
 * and status captions come from the i18n layer via useLabels().
 *
 * On narrow screens the columns stay at their natural width and the parent
 * scrolls horizontally (.bracket-scroll) — squeezing 8 columns into a phone
 * would make the text unreadable.
 */
export function TournamentBracket({ rounds = [], currentRound = 1, myPlayerId }) {
  const { t } = useI18n()

  if (!rounds || rounds.length === 0) {
    return (
      <p
        className="py-10 text-center text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        {t('bracket.empty')}
      </p>
    )
  }

  const totalRounds = rounds.length

  return (
    <div className="flex items-start" style={{ minHeight: '200px' }}>
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
  const motionSafe = !useReducedMotion()
  const { t } = useI18n()
  const labels = useLabels()
  const matches = round.matches || []
  const spacingFactor = Math.pow(2, roundIndex)

  const accent = isActive
    ? 'var(--accent)'
    : isPending
      ? 'var(--warning)'
      : isDone
        ? 'var(--text-secondary)'
        : 'var(--text-muted)'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: '184px',
        position: 'relative',
      }}
    >
      {/* Round label */}
      <div className="px-2 pb-4 text-center">
        <span
          className="font-racing block text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: accent }}
        >
          {labels.roundName(round.round_number, totalRounds)}
        </span>

        {isActive && (
          <span
            className="mx-auto mt-1.5 block"
            style={{
              width: 6,
              height: 6,
              background: 'var(--accent)',
              borderRadius: '50%',
              boxShadow: 'none',
            }}
            aria-hidden="true"
          />
        )}

        {isPending && (
          <span
            className="mt-1 block text-[9px] uppercase tracking-[0.12em]"
            style={{ color: 'rgba(177,183,192,0.75)' }}
          >
            {t('bracket.waitingForHost')}
          </span>
        )}
      </div>

      {/* Matches */}
      <motion.div {...stagger(motionSafe, true)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacingFactor * 8}px`,
          padding: `${spacingFactor * 16}px 6px`,
        }}
      >
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
      </motion.div>
    </div>
  )
}

function MatchCard({ match, isActive, isPending, isMine }) {
  const { t } = useI18n()
  const labels = useLabels()
  const motionSafe = !useReducedMotion()

  const p1 = match.player1
  const p2 = match.player2
  const winnerId = match.winner_id
  const isBye = match.status === 'bye'
  const isDecided = ['completed', 'bye', 'forfeit'].includes(match.status)

  const nameOf = (tp) => tp?.profiles?.display_name || t('bracket.tbd')
  const seedOf = (tp) => (tp?.seed ? `#${tp.seed}` : null)

  return (
    <motion.div data-ui-motion variants={listItem(motionSafe)} whileHover={hoverLift(motionSafe)}
      style={{
        background: isMine
          ? 'rgba(177,183,192,0.07)'
          : isActive
            ? 'var(--bg-inset)'
            : 'rgba(255,255,255,0.018)',
        border: `1px solid ${isMine ? 'rgba(177,183,192,0.32)' : 'var(--border-glass)'}`,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        opacity: isPending ? 0.72 : 1,
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
            tbdLabel={t('bracket.tbd')}
          />
          <div
            className="font-racing mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'rgba(177,183,192,0.7)' }}
          >
            {t('bracket.byeAdvances')}
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
          <div style={{ height: '1px', background: 'var(--border-glass)' }} />
          <PlayerSlot
            name={p2 === null ? null : nameOf(p2)}
            seed={seedOf(p2)}
            isWinner={isDecided && winnerId === match.player2_id}
            winnerId={winnerId}
            playerId={match.player2_id}
            isForfeit={match.status === 'forfeit' && winnerId === match.player1_id}
          />
          {match.status && (
            <div
              className="font-racing px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em]"
              style={{
                color: statusColor(match.status),
                borderTop: '1px solid var(--border-glass)',
              }}
            >
              {labels.matchStatus(match.status)}
              {match.winner_time_ms ? ` · ${formatMs(match.winner_time_ms)}` : ''}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

function PlayerSlot({ name, seed, isWinner, isForfeit, tbdLabel }) {
  if (name === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="font-racing text-[13px] italic" style={{ color: 'var(--text-muted)' }}>
          {tbdLabel}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ background: isWinner ? 'rgba(177,183,192,0.09)' : 'transparent' }}
    >
      {isWinner && <span className="text-[11px]" aria-hidden="true">🏆</span>}
      {seed && (
        <span className="font-mono text-[10px]" style={{ color: 'rgba(177,183,192,0.5)', minWidth: 18 }}>
          {seed}
        </span>
      )}
      <span
        className="font-racing flex-1 overflow-hidden text-ellipsis whitespace-nowrap tracking-[0.03em]"
        style={{
          fontSize: 13,
          fontWeight: isWinner ? 700 : 500,
          color: isWinner ? 'var(--success)' : isForfeit ? 'var(--text-muted)' : 'var(--text-primary)',
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
    case 'completed': return 'rgba(177,183,192,0.7)'
    case 'racing': return 'var(--accent)'
    case 'ready': return 'var(--success)'
    case 'waiting_players': return 'var(--text-muted)'
    case 'upcoming': return 'rgba(177,183,192,0.75)'
    case 'forfeit': return 'rgba(177,183,192,0.8)'
    default: return 'var(--text-muted)'
  }
}

/** Winner time, in the compact m:ss.SS form the bracket has always used. */
function formatMs(ms) {
  if (!ms && ms !== 0) return null
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

export default TournamentBracket
