/**
 * Generic empty / unavailable state.
 *
 * Used for "no tournaments yet", "bracket not generated" and the neutral
 * tournament-unavailable panel, so all three share one layout instead of three
 * slightly different text blocks.
 */
export function EmptyState({ icon, title, body, action }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      style={{
        background: 'var(--bg-inset)',
        border: '1px dashed var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {icon && (
        <span
          className="grid place-items-center rounded-2xl"
          style={{
            width: 44,
            height: 44,
            background: 'rgba(0,245,255,0.07)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--cyan)',
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      <h3
        className="font-racing text-lg font-bold tracking-wide"
        style={{ color: 'var(--text-primary)' }}
      >
        {title}
      </h3>

      {body && (
        <p className="max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
          {body}
        </p>
      )}

      {action}
    </div>
  )
}