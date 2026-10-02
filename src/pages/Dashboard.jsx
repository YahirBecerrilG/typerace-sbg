import { useState, useEffect, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Trophy, Plus, LogIn, ChevronRight, ArrowUpRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../services/supabase'
import { useI18n, useLabels } from '../i18n'
import { AppShell } from '../components/ui/AppShell'
import { TopNav } from '../components/ui/TopNav'
import { Footer } from '../components/ui/Footer'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'

/**
 * Dashboard.
 *
 * Composition, top to bottom: navigation, a welcome hero, the two primary
 * actions, the tournaments you are in, then a quieter secondary block.
 *
 * The two actions are deliberately NOT two equal boxes. "Create" is the heavier
 * primary move and gets the wide slot, the gradient edge and the glow;
 * "Join" is a real but secondary move. That asymmetry is what stops the screen
 * reading as a generic dashboard.
 *
 * Every number on this page is derived from the entries that were actually
 * fetched — nothing is invented.
 */
export default function Dashboard() {
  const { user, profile, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const labels = useLabels()
  const motionSafe = !useReducedMotion()
  const [entries, setEntries] = useState([])
  const [loadingTournaments, setLoadingTournaments] = useState(true)

  const fetchRecentTournaments = useCallback(async () => {
    if (!user) {
      setEntries([])
      setLoadingTournaments(false)
      return
    }
    try {
      // Hosting and playing are two separate relationships: a host has no
      // tournament_players row at all, so the host list is read from
      // tournaments.host_id and the playing list from the participant table.
      const [hosted, joined] = await Promise.all([
        supabase
          .from('tournaments')
          .select('*')
          .eq('host_id', user.id)
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('tournament_players')
          .select('status, placement, tournaments(*)')
          .eq('user_id', user.id)
          .eq('role', 'player')
          .order('joined_at', { ascending: false })
          .limit(12),
      ])

      if (hosted.error) throw hosted.error
      if (joined.error) throw joined.error

      const hostedEntries = (hosted.data || [])
        .filter((t) => t)
        .map((t) => ({ tournament: t, role: 'admin', myStatus: null, placement: null }))

      const playingEntries = (joined.data || [])
        .map((d) => ({ tournament: d.tournaments, role: 'player', myStatus: d.status, placement: d.placement }))
        .filter((d) => d.tournament)

      // Never show the same tournament twice if a host somehow also has a
      // leftover participant row on an old, already-run bracket.
      const hostedIds = new Set(hostedEntries.map((e) => e.tournament.id))
      setEntries([
        ...hostedEntries,
        ...playingEntries.filter((e) => !hostedIds.has(e.tournament.id)),
      ])
    } catch {
      // ignore
    } finally {
      setLoadingTournaments(false)
    }
  }, [user])

  useEffect(() => {
    fetchRecentTournaments()
  }, [fetchRecentTournaments])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
    toast.success(t('common.signedOut'))
  }

  const displayName = profile?.display_name || user?.user_metadata?.display_name || 'Racer'

  const hosting = entries.filter((e) => e.role === 'admin')
  const playing = entries.filter((e) => e.role === 'player')
  const liveCount = entries.filter(
    (e) => e.tournament.status !== 'completed'
  ).length

  return (
    <AppShell width="shell" nav={<TopNav onSignOut={handleLogout} />} footer={<Footer />}>
      <main className="pb-24">
        {/* ═══ Welcome hero ═══════════════════════════════════════════════ */}
        <section className="relative overflow-hidden pb-14 pt-14 lg:pb-20 lg:pt-20">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="bg-grid-fade absolute inset-x-0 top-0 h-full opacity-70" />
            <div
              className="aurora"
              style={{
                top: '-40%',
                left: '30%',
                width: 620,
                height: 620,
                background: 'radial-gradient(circle, rgba(139,92,246,0.18), transparent 66%)',
              }}
            />
          </div>

          <div className="relative">
            <motion.div
              initial={motionSafe ? { opacity: 0, y: 22 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <Badge tone="ok" dot>
                {t('dashboard.online')}
              </Badge>

              <h1 className="display-l mt-6">
                {t('dashboard.greeting')}{' '}
                <span className="gradient-text">{displayName}</span>
              </h1>

              <p className="lede measure mt-5">{t('dashboard.subtitle')}</p>
            </motion.div>

            {/* Real counts, straight from what was fetched. */}
            <motion.dl
              initial={motionSafe ? { opacity: 0, y: 18 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.12 }}
              className="mt-12 grid grid-cols-2 gap-px sm:grid-cols-4"
              style={{ background: 'var(--border-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
            >
              <Metric label={t('dashboard.statTotal')} value={entries.length} />
              <Metric label={t('dashboard.statHosting')} value={hosting.length} accent="#f59e0b" />
              <Metric label={t('dashboard.statPlaying')} value={playing.length} accent="#00f5ff" />
              <Metric label={t('dashboard.statLive')} value={liveCount} accent="#8b5cf6" />
            </motion.dl>
          </div>
        </section>

        {/* ═══ Primary actions — asymmetric ═══════════════════════════════ */}
        <section className="pb-20">
          <div className="grid gap-5 lg:grid-cols-12">
            <motion.button
              type="button"
              initial={motionSafe ? { opacity: 0, y: 22 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              whileHover={motionSafe ? { y: -5 } : undefined}
              onClick={() => navigate('/create-tournament')}
              className="panel panel-accent group relative overflow-hidden p-8 text-left lg:col-span-7 lg:p-11"
              style={{ cursor: 'pointer', borderColor: 'rgba(0,245,255,0.22)' }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(560px 300px at 100% 0%, rgba(0,245,255,0.16), transparent 68%),' +
                    'radial-gradient(460px 280px at 0% 100%, rgba(139,92,246,0.14), transparent 68%)',
                }}
              />

              <div className="relative flex h-full flex-col">
                <span
                  className="grid h-14 w-14 place-items-center"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, rgba(0,245,255,0.22), rgba(139,92,246,0.2))',
                    border: '1px solid rgba(0,245,255,0.34)',
                    color: '#7df3ff',
                    boxShadow: '0 0 30px -8px rgba(0,245,255,0.6)',
                  }}
                  aria-hidden="true"
                >
                  <Plus size={26} strokeWidth={2} />
                </span>

                <h2 className="display-m mt-8" style={{ color: 'var(--text-primary)' }}>
                  {t('dashboard.createTitle')}
                </h2>
                <p className="body-copy measure mt-4">{t('dashboard.createDesc')}</p>

                <span
                  className="mt-9 inline-flex items-center gap-2 font-racing text-sm font-bold uppercase"
                  style={{ color: 'var(--neon-cyan)', letterSpacing: '0.1em' }}
                >
                  {t('dashboard.createCta')}
                  <ArrowUpRight
                    size={17}
                    aria-hidden="true"
                    style={{ transition: 'transform 0.25s var(--ease-out)' }}
                  />
                </span>
              </div>
            </motion.button>

            <motion.button
              type="button"
              initial={motionSafe ? { opacity: 0, y: 22 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              whileHover={motionSafe ? { y: -5 } : undefined}
              onClick={() => navigate('/join-tournament')}
              className="panel group relative overflow-hidden p-8 text-left lg:col-span-5 lg:p-11"
              style={{ cursor: 'pointer' }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'radial-gradient(420px 260px at 0% 0%, rgba(139,92,246,0.14), transparent 70%)',
                }}
              />

              <div className="relative flex h-full flex-col">
                <span
                  className="grid h-14 w-14 place-items-center"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    background: 'rgba(139,92,246,0.14)',
                    border: '1px solid rgba(139,92,246,0.3)',
                    color: '#c4b5fd',
                  }}
                  aria-hidden="true"
                >
                  <LogIn size={24} strokeWidth={2} />
                </span>

                <h2 className="display-s mt-8" style={{ color: 'var(--text-primary)' }}>
                  {t('dashboard.joinTitle')}
                </h2>
                <p className="body-copy mt-4">{t('dashboard.joinDesc')}</p>

                <span
                  className="mt-auto block pt-9 font-racing text-sm font-bold uppercase"
                  style={{ color: 'var(--violet)', letterSpacing: '0.1em' }}
                >
                  {t('dashboard.joinCta')}
                </span>
              </div>
            </motion.button>
          </div>
        </section>

        {/* ═══ Recent tournaments ═════════════════════════════════════════ */}
        <section>
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <span className="eyebrow">{t('dashboard.recent')}</span>
            </div>
          </div>

          {loadingTournaments ? (
            <p className="body-copy">{t('dashboard.loading')}</p>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<Trophy size={20} />}
              title={t('dashboard.emptyTitle')}
              body={t('dashboard.emptyBody')}
            />
          ) : (
            <div className="flex flex-col gap-14">
              {hosting.length > 0 && (
                <TournamentGroup
                  title={t('dashboard.hosting')}
                  hint={t('dashboard.hostingHint')}
                  color="#f59e0b"
                  entries={hosting}
                  labels={labels}
                  motionSafe={motionSafe}
                />
              )}
              {playing.length > 0 && (
                <TournamentGroup
                  title={t('dashboard.playing')}
                  hint={t('dashboard.playingHint')}
                  color="#00f5ff"
                  entries={playing}
                  labels={labels}
                  motionSafe={motionSafe}
                />
              )}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  )
}

// ─── Hero metric ────────────────────────────────────────────────────────────
function Metric({ label, value, accent = 'var(--text-primary)' }) {
  return (
    <div className="p-6" style={{ background: 'rgba(10,14,26,0.8)' }}>
      <dt className="label-xs">{label}</dt>
      <dd
        className="metric-value metric-lg mt-3"
        style={{ color: accent, margin: 0 }}
      >
        {value}
      </dd>
    </div>
  )
}

function TournamentGroup({ title, hint, color, entries, labels, motionSafe }) {
  const navigate = useNavigate()

  return (
    <div>
      {/* Section header as an editorial rule, not a boxed title. */}
      <div
        className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b pb-4"
        style={{ borderColor: 'var(--border-glass)' }}
      >
        <span
          className="font-racing text-[13px] font-bold uppercase"
          style={{ color, letterSpacing: '0.18em' }}
        >
          {title}
        </span>
        <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </span>
        <span
          className="num ml-auto text-[12px]"
          style={{ color: 'var(--text-muted)' }}
        >
          {entries.length}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {entries.map((e) => (
          <TournamentRow
            key={e.tournament.id}
            tournament={e.tournament}
            isAdmin={e.role === 'admin'}
            myStatus={e.myStatus}
            placement={e.placement}
            labels={labels}
            motionSafe={motionSafe}
            onClick={() => navigate(routeFor(e.tournament))}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Tournament Row ─────────────────────────────────────────────────────────
const STATUS_TONE = {
  lobby: 'warn',
  practice: 'warn',
  registration_closed: 'accent',
  bracket_ready: 'info',
  round_active: 'ok',
  completed: 'neutral',
}

/** A started tournament belongs on the overview, not the lobby. */
function routeFor(t) {
  return ['bracket_ready', 'round_active', 'completed'].includes(t.status)
    ? `/tournament/${t.id}`
    : `/lobby/${t.id}`
}

function TournamentRow({ tournament, onClick, isAdmin, myStatus, placement, labels, motionSafe }) {
  const { t } = useI18n()
  const hostLabel = t('common.host')

  return (
    <motion.button
      type="button"
      whileHover={motionSafe ? { x: 6 } : undefined}
      onClick={onClick}
      className="surface group flex w-full items-center justify-between gap-5 text-left transition-colors hover:border-[var(--border-strong)]"
      style={{ padding: '19px 22px', cursor: 'pointer' }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="mb-2 flex flex-wrap items-center gap-2.5">
          <span
            className="font-racing overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {tournament.name}
          </span>
          {isAdmin && (
            <Badge tone="warn" style={{ fontSize: 10, padding: '2px 8px' }}>
              {hostLabel}
            </Badge>
          )}
          <span
            className="num shrink-0 text-[11px]"
            style={{
              color: 'var(--neon-cyan)',
              background: 'rgba(0,245,255,0.08)',
              padding: '3px 9px',
              borderRadius: '5px',
              letterSpacing: '0.08em',
            }}
          >
            {tournament.code}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge
            tone={STATUS_TONE[tournament.status] || 'neutral'}
            dot
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            {labels.tournamentStatus(tournament.status)}
          </Badge>
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {labels.difficulty(tournament.difficulty)}
          </span>
          {myStatus && myStatus !== 'active' && (
            <span
              className="text-[10px] font-semibold uppercase"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.12em' }}
            >
              {labels.placement(placement) || labels.playerStatus(myStatus)}
            </span>
          )}
        </span>
      </span>

      <ChevronRight
        size={20}
        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
        aria-hidden="true"
      />
    </motion.button>
  )
}