import { useReducedMotion } from 'framer-motion'

/**
 * Page frame shared by every screen.
 *
 * The backdrop is the single biggest contributor to the product reading as
 * "premium dark tech" rather than "dark theme". It is built from four stacked
 * layers, all of them decorative and all of them fixed so they never scroll:
 *
 *   1. Base fill — near-black navy.
 *   2. Aurora — three very large, very soft radial washes (cyan top-left,
 *      violet top-right, cyan low-centre). This is the ambient lighting.
 *   3. Technical grid — masked so it fades out instead of tiling to the edges.
 *   4. Vignette — pulls the eye toward the centre column.
 *
 * Because this lives here rather than in each page, the depth is identical
 * everywhere and no screen has to re-declare it.
 *
 * `nav` and `footer` are rendered outside the centred column so they can span
 * the full viewport width while the content stays on the editorial measure.
 *
 * `motionSafe` drives the decorative drift; with reduced motion the aurora is
 * simply parked, and the layout is unchanged.
 *
 * `width` picks one of the three container tiers declared in index.css — 'shell'
 * (1440px, the default and what every full page uses), 'form' (720px) or 'panel'
 * (640px). Passing a tier keeps the layout system in one place: no page sets a
 * width of its own, so all of them stay centred and consistent.
 */
export function AppShell({ children, nav, footer, width = 'shell', className = '', bleed = false }) {
  const motionSafe = !useReducedMotion()
  const shellClass = width === 'form' ? 'shell-form' : width === 'panel' ? 'shell-panel' : 'shell'

  return (
    <div
      className={`relative flex min-h-screen w-full flex-col ${className}`.trim()}
      style={{ isolation: 'isolate' }}
    >
      {/* ── Ambient backdrop: fixed so it never scrolls with content ── */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0" style={{ background: 'var(--bg-deep)' }} />

        {/* 2 · Aurora — the ambient lighting */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(1200px 700px at 10% -10%, rgba(0,245,255,0.14), transparent 62%),' +
              'radial-gradient(1000px 620px at 90% 4%, rgba(139,92,246,0.17), transparent 62%),' +
              'radial-gradient(900px 640px at 50% 108%, rgba(34,211,238,0.08), transparent 64%)',
          }}
        />

        {/* 3 · Technical grid, faded at the edges */}
        <div className="absolute inset-0 bg-grid opacity-[0.5]" />
        <div className="absolute inset-x-0 top-0 h-[70vh] bg-grid-fade opacity-70" />

        {/* Slow drifting light sources */}
        <div
          className="aurora animate-float"
          style={{
            top: '-180px',
            left: '-120px',
            width: 520,
            height: 520,
            background: 'radial-gradient(circle, rgba(0,245,255,0.18), transparent 68%)',
            animation: motionSafe ? undefined : 'none',
          }}
        />
        <div
          className="aurora animate-float"
          style={{
            top: '42%',
            right: '-200px',
            width: 620,
            height: 620,
            background: 'radial-gradient(circle, rgba(139,92,246,0.17), transparent 68%)',
            animationDelay: '-1.6s',
            animation: motionSafe ? undefined : 'none',
          }}
        />

        {/* 4 · Vignette */}
        <div className="vignette" />
      </div>

      {/* ── Full-bleed navigation ── */}
      {nav && <div className="relative z-20">{nav}</div>}

      {/* ── Content, on the desktop container ──
          `min-w-0` matters: as a flex child the column defaults to
          `min-width: auto`, which lets a wide descendant (the bracket, a ranking
          table) push the whole column sideways. Allowing it to shrink is what
          confines horizontal scrolling to those two components. */}
      <div
        className={`relative z-10 flex min-w-0 flex-1 flex-col ${className} ${
          bleed ? '' : shellClass
        }`}
      >
        {children}
      </div>

      {/* ── Full-bleed footer ── */}
      {footer && <div className="relative z-20 mt-auto">{footer}</div>}
    </div>
  )
}