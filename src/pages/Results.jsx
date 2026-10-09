import { stagger, listItem } from '../components/ui/PresentationMotion'
import { entrance } from '../components/ui/PresentationMotion'
import { useState, useEffect, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { TournamentBracket } from '../components/TournamentBracket'
import { Confetti } from '../components/Confetti'
import TournamentUnavailable from '../components/TournamentUnavailable'
import { getTournamentBracket, getTournamentWithPlayers } from '../services/tournamentService'
import { useI18n, useLabels } from '../i18n'
import { AppShell } from '../components/ui/AppShell'
import { Brand } from '../components/ui/Brand'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { Footer } from '../components/ui/Footer'
import { LoadingScreen } from '../components/ui/LoadingScreen'

/**
 * Results — cinematic finale.
 *
 * The champion is treated as the protagonist: a lit stage, an oversized name and
 * a trophy, with everything else stepped down in size and contrast. The podium
 * gives the top three physical presence, the full standings become an e-sports
 * table, and the final bracket closes the screen.
 *
 * Data and logic are untouched: same two fetches, same access rule, same
 * champion lookup (a participant row flagged by the server, never guessed from
 * the last match), same placement maths.
 */
export default function Results() {
  const { tournamentId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const labels = useLabels()
  const motionSafe = !useReducedMotion()
  const [tournament, setTournament] = useState(null)
  const [bracket, setBracket] = useState([])
  const [players, setPlayers] = useState([])
  const [myStats, setMyStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const loadResults = useCallback(async () => {
    try {
      const [tData, bData] = await Promise.all([
        getTournamentWithPlayers(tournamentId),
        getTournamentBracket(tournamentId),
      ])

      setTournament(tData)
      setBracket(bData || [])
      // `players` is participants only: the host has no participant row and is
      // never ranked, placed or counted here.
      const list = tData.players || []
      setPlayers(list)
      setMyStats(list.find((p) => p.user_id === user.id) || null)
      setLoadError(null)
    } catch (err) {
      // Final standings are the most private screen in the app: every placement,
      // every result and the champion. A denied read must render nothing.
      console.error('Results fetch error:', err)
      setLoadError(err)
    } finally {
      setLoading(false)
    }
  }, [tournamentId, user])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  if (loading) {
    return (
      <AppShell>
        <LoadingScreen label={t('common.loading')} />
      </AppShell>
    )
  }

  // Access is resolved server-side (007). A tournament the user is not a
  // participant or host of reads as empty, so there is nothing to show and
  // nothing to leak: render the neutral screen instead of a broken podium.
  if (!tournament) {
    return <TournamentUnavailable error={loadError} />
  }

  // The champion is a participant row flagged by the server, not a guess from
  // the last match.
  const champion = players.find((p) => p.status === 'champion')
  const iWon = champion?.user_id === user?.id
  const ranked = [...players]
    .filter((p) => p.placement !== null && p.placement !== undefined)
    .sort((a, b) => a.placement - b.placement)

  const podium = ranked.filter((p) => p.placement <= 3)
  const championName = champion?.profiles?.display_name || t('results.championFallback')
  const nonWithdrawn = players.filter((p) => p.status !== 'withdrawn').length

  return (
    <AppShell width="shell">
      {iWon && <Confetti count={100} />}

      <header className="flex items-center justify-between py-5">
        <Brand size="sm" />
        <LanguageSwitcher />
      </header>

      <main className="pb-24">
        {/* ═══ Champion stage ══════════════════════════════════════════════ */}
        <section className="relative overflow-hidden pb-16 pt-10 lg:pb-24 lg:pt-16">


          <motion.div data-ui-motion
            {...entrance(motionSafe, 0)}
            className="relative flex flex-col items-center text-center"
          >
            <motion.span data-ui-motion
              animate={motionSafe ? { opacity: 1 } : undefined}
              transition={{ duration: motionSafe ? 0.3 : 0, ease: 'easeOut' }}
              className="mb-6 inline-block text-[72px] leading-none"
              aria-hidden="true"
            >
              🏆
            </motion.span>

            <span
              className="font-racing font-bold uppercase"
              style={{
                color: 'var(--warning)',
                fontSize: 'var(--micro)',
                letterSpacing: '0.3em',
              }}
            >
              {t('results.championLabel')}
            </span>

            <h1
              className="text-heading display-xl mt-5"
              style={{ maxWidth: '18ch' }}
            >
              {championName}
            </h1>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <span className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>
                {tournament?.name}
              </span>
              {iWon && (
                <span
                  className="badge tone-accent"
                  style={{ fontSize: 10, gap: 6 }}
                >
                  <Crown size={11} aria-hidden="true" />
                  {t('results.youChampion')}
                </span>
              )}
            </div>
          </motion.div>
        </section>

        {/* ═══ Tournament facts ═════════════════════════════════════════════ */}
        <motion.section data-ui-motion
          {...stagger(motionSafe)}
          className="mb-16 grid grid-cols-1 gap-px sm:grid-cols-3"
          style={{ background: 'var(--border-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
        >
          <Fact
            label={t('results.statDifficulty')}
            value={labels.difficulty(tournament?.difficulty)}
            accent="var(--warning)"
          />
          <Fact label={t('results.statPlayers')} value={nonWithdrawn} accent="var(--accent)" />
          <Fact
            label={t('results.statYourResult')}
            value={labels.placement(myStats?.placement) || (myStats ? labels.playerStatus(myStats.status) : '—')}
            accent={
              iWon
                ? 'var(--warning)'
                : myStats?.status === 'eliminated'
                  ? 'var(--danger)'
                  : 'var(--text-secondary)'
            }
          />
        </motion.section>

        {/* ═══ Podium ═══════════════════════════════════════════════════════ */}
        {podium.length >= 3 && (
          <motion.section data-ui-motion
            {...entrance(motionSafe, 0)}
            className="mb-16"
          >
            <div
              className="mb-8 flex items-end justify-between gap-4 border-b pb-4"
              style={{ borderColor: 'var(--border-glass)' }}
            >
              <span className="eyebrow">{t('results.podiumTitle')}</span>
            </div>

            {/* Second, first, third — first is tallest and centred. */}
            <div className="flex items-end justify-center gap-3 sm:gap-6">
              <PodiumStep
                player={podium.find((p) => p.placement === 2)}
                height="md"
                rank={2}
                isMe={podium.find((p) => p.placement === 2)?.user_id === user.id}
              />
              <PodiumStep
                player={podium.find((p) => p.placement === 1)}
                height="lg"
                rank={1}
                isMe={podium.find((p) => p.placement === 1)?.user_id === user.id}
              />
              <PodiumStep
                player={podium.find((p) => p.placement === 3)}
                height="sm"
                rank={3}
                isMe={podium.find((p) => p.placement === 3)?.user_id === user.id}
              />
            </div>
          </motion.section>
        )}

        {/* ═══ Full standings ═══════════════════════════════════════════════ */}
        {ranked.length > 0 && (
          <motion.section data-ui-motion
            {...entrance(motionSafe, 0)}
            className="mb-16"
          >
            <div
              className="mb-5 flex items-end justify-between gap-4 border-b pb-4"
              style={{ borderColor: 'var(--border-glass)' }}
            >
              <span className="eyebrow">{t('results.standings')}</span>
              <span className="num text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {ranked.length}
              </span>
            </div>

            <div className="panel overflow-hidden">
              <div className="rank-scroll">
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 70 }}>{t('results.colPlace')}</th>
                      <th scope="col">{t('results.colPlayer')}</th>
                      <th scope="col" className="col-num">{t('results.colWins')}</th>
                      <th scope="col" className="col-num">{t('results.colResult')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((p, i) => (
                      <motion.tr {...entrance(motionSafe, i)} key={p.id} data-me={p.user_id === user.id}>
                        <td>
                          <span
                            className="font-racing text-[15px] font-extrabold"
                            style={{ color: placementColor(p.placement) }}
                          >
                            #{p.placement}
                          </span>
                        </td>
                        <td>
                          <span
                            className="font-racing text-[15px] font-bold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {p.profiles?.display_name || t('common.player')}
                          </span>
                          {p.user_id === user.id && (
                            <span
                              className="ml-3 text-[10px] font-bold uppercase"
                              style={{ color: 'var(--accent)', letterSpacing: '0.14em' }}
                            >
                              {t('common.youShort')}
                            </span>
                          )}
                        </td>
                        <td className="col-num" style={{ color: 'var(--text-secondary)' }}>
                          {p.wins > 0 ? t('tournament.winsStat', { wins: p.wins }) : '—'}
                        </td>
                        <td
                          className="col-num font-racing text-[11px] font-bold uppercase"
                          style={{ color: placementColor(p.placement), letterSpacing: '0.1em' }}
                        >
                          {labels.placement(p.placement)}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>
        )}

        {/* ═══ Final bracket ═══════════════════════════════════════════════ */}
        <motion.section data-ui-motion
          {...entrance(motionSafe, 0)}
          className="mb-14"
        >
          <div
            className="mb-5 flex items-end justify-between gap-4 border-b pb-4"
            style={{ borderColor: 'var(--border-glass)' }}
          >
            <span className="eyebrow">{t('results.bracket')}</span>
          </div>

          <div className="panel panel-pad bracket-scroll">
            <TournamentBracket
              rounds={bracket}
              currentRound={bracket.length ? bracket[bracket.length - 1].round_number : 1}
              myPlayerId={myStats?.id}
            />
          </div>
        </motion.section>

        {/* ═══ Actions ═════════════════════════════════════════════════════ */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              className="btn-primary btn-xl btn-cta"
              onClick={() => navigate('/create-tournament')}
            >
              {t('results.playAgain')}
            </button>
            <button
              type="button"
              className="btn-ghost btn-lg"
              onClick={() => navigate('/dashboard')}
            >
              {t('common.backToDashboard')}
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </AppShell>
  )
}

// ─── Fact tile ──────────────────────────────────────────────────────────────
function Fact({ label, value, accent }) {
  const motionSafe = !useReducedMotion()
  return (
    <motion.div data-ui-motion variants={listItem(motionSafe)} className="metric p-7" style={{ background: 'var(--bg-card)' }}>
      <span className="label-xs">{label}</span>
      <span
        className="metric-value metric-lg mt-3"
        style={{ color: accent, fontSize: 'clamp(20px, 2.2vw, 30px)' }}
      >
        {value}
      </span>
    </motion.div>
  )
}

// ─── Podium ─────────────────────────────────────────────────────────────────
/**
 * A single podium block. Height encodes placement; the block carries the
 * placement's own tint so the three steps are distinguishable at a glance
 * without any extra labelling.
 */
function PodiumStep({ player, height, rank, isMe }) {
  const motionSafe = !useReducedMotion()
  const { t } = useI18n()

  if (!player) return <div className="w-[30%] max-w-[200px]" aria-hidden="true" />

  const heights = { lg: 190, md: 140, sm: 110 }
  const tints = {
    1: { bg: 'rgba(177,183,192,0.14)', border: 'rgba(177,183,192,0.4)', text: 'var(--warning)' },
    2: { bg: 'rgba(203,213,225,0.1)', border: 'rgba(203,213,225,0.34)', text: '#cbd5e1' },
    3: { bg: 'rgba(177,183,192,0.14)', border: 'rgba(177,183,192,0.4)', text: '#d97706' },
  }
  const tint = tints[rank]
  const name = player.profiles?.display_name || t('common.player')

  return (
    <motion.div {...entrance(motionSafe, rank === 2 ? 0 : rank === 1 ? 1 : 2)} className="flex w-[30%] max-w-[210px] flex-col items-center">
      <span
        className="font-racing text-[13px] font-bold uppercase"
        style={{ color: tint.text, letterSpacing: '0.1em' }}
      >
        {t('results.placeNum', { n: rank })}
      </span>

      <span
        className="font-racing mt-3 grid w-full place-items-center truncate px-2 font-bold"
        style={{ color: 'var(--text-primary)', fontSize: 'clamp(13px, 1.4vw, 16px)' }}
        title={name}
      >
        {name}
      </span>

      {isMe && (
        <span className="mt-1.5 text-[9.5px] font-bold uppercase" style={{ color: 'var(--accent)' }}>
          {t('common.youShort')}
        </span>
      )}

      <div
        className="mt-4 flex w-full items-start justify-center pt-4"
        style={{
          height: heights[height],
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          background: 'var(--bg-card)',
          border: `1px solid ${tint.border}`,
          borderBottom: 'none',
          boxShadow: 'none',
        }}
      >
        <span className="font-racing text-[34px] font-extrabold" style={{ color: tint.text }}>
          {rank}
        </span>
      </div>
    </motion.div>
  )
}

function placementColor(placement) {
  if (placement === 1) return 'var(--warning)'
  if (placement === 2) return 'var(--text-secondary)'
  if (placement === 3) return '#b45309'
  return 'var(--text-muted)'
}
