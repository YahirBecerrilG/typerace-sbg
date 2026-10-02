import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { Copy, Play, Users, Crown, Clock, Lock, LogOut, Dumbbell, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useTournamentRealtime } from '../hooks/useTournament'
import { usePostgresChanges } from '../hooks/useRealtime'
import {
  getTournamentWithPlayers,
  startTournament,
  closeRegistration,
  reopenRegistration,
  leaveTournament,
} from '../services/tournamentService'
import { getTotalRounds } from '../utils/bracket'
import { useI18n, useLabels } from '../i18n'
import { AppShell } from '../components/ui/AppShell'
import { Brand } from '../components/ui/Brand'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { LoadingScreen } from '../components/ui/LoadingScreen'
import { Badge } from '../components/ui/Badge'
import TournamentUnavailable from '../components/TournamentUnavailable'

const PLAYER_COLORS = ['#00f5ff', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#f97316', '#06b6d4', '#a855f7']

/**
 * Lobby — the tournament control room.
 *
 * The screen is split into clearly separated zones instead of one stacked
 * column: identity and shareable code at the top, then the host's control strip,
 * then the competitive practice ranking as an e-sports table, then the roster,
 * then the bracket path the tournament will run.
 *
 * All data, all handlers, all realtime wiring and every derived permission
 * (isHost, canStart, registrationOpen, practiceRanking) are unchanged — only
 * the arrangement and presentation are new.
 */
export default function Lobby() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const labels = useLabels()
  const motionSafe = !useReducedMotion()

  const [tournament, setTournament] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const isHost = tournament?.host_id === user?.id

  const fetchData = useCallback(async () => {
    try {
      const data = await getTournamentWithPlayers(tournamentId)
      setTournament(data)
      // `players` already excludes the host: hosts have no participant row.
      setPlayers(data.players || [])
      setLoadError(null)
    } catch (err) {
      // PGRST116 = no row matched. Anything else is a real failure
      // (bad relationship, RLS, network) and must not look like "not found".
      if (err.code === 'PGRST116') {
        setLoadError(null)
      } else {
        console.error('Lobby load error:', err)
        setLoadError(err)
        toast.error(err.message || t('lobby.loadFailed'))
      }
    } finally {
      setLoading(false)
    }
    // `t` is stable for a given locale; re-fetching on language switch is not
    // desired, so it is intentionally not in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Realtime: tournament broadcast events ───────────────────────────────
  const { broadcast } = useTournamentRealtime({
    tournamentId,
    onEvent: (event) => {
      if (event === 'TOURNAMENT_STARTED') {
        toast.success(t('lobby.tournamentStarting'), { icon: '🏁' })
        navigate(`/tournament/${tournamentId}`)
      }
      if (event === 'PLAYER_JOINED') {
        fetchData()
      }
    },
    enabled: !!tournamentId,
  })

  // ─── Realtime: DB changes for tournament_players ─────────────────────────
  usePostgresChanges({
    table: 'tournament_players',
    filter: `tournament_id=eq.${tournamentId}`,
    onInsert: () => fetchData(),
    onUpdate: () => fetchData(),
    enabled: !!tournamentId,
  })

  // ─── Realtime: DB changes for tournament status ──────────────────────────
  usePostgresChanges({
    table: 'tournaments',
    filter: `id=eq.${tournamentId}`,
    onUpdate: (newData) => {
      setTournament((prev) => ({ ...prev, ...newData }))
      // The bracket exists now: leave the lobby for the tournament view.
      if (['bracket_ready', 'round_active', 'completed'].includes(newData.status)) {
        navigate(`/tournament/${tournamentId}`, { replace: true })
      }
    },
    enabled: !!tournamentId,
  })

  const handleStart = async () => {
    setStarting(true)
    try {
      await startTournament(tournamentId)
      await broadcast('TOURNAMENT_STARTED', { tournamentId })
      navigate(`/tournament/${tournamentId}`, { replace: true })
    } catch (err) {
      toast.error(err.message || t('lobby.startFailed'))
    } finally {
      setStarting(false)
    }
  }

  const handleCloseRegistration = async () => {
    setBusy(true)
    try {
      await closeRegistration(tournamentId)
      toast.success(t('lobby.registrationClosedToast'))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleReopen = async () => {
    setBusy(true)
    try {
      await reopenRegistration(tournamentId)
      toast.success(t('lobby.registrationReopenedToast'))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!window.confirm(t('lobby.leaveConfirm'))) return
    setBusy(true)
    try {
      await leaveTournament(tournamentId)
      toast.success(t('lobby.left'))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const copyCode = () => {
    if (!tournament?.code) return
    navigator.clipboard.writeText(tournament.code)
    toast.success(t('common.copied'))
  }

  if (loading) {
    return (
      <AppShell>
        <LoadingScreen label={t('lobby.loading')} />
      </AppShell>
    )
  }

  if (!tournament) {
    return <TournamentUnavailable error={loadError} />
  }

  const registrationOpen = ['lobby', 'practice'].includes(tournament.status)
  // Closing registration locks the roster; it does not remove the host's
  // ability to start. START stays available in registration_closed.
  const startableStates = ['lobby', 'practice', 'registration_closed']
  const canShowStart = startableStates.includes(tournament.status)
  const activePlayers = players.filter((p) => p.status === 'active')
  const canStart = isHost && activePlayers.length >= 2 && canShowStart
  const practiceRanking = [...activePlayers]
    .filter((p) => p.practice_runs > 0)
    .sort((a, b) =>
      (Number(b.practice_score) || 0) - (Number(a.practice_score) || 0) ||
      (Number(b.best_wpm) || 0) - (Number(a.best_wpm) || 0) ||
      String(a.profiles?.display_name || '').localeCompare(String(b.profiles?.display_name || ''))
    )

  // The bracket does not exist yet — the host builds it on start. Showing the
  // round path is derived purely from the roster size, it is not match data.
  const totalRounds = getTotalRounds(tournament.bracket_slots || tournament.max_players || 2)
  const roundPath = Array.from({ length: totalRounds }, (_, i) => labels.roundName(i + 1, totalRounds))

  return (
    <AppShell width="shell">
      <header className="flex items-center justify-between py-5">
        <Brand size="sm" />
        <LanguageSwitcher />
      </header>

      <main className="pb-24">
        {/* ═══ Identity + shareable code ══════════════════════════════════ */}
        <section className="grid gap-8 pb-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
          <motion.div
            initial={motionSafe ? { opacity: 0, y: 18 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="eyebrow">{t('lobby.controlLabel')}</span>

            <h1
              className="display-l mt-5"
              style={{ color: 'var(--text-primary)' }}
            >
              {tournament.name}
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Badge tone={registrationOpen ? 'warn' : 'accent'} dot>
                {labels.tournamentStatus(tournament.status)}
              </Badge>
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                {t('lobby.difficultySuffix', { difficulty: labels.difficulty(tournament.difficulty) })}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                {t('lobby.maxPlayers', { count: tournament.max_players })}
              </span>
            </div>

            {/* Player count gets real visual weight: it is the number everyone
                watches while waiting. */}
            <div className="mt-9 flex items-end gap-8">
              <div>
                <span className="label-xs">{t('lobby.players')}</span>
                <div className="metric-value metric-xl mt-3" style={{ color: 'var(--neon-cyan)' }}>
                  {activePlayers.length}
                  <span
                    className="metric-value"
                    style={{ fontSize: '0.4em', color: 'var(--text-muted)', marginLeft: 6 }}
                  >
                    / {tournament.max_players}
                  </span>
                </div>
              </div>

              {isHost && (
                <div
                  className="mb-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px]"
                  style={{
                    background: 'rgba(245,158,11,0.09)',
                    border: '1px solid rgba(245,158,11,0.28)',
                    color: 'var(--neon-yellow)',
                  }}
                >
                  <Crown size={13} aria-hidden="true" />
                  {t('lobby.hostNotice')}
                </div>
              )}
            </div>
          </motion.div>

          {/* Code panel — the single most-copied object in the app, so it is a
              large, high-contrast, obviously clickable block. */}
          <motion.button
            type="button"
            whileHover={motionSafe ? { y: -3 } : undefined}
            onClick={copyCode}
            aria-label={t('lobby.codeLabel')}
            className="panel panel-accent relative overflow-hidden p-8 text-center"
            style={{ cursor: 'pointer', borderColor: 'rgba(0,245,255,0.28)' }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'radial-gradient(300px 180px at 50% 0%, rgba(0,245,255,0.18), transparent 70%)',
              }}
            />
            <div className="relative">
              <div className="label-xs">{t('lobby.codeLabel')}</div>
              <div
                className="num neon-text-cyan mt-4 text-[42px] font-bold"
                style={{ letterSpacing: '0.1em', lineHeight: 1 }}
              >
                {tournament.code}
              </div>
              <div
                className="mt-5 inline-flex items-center gap-2 text-[12px]"
                style={{ color: 'var(--text-muted)' }}
              >
                <Copy size={12} aria-hidden="true" />
                {t('common.clickToCopy')}
              </div>
            </div>
          </motion.button>
        </section>

        {/* ═══ Host control strip ═════════════════════════════════════════ */}
        {isHost && (
          <section className="panel panel-accent mb-12 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 p-7 lg:p-8">
              <div className="min-w-0">
                <span className="label-xs">{t('lobby.hostControls')}</span>
                <h2 className="display-s mt-3" style={{ color: 'var(--text-primary)' }}>
                  {t('lobby.controlLabel')}
                </h2>
                <p className="mt-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  {t('lobby.controlsHint')}
                </p>
                {!canStart && canShowStart && (
                  <p className="mt-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    {activePlayers.length < 2 ? t('lobby.needTwo') : t('lobby.readyToStart')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {canShowStart && (
                  <motion.button
                    whileHover={motionSafe && canStart ? { scale: 1.02, y: -2 } : undefined}
                    whileTap={motionSafe && canStart ? { scale: 0.98 } : undefined}
                    className="btn-primary btn-lg btn-cta"
                    disabled={!canStart || starting}
                    onClick={handleStart}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
                  >
                    <Play size={18} aria-hidden="true" />
                    {starting ? t('lobby.starting') : t('lobby.startTournament')}
                  </motion.button>
                )}

                {registrationOpen && (
                  <button className="btn-secondary" disabled={busy} onClick={handleCloseRegistration}>
                    <Lock size={14} aria-hidden="true" style={{ marginRight: 7 }} />
                    {t('lobby.closeRegistration')}
                  </button>
                )}

                {!registrationOpen && tournament.status === 'registration_closed' && (
                  <button className="btn-secondary" disabled={busy} onClick={handleReopen}>
                    {t('lobby.reopenRegistration')}
                  </button>
                )}
              </div>
            </div>

            {!registrationOpen && canShowStart && (
              <div
                className="px-7 py-4 text-[13px] lg:px-8"
                style={{
                  borderTop: '1px solid var(--border-glass)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text-secondary)',
                }}
              >
                {activePlayers.length === 1
                  ? t('lobby.registrationLocked', { count: activePlayers.length })
                  : t('lobby.registrationLockedPlural', { count: activePlayers.length })}
              </div>
            )}
          </section>
        )}

        {/* ═══ Practice ranking — competitive table ════════════════════════ */}
        {practiceRanking.length > 0 && (
          <section className="mb-12">
            <div
              className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4"
              style={{ borderColor: 'var(--border-glass)' }}
            >
              <div>
                <span className="eyebrow">{t('lobby.rankingTitle')}</span>
                {isHost && (
                  <p className="caption mt-2">{t('lobby.rankingSeeds')}</p>
                )}
              </div>
              <Dumbbell size={18} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
            </div>

            <div className="panel overflow-hidden">
              <div className="rank-scroll">
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 62 }}>{t('lobby.colRank')}</th>
                      <th scope="col">{t('lobby.colPlayer')}</th>
                      <th scope="col" className="col-num">{t('lobby.colScore')}</th>
                      <th scope="col" className="col-num">{t('lobby.colBest')}</th>
                      <th scope="col" className="col-num">{t('lobby.colRuns')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {practiceRanking.map((p, idx) => (
                      <tr key={p.id} data-me={p.user_id === user?.id}>
                        <td>
                          <span
                            className="medal"
                            style={{
                              background: rankTint(idx),
                              border: `1px solid ${rankBorder(idx)}`,
                              color: rankBorder(idx),
                            }}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td>
                          <span
                            className="font-racing text-[15px] font-bold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {p.profiles?.display_name || t('common.player')}
                          </span>
                          {p.user_id === user?.id && (
                            <span
                              className="ml-3 text-[10px] font-bold uppercase"
                              style={{ color: 'var(--neon-cyan)', letterSpacing: '0.14em' }}
                            >
                              {t('common.youShort')}
                            </span>
                          )}
                        </td>
                        <td className="col-num" style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>
                          {Number(p.practice_score || 0).toFixed(1)}
                        </td>
                        <td className="col-num" style={{ color: 'var(--text-secondary)' }}>
                          {Number(p.best_wpm || 0).toFixed(0)} {t('unit.wpm')}
                        </td>
                        <td className="col-num" style={{ color: 'var(--text-muted)' }}>
                          {p.practice_runs}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ═══ Roster + practice entry ════════════════════════════════════ */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-12">
          <section>
            <div
              className="mb-5 flex items-end justify-between gap-3 border-b pb-4"
              style={{ borderColor: 'var(--border-glass)' }}
            >
              <div>
                <span className="eyebrow">{t('lobby.rosterTitle')}</span>
                <p className="caption mt-2">{t('lobby.rosterHint')}</p>
              </div>
              <span className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                <Users size={15} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                <span className="num" style={{ color: 'var(--neon-cyan)' }}>{activePlayers.length}</span>
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <AnimatePresence mode="popLayout">
                {players.map((player, idx) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    index={idx}
                    isCurrentUser={player.user_id === user?.id}
                    colorIndex={idx}
                    motionSafe={motionSafe}
                  />
                ))}
              </AnimatePresence>

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, tournament.max_players - players.length) }, (_, i) => (
                <motion.div
                  key={`empty-${i}`}
                  initial={motionSafe ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  className="flex items-center px-5 italic"
                  style={{
                    height: '60px',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                  }}
                >
                  {t('lobby.waitingSlot')}
                </motion.div>
              ))}
            </div>
          </section>

          {/* Sidebar: practice entry and the bracket path. */}
          <aside className="flex flex-col gap-5">
            {!isHost && (
              <div className="panel panel-accent relative overflow-hidden p-7">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: 'radial-gradient(300px 200px at 100% 0%, rgba(0,245,255,0.16), transparent 70%)',
                  }}
                />
                <div className="relative">
                  <span
                    className="grid h-11 w-11 place-items-center"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(0,245,255,0.1)',
                      border: '1px solid rgba(0,245,255,0.26)',
                      color: 'var(--neon-cyan)',
                    }}
                    aria-hidden="true"
                  >
                    <Dumbbell size={19} />
                  </span>

                  <h3 className="display-s mt-5" style={{ color: 'var(--text-primary)' }}>
                    {t('lobby.practiceTitle')}
                  </h3>
                  <p className="body-copy mt-3">{t('lobby.practiceDesc')}</p>

                  <button
                    className="btn-secondary btn-block mt-6"
                    style={{ justifyContent: 'center' }}
                    onClick={() => navigate(`/tournament/${tournamentId}/practice`)}
                  >
                    {t('lobby.practise')}
                    <ArrowRight size={14} aria-hidden="true" style={{ marginLeft: 8 }} />
                  </button>
                </div>
              </div>
            )}

            {/* Bracket path: the rounds this roster will run, derived from the
                slot count. Nothing here is match data. */}
            <div className="panel p-7">
              <span className="label-xs">{t('lobby.bracketPathTitle')}</span>
              <p className="caption mt-3">{t('lobby.bracketPathDesc')}</p>

              <div className="mt-6 flex flex-col gap-2">
                {roundPath.map((name, i) => {
                  const isFinal = i === roundPath.length - 1
                  return (
                    <div
                      key={`${name}-${i}`}
                      className="flex items-center gap-3 px-3.5 py-2.5"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        background: isFinal ? 'rgba(245,158,11,0.08)' : 'var(--bg-inset)',
                        border: `1px solid ${isFinal ? 'rgba(245,158,11,0.24)' : 'var(--border-glass)'}`,
                      }}
                    >
                      <span
                        className="num shrink-0 text-[11px]"
                        style={{ color: 'var(--text-muted)', minWidth: 22 }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className="font-racing text-[13px] font-bold uppercase"
                        style={{
                          color: isFinal ? 'var(--neon-yellow)' : 'var(--text-secondary)',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {!isHost && (
              <>
                <div
                  className="flex flex-col items-center px-5 py-7 text-center"
                  style={{
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-lg)',
                  }}
                >
                  <Clock size={18} style={{ color: 'var(--text-muted)', marginBottom: 9 }} aria-hidden="true" />
                  <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('lobby.waitingForHost')}
                  </p>
                </div>

                <button className="btn-ghost btn-block" disabled={busy} onClick={handleLeave}>
                  <LogOut size={14} aria-hidden="true" style={{ marginRight: 7 }} />
                  {t('lobby.leave')}
                </button>
              </>
            )}
          </aside>
        </div>
      </main>
    </AppShell>
  )
}

/** Top-three rank medallions get podium tints; everyone else stays neutral. */
function rankTint(idx) {
  if (idx === 0) return 'rgba(245,158,11,0.14)'
  if (idx === 1) return 'rgba(203,213,225,0.12)'
  if (idx === 2) return 'rgba(180,83,9,0.14)'
  return 'rgba(255,255,255,0.03)'
}

function rankBorder(idx) {
  if (idx === 0) return 'rgba(245,158,11,0.5)'
  if (idx === 1) return 'rgba(203,213,225,0.45)'
  if (idx === 2) return 'rgba(180,83,9,0.5)'
  return 'var(--border-glass)'
}

function PlayerCard({ player, index, isCurrentUser, colorIndex, motionSafe }) {
  const { t } = useI18n()
  const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]
  const name = player.profiles?.display_name || t('common.player')
  const withdrawn = player.status === 'withdrawn'

  const stats =
    player.practice_runs === 1
      ? t('lobby.practiceRunStats', {
          runs: player.practice_runs,
          wpm: Number(player.best_wpm || 0).toFixed(0),
          score: Number(player.practice_score || 0).toFixed(1),
        })
      : t('lobby.practiceRunStatsPlural', {
          runs: player.practice_runs,
          wpm: Number(player.best_wpm || 0).toFixed(0),
          score: Number(player.practice_score || 0).toFixed(1),
        })

  return (
    <motion.div
      initial={motionSafe ? { opacity: 0, x: -16 } : false}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ delay: Math.min(index, 8) * 0.05 }}
      className="flex items-center gap-4 px-5 py-4"
      style={{
        background: isCurrentUser ? `${color}0f` : 'var(--bg-inset)',
        border: `1px solid ${isCurrentUser ? `${color}3d` : 'var(--border-glass)'}`,
        borderRadius: 'var(--radius-md)',
        opacity: withdrawn ? 0.55 : 1,
      }}
    >
      {/* Seed number, in the competition's voice. */}
      <span
        className="num shrink-0 text-center text-[11px]"
        style={{ color: 'var(--text-muted)', minWidth: 22 }}
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Avatar circle */}
      <span
        className="font-racing grid shrink-0 place-items-center rounded-full font-bold"
        style={{
          width: '42px',
          height: '42px',
          background: `${color}20`,
          border: `2px solid ${color}55`,
          fontSize: '17px',
          color,
        }}
        aria-hidden="true"
      >
        {name[0]?.toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="font-racing overflow-hidden text-ellipsis whitespace-nowrap text-[17px] font-bold"
            style={{ color: isCurrentUser ? color : 'var(--text-primary)' }}
          >
            {name}
          </span>
          {isCurrentUser && <Badge tone="info">{t('common.you')}</Badge>}
        </div>

        {player.practice_runs > 0 && (
          <div
            className="font-racing mt-1.5 text-[11.5px] font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            {stats}
          </div>
        )}
      </div>

      <Badge tone={withdrawn ? 'neutral' : 'ok'} dot>
        {withdrawn ? t('lobby.playerWithdrawn') : t('lobby.playerIn')}
      </Badge>
    </motion.div>
  )
}