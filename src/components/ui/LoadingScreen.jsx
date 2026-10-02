/**
 * Loading state.
 *
 * Replaces the ad-hoc "Loading…" text blocks that were duplicated across the
 * lobby, tournament, results and practice screens, so the spinner, the label
 * and the reduced-motion behaviour are identical everywhere.
 */
export function LoadingScreen({ label, minHeight = '100vh' }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ minHeight }}
    >
      <span
        className="animate-spin rounded-full border-2"
        style={{
          width: 34,
          height: 34,
          borderColor: 'var(--border-subtle)',
          borderTopColor: 'var(--neon-cyan)',
        }}
        aria-hidden="true"
      />
      <span
        className="font-racing text-sm font-semibold uppercase tracking-[0.22em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
    </div>
  )
}