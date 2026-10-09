import { useId } from 'react'
import { useI18n } from '../../i18n'

/**
 * Language switcher.
 *
 * A native <select> rather than a custom toggle: it is keyboard accessible and
 * screen-reader labelled for free, which is the one thing a bespoke control
 * usually gets wrong. Only the flag glyph and the short code change with the
 * locale — the option labels come from the dictionary, so each is written in
 * its own language.
 *
 * Sized and toned to sit inside the navbar pill without competing with it.
 */
export function LanguageSwitcher({ variant = 'ghost', className = '' }) {
  const { locale, setLocale, t, languages } = useI18n()
  const id = useId()

  const isGhost = variant === 'ghost'

  return (
    <label
      htmlFor={id}
      className={`inline-flex shrink-0 items-center gap-2 ${className}`}
      style={{
        padding: '6px 11px',
        borderRadius: 'var(--radius-md)',
        background: isGhost ? 'rgba(255,255,255,0.03)' : 'var(--bg-inset)',
        border: `1px solid ${isGhost ? 'var(--border-glass)' : 'var(--border-subtle)'}`,
        transition: 'border-color 0.2s var(--ease-out), background 0.2s var(--ease-out)',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>

      <select
        id={id}
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        aria-label={t('lang.switchLabel')}
        className="cursor-pointer bg-transparent font-racing text-xs font-semibold uppercase outline-none"
        style={{ color: 'var(--text-secondary)', letterSpacing: '0.1em' }}
      >
        {languages.map((lang) => (
          <option
            key={lang.code}
            value={lang.code}
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}
          >
            {lang.flag} {t(lang.labelKey)}
          </option>
        ))}
      </select>
    </label>
  )
}