import { entrance, hoverLift } from '../components/ui/PresentationMotion'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Radio, Trophy, Octagon, BarChart3 } from 'lucide-react'
import { Car } from '../components/Car'
import { AppShell } from '../components/ui/AppShell'
import { TopNav } from '../components/ui/TopNav'
import { Footer } from '../components/ui/Footer'
import { useI18n } from '../i18n'

/**
 * Landing page — editorial composition.
 *
 * This is a landing page, not a dashboard: one dominant hero, then long
 * measures of negative space, then a small number of large statements. The
 * structure is deliberately asymmetric (copy left, product panel right) so it
 * does not read as a stack of equal boxes.
 *
 * Content rule honoured throughout: nothing on this screen is invented. There
 * are no player counts, WPM records or uptime figures — the only numbers shown
 * are structural (bracket slots). The race console is labelled as a preview so
 * it can never be mistaken for a live feed.
 */
export default function Home() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()

  const capabilities = [
    { icon: Radio, title: t('home.features.realtime'), body: t('home.features.realtimeDesc') },
    { icon: Trophy, title: t('home.features.brackets'), body: t('home.features.bracketsDesc') },
    { icon: Octagon, title: t('home.features.crash'), body: t('home.features.crashDesc') },
    { icon: BarChart3, title: t('home.features.live'), body: t('home.features.liveDesc') },
  ]

  const steps = [
    { n: '01', title: t('home.step1Title'), body: t('home.step1Desc') },
    { n: '02', title: t('home.step2Title'), body: t('home.step2Desc') },
    { n: '03', title: t('home.step3Title'), body: t('home.step3Desc') },
  ]

  const heroTitle = t('home.heroTitle')

  return (
    <AppShell width="shell" nav={<TopNav />} footer={<Footer />}>
      <main className="flex flex-col">
        {/* ═══ Hero ═══════════════════════════════════════════════════════ */}
        <section className="home-hero relative overflow-hidden pb-20 pt-12 sm:pt-20 lg:pb-28 lg:pt-28">
          {/* Focal lighting directly behind the headline. */}


          <div className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
            {/* ── Copy column ── */}
            <div>
              <motion.span data-ui-motion
                {...entrance(motionSafe, 0)}
                className="eyebrow"
              >
                {t('home.eyebrow')}
              </motion.span>

              <motion.h1 data-ui-motion
                {...entrance(motionSafe, 1)}
                className="display-xl text-heading mt-7"
              >
                {heroTitle.slice(0, 4)}
                <span>{heroTitle.slice(4)}</span>
              </motion.h1>

              <motion.p data-ui-motion
                {...entrance(motionSafe, 2)}
                className="lede measure mt-7"
              >
                {t('home.heroLead')}
              </motion.p>

              <motion.div data-ui-motion
                {...entrance(motionSafe, 3)}
                className="home-hero-actions flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
              >
                <motion.button data-ui-motion
                  whileHover={hoverLift(motionSafe)}
                  whileTap={motionSafe ? { y: 0, transition: { duration: 0.15, ease: 'easeOut' } } : undefined}
                  className="btn-primary btn-xl btn-cta"
                  onClick={() => navigate('/register')}
                >
                  {t('home.ctaPrimary')}
                  <ArrowRight size={17} aria-hidden="true" style={{ marginLeft: 10 }} />
                </motion.button>
                <motion.button data-ui-motion
                  whileHover={hoverLift(motionSafe)}
                  whileTap={motionSafe ? { y: 0, transition: { duration: 0.15, ease: 'easeOut' } } : undefined}
                  className="btn-secondary btn-xl"
                  onClick={() => navigate('/login')}
                >
                  {t('home.ctaSecondary')}
                </motion.button>
              </motion.div>

              <motion.div data-ui-motion
                {...entrance(motionSafe, 4)}
                className="home-hero-features flex flex-wrap items-center gap-x-6 gap-y-3"
              >
                {capabilities.slice(0, 2).map(({ title }) => (
                  <span
                    key={title}
                    className="flex items-center gap-2 text-[12.5px] font-semibold uppercase"
                    style={{ color: 'var(--text-muted)', letterSpacing: '0.1em' }}
                  >
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{ background: 'var(--text-secondary)' }}
                      aria-hidden="true"
                    />
                    {title}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* ── Product panel ── */}
            <motion.div data-ui-motion
              {...entrance(motionSafe, 5)}
            >
              <RaceConsole />
            </motion.div>
          </div>
        </section>

        {/* ═══ Capabilities — numbered editorial list ═════════════════════ */}
        <motion.section data-ui-motion className="section"
          {...entrance(motionSafe, 0, true)}
        >
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div>
              <span className="eyebrow">{t('home.capabilitiesLabel')}</span>
              <h2 className="display-l mt-6" style={{ color: 'var(--text-primary)' }}>
                {t('home.featuresTitle')}
              </h2>
              <p className="body-copy measure mt-6">{t('home.pillars')}</p>
            </div>

            {/* Rows, not cards: a list with generous leading reads as editorial. */}
            <ol className="flex flex-col">
              {capabilities.map(({ icon: Icon, title, body }, i) => (
                <motion.li data-ui-motion
                  key={title}
                  {...entrance(motionSafe, i, true)}
                  className="group flex gap-6 border-t py-8 first:border-t-0 first:pt-0"
                  style={{ borderColor: 'var(--border-glass)' }}
                >
                  <span
                    className="num mt-1 shrink-0 text-[13px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    0{i + 1}
                  </span>

                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center"
                    style={{
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(177,183,192,0.07)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                    aria-hidden="true"
                  >
                    <Icon size={18} strokeWidth={1.9} />
                  </span>

                  <div className="min-w-0">
                    <h3 className="display-s" style={{ color: 'var(--text-primary)' }}>
                      {title}
                    </h3>
                    <p className="body-copy mt-2.5 max-w-xl">{body}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </motion.section>

        {/* ═══ The mechanic — the typing surface as the hero object ═══════ */}
        <motion.section data-ui-motion className="pb-2"
          {...entrance(motionSafe, 0, true)}
        >
          <div className="panel panel-accent panel-pad-lg relative overflow-hidden">


            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
              <div>
                <span className="eyebrow">{t('home.mechanicLabel')}</span>
                <h2 className="display-m mt-6" style={{ color: 'var(--text-primary)' }}>
                  {t('home.mechanicTitle')}
                </h2>
                <p className="body-copy measure mt-5">{t('home.mechanicBody')}</p>
              </div>

              {/* Decorative specimen of the typing surface. Same monospace face
                  as the real thing; the characters are decoration, not data. */}
              <div
                className="relative overflow-hidden p-6 sm:p-8"
                style={{
                  background: 'rgba(0,0,0,0.34)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <div className="mb-4 flex items-center gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(255,255,255,0.14)' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: 'rgba(177,183,192,0.35)' }} />
                </div>

                <p
                  aria-hidden="true"
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 'clamp(15px, 1.9vw, 21px)',
                    lineHeight: 1.85,
                    wordBreak: 'break-word',
                    userSelect: 'none',
                  }}
                >
                  {specimen.split('').map((char, i) => (
                    <span
                      key={i}
                      style={{
                        color: i < specimenDone ? 'var(--success)' : i === specimenDone ? 'var(--text-primary)' : 'var(--text-muted)',
                        borderBottom: i === specimenDone ? '2px solid var(--accent)' : 'none',
                      }}
                    >
                      {char === ' ' ? '\u00A0' : char}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ═══ How it works ═══════════════════════════════════════════════ */}
        <motion.section data-ui-motion className="section"
          {...entrance(motionSafe, 0, true)}
        >
          <div className="flex flex-col gap-10">
            <div>
              <span className="eyebrow">{t('home.stepsLabel')}</span>
              <h2 className="display-m mt-6" style={{ color: 'var(--text-primary)' }}>
                {t('home.stepsTitle')}
              </h2>
            </div>

            <div className="home-steps-grid grid sm:grid-cols-3">
              {steps.map((step, i) => (
                <motion.div {...entrance(motionSafe, i, true)} whileHover={hoverLift(motionSafe)}
                  key={step.n}
                  className="home-step relative"
                  style={{ background: 'var(--bg-card)' }}
                >
                  <span
                    className="font-racing block text-[44px] font-extrabold leading-none"
                    style={{ color: 'rgba(177,183,192,0.16)' }}
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>
                  <h3 className="display-s mt-5" style={{ color: 'var(--text-primary)' }}>
                    {step.title}
                  </h3>
                  <p className="body-copy mt-3">{step.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ═══ Closing CTA ════════════════════════════════════════════════ */}
        <motion.section data-ui-motion className="pb-24 lg:pb-32"
          {...entrance(motionSafe, 0, true)}
        >
          <div className="home-closing panel panel-accent panel-pad-lg relative overflow-hidden text-center">

            <div className="home-closing-content relative mx-auto flex max-w-2xl flex-col items-center">
              <h2 className="display-m" style={{ color: 'var(--text-primary)' }}>
                {t('home.ctaTitle')}
              </h2>
              <p className="body-copy measure mt-5">{t('home.ctaBody')}</p>
              <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <button
                  type="button"
                  className="btn-primary btn-xl btn-cta"
                  onClick={() => navigate('/register')}
                >
                  {t('home.ctaPrimary')}
                  <ArrowRight size={17} aria-hidden="true" style={{ marginLeft: 10 }} />
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-xl"
                  onClick={() => navigate('/login')}
                >
                  {t('home.ctaSecondary')}
                </button>
              </div>
            </div>
          </div>
        </motion.section>
      </main>
    </AppShell>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   Race console — the visual panel beside the hero.
   ─────────────────────────────────────────────────────────────────────────── */

/** Decorative character strip. Never real data, never a stored phrase. */
const specimen = 'the quick brown fox jumps over the lazy dog while the clock runs down'
const specimenDone = 24

/**
 * Illustrative view of a head-to-head round: two lanes, two cars, a live
 * progress fill, and the bracket rounds the round feeds into.
 *
 * Explicitly labelled as a preview in the UI. It is built from the same
 * primitives the real race screen uses (Car, .track-lane, .track-fill) so the
 * marketing surface and the product surface stay visually identical.
 */
function RaceConsole() {
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()

  return (
    <div className="panel panel-pad relative overflow-hidden">
      {/* Focal halo behind the console. */}



      <div className="relative">
        {/* Panel head */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <span className="label-xs">{t('home.previewLabel')}</span>
            <div className="display-xs mt-2" style={{ color: 'var(--text-primary)' }}>
              {t('home.previewRound')}
            </div>
          </div>
          <span
            className="badge tone-info"
            style={{ fontSize: 10 }}
          >
            <span className="dot" aria-hidden="true" />
            {t('home.previewLive')}
          </span>
        </div>

        {/* Lanes */}
        <div className="flex flex-col gap-3">
          <ConsoleLane
            name={t('home.previewPlayerA')}
            colorIndex={0}
            progress={72}
            state="racing"
            motionSafe={motionSafe}
          />
          <ConsoleLane
            name={t('home.previewPlayerB')}
            colorIndex={1}
            progress={54}
            state="racing"
            motionSafe={motionSafe}
            delayed
          />
        </div>

        {/* Bracket path the round feeds into */}
        <div className="mt-7">
          <span className="label-xs">{t('home.previewBracket')}</span>
          <div className="mt-4 flex items-stretch gap-2">
            {['round.of32', 'round.of16', 'round.quarterfinals', 'round.semifinals', 'round.final'].map(
              (key, i) => (
                <div key={key} className="min-w-0 flex-1">
                  <div
                    className="h-1 rounded-full"
                    style={{
                      background: i === 1 ? 'var(--accent)' : 'var(--border-strong)',
                      boxShadow: 'none',
                    }}
                    aria-hidden="true"
                  />
                  <div
                    className="mt-2.5 truncate text-center text-[9.5px] font-bold uppercase"
                    style={{
                      color: i === 1 ? 'var(--accent)' : 'var(--text-muted)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {t(key)}
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        <hr className="rule mt-7" />

        <p className="mt-5 text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {t('home.previewNote')}
        </p>
      </div>
    </div>
  )
}

function ConsoleLane({ name, colorIndex, progress, state, motionSafe, delayed = false }) {
  const color = colorIndex === 0 ? 'var(--accent)' : 'var(--text-secondary)'

  return (
    <div>
      <span
        className="font-racing mb-2 block truncate text-[13px] font-bold uppercase"
        style={{ color, letterSpacing: '0.08em' }}
      >
        {name}
      </span>

      <div className="track-lane" data-active={colorIndex === 0} style={{ height: 66 }}>
        <div className="track-road" />
        <motion.div data-ui-motion
          className="track-fill"
          initial={false}
          animate={{ width: `${progress * 0.86}%` }}
          transition={{ duration: motionSafe ? 0.3 : 0, delay: motionSafe && delayed ? 0.05 : 0, ease: 'easeOut' }}
          aria-hidden="true"
        />

        {/* Start and finish marks */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-[2%] w-px"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-[2%] w-[10px]"
          style={{
            background:
              'var(--border-strong)',
          }}
        />

        <motion.div data-ui-motion
          className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `calc(${2 + progress * 0.86}% - 28px)` }}
          animate={motionSafe ? { opacity: 1 } : undefined}
          transition={{ duration: motionSafe ? 0.3 : 0, ease: 'easeOut' }}
        >
          <Car colorIndex={colorIndex} state={state} size={56} />
        </motion.div>
      </div>
    </div>
  )
}
