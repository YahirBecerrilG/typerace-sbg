import { fade } from './PresentationMotion'
import { motion, useReducedMotion } from 'framer-motion'

/** Solid, neutral page frame; container tiers and rendering are unchanged. */
export function AppShell({ children, nav, footer, width = 'shell', className = '', bleed = false }) {
  const motionSafe = !useReducedMotion()
  const shellClass = width === 'form' ? 'shell-form' : width === 'panel' ? 'shell-panel' : 'shell'

  return (
    <div
      className={`relative flex min-h-screen w-full flex-col ${className}`.trim()}
      style={{ isolation: 'isolate' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'var(--bg-deep)', animation: motionSafe ? undefined : 'none' }}
      />

      {/* ── Full-bleed navigation ── */}
      {nav && <div className="relative z-20">{nav}</div>}

      {/* ── Content, on the desktop container ──
          `min-w-0` matters: as a flex child the column defaults to
          `min-width: auto`, which lets a wide descendant (the bracket, a ranking
          table) push the whole column sideways. Allowing it to shrink is what
          confines horizontal scrolling to those two components. */}
      <motion.div {...fade(motionSafe)}
        className={`relative z-10 flex min-w-0 flex-1 flex-col ${className} ${
          bleed ? '' : shellClass
        }`}
      >
        {children}
      </motion.div>

      {/* ── Full-bleed footer ── */}
      {footer && <div className="relative z-20 mt-auto">{footer}</div>}
    </div>
  )
}
