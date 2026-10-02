import { useState, useEffect, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, ArrowRight, Trophy, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { usePostgresChanges } from '../hooks/useRealtime'
import {
  getTournamentWithPlayers,
  getTournamentBracket,
  getActiveMatchForPlayer,
  startNextRound,
} from '../services/tournamentService'
import { getTotalRounds } from '../utils/bracket'
import { racePathForMatch } from '../utils/matchNavigation'
import { TournamentBracket } from '../components/TournamentBracket'
import TournamentUnavailable from '../components/TournamentUnavailable'
import { useI18n, useLabels } from '../i18n'
import { AppShell } from '../components/ui/AppShell'
import { Brand } from '../components/ui/Brand'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { LoadingScreen } from '../components/ui/LoadingScreen'
import { Badge } from '../components/ui/Badge'

/**
 * Tournament overview: bracket, standings and the controls for whoever is
 * playing. Admin powers live on tournaments.host_id — a PLAYER never gets a
 * mutating control here, and the server rejects it regardless.
 */
export default function Tournament() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const labels = useLabels()
  const motionSafe = !useReducedMotion()

  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState([])
  const [players, setPlayers] = useState([])
  const [myMatch, setMyMatch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [startingRound, setStartingRound] = useState(false)

  const isHost = tournament?.host_id === user?.id
  const myPlayerId = players.find((p) => p.user_id === user?.id)?.id
  const totalRounds = getTotalRounds(tournament?.bracket_slots || tournament?.max_players || 2)

  const refreshBracket = useCallback(async () => {
    try {
      const data = await getTournamentBracket(tournamentId)
      setBracket(data || [])
    } catch (err) {
      console.error('Bracket fetch error:', err)
    }
  }, [tournamentId])

  const refreshTournament = useCallback(async () => {
    try {
      const data = await getTournamentWithPlayers(tournamentId)
      setTournament(data)
      setPlayers(data.players || [])
      setLoadError(null)
    } catch (err) {
      // RLS (007) makes another user's tournament read exactly like a missing
      // one, so this is the "not yours / not there" path, not a broken page.
      console.error('Tournament fetch error:', err)
      setLoadError(err)
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  const refreshMyMatch = useCallback(async () => {
    try {
      const match = await getActiveMatchForPlayer(tournamentId, user.id)
      setMyMatch(match)
    } catch (err) {
      console.error('Match lookup error:', err)
    }
  }, [tournamentId, user])

  const refreshAll = useCallback(() => {
    refreshTournament()
    refreshBracket()
    refreshMyMatch()
  }, [refreshTournament, refreshBracket, refreshMyMatch])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // ─── Realtime: any match change re-reads the bracket ─────────────────────
  usePostgresChanges({
    table: 'matches',
    onUpdate: () => { refreshBracket(); refreshMyMatch() },
    onInsert: () => { refreshBracket(); refreshMyMatch() },
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'rounds',
    filter: `tournament_id=eq.${tournamentId}`,
    onUpdate: refreshAll,
    onInsert: refreshAll,
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'tournament_players',
    filter: `tournament_id=eq.${tournamentId}`,
    onUpdate: refreshTournament,
    enabled: !!tournamentId,
  })

  usePostgresChanges({
    table: 'tournaments',
    filter: `id=eq.${tournamentId}`,
    onUpdate: (newData) => {
      setTournament((prev) => ({ ...prev, ...newData }))
      if (newData.status === 'completed') {
        navigate(`/results/${tournamentId}`, { replace: true })
      }
    },
    enabled: !!tournamentId,
  })

  // ─── Admin: open the next round ──────────────────────────────────────────
  const handleStartRound = async () => {
    setStartingRound(true)
    try {
      await startNextRound(tournamentId)
      toast.success(t('tournament.startingRound'))
      refreshAll()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setStartingRound(false)
    }
  }

  // ─── Enter my match ──────────────────────────────────────────────────────
  // Shared with Practice so both screens agree on what "enter my match" means
  // and, more importantly, agree on when there is nothing to enter. The old
  // version rendered the button whenever a match existed but silently did
  // nothing when the match had no race row attached.
  const myRacePath = racePathForMatch(myMatch)
  const enterMatch = useCallback(() => {
    if (!myRacePath) return
    navigate(myRacePath)
  }, [myRacePath, navigate])

  if (loading) {
    return (
      <AppShell>
        <LoadingScreen label={t('common.loading')} />
      </AppShell>
    )
  }

  // Never render a half-populated bracket for a tournament this user cannot
  // read: it would leak the roster and the match tree through empty columns.
  if (!tournament) {
    return <TournamentUnavailable error={loadError} />
  }

  const status = tournament?.status
  const pendingRound = bracket.find((r) => r.status === 'pending')
  const activeRound = bracket.find((r) => r.status === 'active')
  const champion = players.find((p) => p.status === 'champion')
  const myStatus = players.find((p) => p.user_id === user?.id)

  const matchCtaLabel = !myRacePath
    ? t('tournament.matchPreparing')
    : myMatch.status === 'racing'
      ? t('tournament.returnToRace')
      : myMatch.status === 'ready'
        ? t('tournament.matchReady')
        : t('tournament.enterMatch')

  return (
    <AppShell width="shell">
      <header className="flex items-center justify-between py-5">
        <Brand size="sm" />
        <LanguageSwitcher />
      </header>

      <main className="pb-16">
        {/* Header */}
        <motion.div
          initial={motionSafe ? { opacity: 0, y: -16 } : false}
          animate={{ opacity: 1, y: 0 }}
          className="mb-7"
        >
          <Badge tone={status === 'completed' ? 'warn' : 'ok'} dot className="mb-3">
            {labels.tournamentStatus(status)}
          </Badge>
          <h1
            className="font-racing font-extrabold tracking-tight"
            style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: 'var(--text-primary)' }}
          >
            {tournament?.name}
          </h1>
          <p
            className="mt-2 flex flex-wrap items-center gap-2 text-[13px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            {totalRounds > 0 && (
              <>
                <span style={{ color: 'var(--cyan)' }}>
                  {labels.roundName(activeRound?.round_number || tournament?.current_round || 1, totalRounds)}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
              </>
            )}
            <span>{t('lobby.difficultySuffix', { difficulty: labels.difficulty(tournament?.difficulty) })}</span>
            {tournament?.bracket_slots > 0 && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span>{t('tournament.slotsSuffix', { count: tournament.bracket_slots })}</span>
              </>
            )}
            {tournament?.bracket_byes > 0 && (
              <>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ color: 'var(--violet)' }}>
                  {tournament.bracket_byes === 1
                    ? t('tournament.byeSuffix', { count: tournament.bracket_byes })
                    : t('tournament.byeSuffixPlural', { count: tournament.bracket_byes })}
                </span>
              </>
            )}
          </p>
        </motion.div>

        {/* Your status / CTA */}
        {myStatus?.status === 'eliminated' && (
          <StatusBanner
            color="var(--neon-red)"
            title={labels.placement(myStatus.placement) || t('labels.playerStatus.eliminated')}
            body={t('tournament.eliminatedBody')}
          />
        )}

        {isHost && (
          <div
            className="mb-5 flex flex-wrap items-center gap-3.5"
            style={{
              padding: '14px 18px',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Crown size={16} style={{ color: '#f59e0b', flexShrink: 0 }} aria-hidden="true" />
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              {t('tournament.hostNotice')}
            </span>
          </div>
        )}

        {myStatus?.status === 'withdrawn' && (
          <StatusBanner
            color="var(--text-muted)"
            title={t('labels.playerStatus.withdrawn')}
            body={t('tournament.withdrawnBody')}
          />
        )}

        {champion && (
          <StatusBanner
            color="var(--neon-yellow)"
            title={t('tournament.isChampion', { name: champion.profiles?.display_name || t('common.player') })}
            body={t('tournament.championBody')}
            action={{ label: t('tournament.fullResults'), onClick: () => navigate(`/results/${tournamentId}`) }}
          />
        )}

        {myMatch && (
          <motion.button
            whileHover={motionSafe && myRacePath ? { scale: 1.01 } : undefined}
            whileTap={motionSafe && myRacePath ? { scale: 0.99 } : undefined}
            className="btn-primary btn-lg btn-block mb-6"
            onClick={enterMatch}
            disabled={!myRacePath}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Play size={17} aria-hidden="true" />
            {matchCtaLabel}
            <ArrowRight size={15} aria-hidden="true" />
          </motion.button>
        )}

        {/* Admin: next round */}
        {isHost && pendingRound && status !== 'completed' && (
          <div
            className="mb-6 flex flex-wrap items-center gap-4"
            style={{
              padding: '18px 20px',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="min-w-[200px] flex-1">
              <div className="font-racing text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('tournament.roundReady', {
                  round: labels.roundName(pendingRound.round_number, totalRounds),
                })}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {t('tournament.roundReadyBody')}
              </div>
            </div>
            <button
              className="btn-primary btn-sm"
              disabled={startingRound}
              onClick={handleStartRound}
            >
              <Play size={14} aria-hidden="true" style={{ marginRight: 6 }} />
              {startingRound ? t('tournament.startingRound') : t('tournament.startRound')}
            </button>
          </div>
        )}

        {/* Bracket */}
        <motion.section
          initial={motionSafe ? { opacity: 0, y: 16 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <SectionTitle>{t('tournament.bracket')}</SectionTitle>
          <div className="surface bracket-scroll" style={{ padding: '18px' }}>
            <TournamentBracket
              rounds={bracket}
              currentRound={activeRound?.round_number || tournament?.current_round || 1}
              myPlayerId={myPlayerId}
            />
          </div>
        </motion.section>

        {/* Standings */}
        <motion.section
          initial={motionSafe ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <SectionTitle>{t('tournament.standings')}</SectionTitle>
          <div className="surface p-2">
            {[...players]
              .sort((a, b) => (a.placement ?? 999) - (b.placement ?? 999) || (a.seed ?? 999) - (b.seed ?? 999))
              .map((p, i) => (
                <StandingsRow
                  key={p.id}
                  player={p}
                  index={i}
                  isMe={p.user_id === user?.id}
                  labels={labels}
                />
              ))}
          </div>
        </motion.section>
      </main>
    </AppShell>
  )
}

function SectionTitle({ children }) {
  return (
    <h2
      className="mb-4 font-racing text-xs font-bold uppercase tracking-[0.18em]"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </h2>
  )
}

function StatusBanner({ color, title, body, action }) {
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-4"
      style={{
        padding: '15px 18px',
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 26%, transparent)`,
        borderRadius: 'var(--radius-md)',
      }}
    >
      <Trophy size={18} style={{ color, flexShrink: 0 }} aria-hidden="true" />
      <div className="min-w-[180px] flex-1">
        <div className="font-racing text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{body}</div>
      </div>
      {action && (
        <button className="btn-secondary btn-sm" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

const STATUS_TONE = {
  champion: 'warn',
  active: 'ok',
  eliminated: 'neutral',
  withdrawn: 'neutral',
}

function StandingsRow({ player, index, isMe, labels }) {
  const { t } = useI18n()

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5"
      style={{
        borderRadius: 'var(--radius-sm)',
        background: isMe ? 'rgba(0,245,255,0.05)' : 'transparent',
      }}
    >
      <span className="font-mono text-[12px]" style={{ color: 'var(--text-muted)', minWidth: 22 }}>
        {player.seed ? `#${player.seed}` : `${index + 1}`}
      </span>

      <span
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        {player.profiles?.display_name || t('common.player')}
        {isMe && (
          <span
            className="ml-2 text-[10px] font-bold tracking-[0.14em]"
            style={{ color: 'var(--neon-cyan)' }}
          >
            {t('common.youShort')}
          </span>
        )}
      </span>

      {Number(player.practice_score) > 0 && (
        <span className="font-racing text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {t('tournament.seedStat', { score: Number(player.practice_score).toFixed(0) })}
        </span>
      )}

      {player.wins > 0 && (
        <span className="font-racing text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {t('tournament.winsStat', { wins: player.wins })}
        </span>
      )}

      <Badge tone={STATUS_TONE[player.status] || 'neutral'} style={{ marginLeft: 'auto' }}>
        {labels.placement(player.placement) || labels.playerStatus(player.status)}
      </Badge>
    </div>
  )
}