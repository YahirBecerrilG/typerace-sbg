/**
 * Status pill.
 *
 * `tone` maps to the .tone-* classes in index.css, so status colour is decided
 * in one place. The label itself always comes from the dictionary — this
 * component never receives raw enum values.
 */
export function Badge({ tone = 'neutral', children, dot = false, className = '', style }) {
  return (
    <span className={`badge tone-${tone} ${className}`} style={style}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

/**
 * Metric tile for WPM / accuracy / runs / seed values.
 *
 * The value uses JetBrains Mono so changing digits never shift the layout as
 * they tick up mid-race.
 */
export function StatTile({ label, value, accent, style }) {
  return (
    <div className="stat-tile" style={style}>
      <span className="stat-tile-label">{label}</span>
      <span
        className="stat-tile-value"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
    </div>
  )
}