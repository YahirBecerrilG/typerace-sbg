import { stagger, listItem } from '../components/ui/PresentationMotion'
import { entrance, hoverLift } from '../components/ui/PresentationMotion'
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


          <div className="relative">
            <motion.div data-ui-motion
              {...entrance(motionSafe, 0)}
            >
              <Badge tone="ok" dot>
                {t('dashboard.online')}
              </Badge>

              <h1 className="display-l mt-6">
                {t('dashboard.greeting')}{' '}
                <span className="text-heading">{displayName}</span>
              </h1>

              <p className="lede measure mt-5">{t('dashboard.subtitle')}</p>
            </motion.div>

            {/* Real counts, straight from what was fetched. */}
            <motion.dl data-ui-motion
              {...stagger(motionSafe)}
              className="dashboard-stats grid grid-cols-2 gap-px sm:grid-cols-4"
              style={{ background: 'var(--border-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
            >
              <Metric label={t('dashboard.statTotal')} value={entries.length} />
              <Metric label={t('dashboard.statHosting')} value={hosting.length} accent="var(--text-primary)" />
              <Metric label={t('dashboard.statPlaying')} value={playing.length} accent="var(--text-primary)" />
              <Metric label={t('dashboard.statLive')} value={liveCount} accent="var(--text-primary)" />
            </motion.dl>
          </div>
        </section>

        {/* ═══ Primary actions — asymmetric ═══════════════════════════════ */}
        <section className="pb-20">
          <div className="grid gap-5 lg:grid-cols-12">
            <motion.button data-ui-motion
              type="button"
              {...entrance(motionSafe, 0)}
              whileHover={hoverLift(motionSafe)}
              onClick={() => navigate('/create-tournament')}
              className="dashboard-action panel panel-accent group relative overflow-hidden text-left lg:col-span-7"
              style={{ cursor: 'pointer', borderColor: 'rgba(177,183,192,0.22)' }}
            >


              <div className="relative flex h-full flex-col">
                <span
                  className="grid h-14 w-14 place-items-center"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-card)',
                    border: '1px solid rgba(177,183,192,0.34)',
                    color: 'var(--text-primary)',
                    boxShadow: 'none',
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
                  style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}
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

            <motion.button data-ui-motion
              type="button"
              {...entrance(motionSafe, 1)}
              whileHover={hoverLift(motionSafe)}
              onClick={() => navigate('/join-tournament')}
              className="dashboard-action panel group relative overflow-hidden text-left lg:col-span-5"
              style={{ cursor: 'pointer' }}
            >


              <div className="relative flex h-full flex-col">
                <span
                  className="grid h-14 w-14 place-items-center"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    background: 'rgba(177,183,192,0.14)',
                    border: '1px solid rgba(177,183,192,0.3)',
                    color: 'var(--text-secondary)',
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
                  style={{ color: 'var(--text-secondary)', letterSpacing: '0.1em' }}
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
                  color="var(--warning)"
                  entries={hosting}
                  labels={labels}
                  motionSafe={motionSafe}
                />
              )}
              {playing.length > 0 && (
                <TournamentGroup
                  title={t('dashboard.playing')}
                  hint={t('dashboard.playingHint')}
                  color="var(--accent)"
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
  const motionSafe = !useReducedMotion()
  return (
    <motion.div data-ui-motion variants={listItem(motionSafe)} className="dashboard-metric" style={{ background: 'var(--bg-card)' }}>
      <dt className="label-xs">{label}</dt>
      <dd
        className="metric-value metric-lg mt-3"
        style={{ color: accent }}
      >
        {value}
      </dd>
    </motion.div>
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

      <motion.div {...stagger(motionSafe)} className="flex flex-col gap-2.5">
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
      </motion.div>
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
    <motion.button data-ui-motion variants={listItem(motionSafe)}
      type="button"
      whileHover={hoverLift(motionSafe)}
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
              color: 'var(--accent)',
              background: 'rgba(177,183,192,0.08)',
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
