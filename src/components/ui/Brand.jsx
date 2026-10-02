import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'

/**
 * Brand lockup.
 *
 * TypeRacing is the product and owns the wordmark. AWS SBG TESJo is deliberately
 * a quiet byline set in the smallest, widest-tracked type available, so it
 * reads as attribution rather than as a second logo competing with the primary
 * action on screen.
 *
 * The wordmark itself is a proper noun and is identical in every locale; only
 * the byline and the accessible name go through the dictionary.
 */
export function Brand({ size = 'md', showByline = true, linkTo = '/', className = '' }) {
  const { t } = useI18n()

  const dimensions = {
    sm: { mark: 30, title: 17, sub: 8.5, gap: 10 },
    md: { mark: 38, title: 22, sub: 9.5, gap: 12 },
    lg: { mark: 52, title: 32, sub: 11, gap: 15 },
  }[size]

  return (
    <Link
      to={linkTo}
      aria-label={`${t('brand.name')} — ${t('common.home')}`}
      className={`group inline-flex shrink-0 items-center ${className}`.trim()}
      style={{ gap: dimensions.gap }}
    >
      {/* Mark: a glyph tile lit from the top-left corner. */}
      <span
        className="relative grid shrink-0 place-items-center"
        style={{
          width: dimensions.mark,
          height: dimensions.mark,
          borderRadius: Math.round(dimensions.mark * 0.32),
          background: 'linear-gradient(140deg, rgba(0,245,255,0.24), rgba(139,92,246,0.22))',
          border: '1px solid rgba(0,245,255,0.3)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 22px -6px rgba(0,245,255,0.5)',
        }}
        aria-hidden="true"
      >
        <span
          className="font-racing font-bold leading-none"
          style={{ fontSize: dimensions.mark * 0.54, color: '#eaffff' }}
        >
          T
        </span>
      </span>

      <span className="flex min-w-0 flex-col leading-none">
        <span
          className="font-racing gradient-text font-bold"
          style={{ fontSize: dimensions.title, letterSpacing: '-0.015em' }}
        >
          {t('brand.name')}
        </span>

        {showByline && (
          <span
            className="mt-[5px] whitespace-nowrap font-semibold uppercase"
            style={{
              fontSize: dimensions.sub,
              letterSpacing: '0.22em',
              color: 'var(--text-muted)',
            }}
          >
            {t('brand.footer')}
          </span>
        )}
      </span>
    </Link>
  )
}