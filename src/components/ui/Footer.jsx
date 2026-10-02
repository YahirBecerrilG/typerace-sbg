import { Brand } from './Brand'
import { useI18n } from '../../i18n'

/**
 * Footer.
 *
 * This is where the AWS SBG TESJo branding is strongest without competing with
 * the product: TypeRacing owns the oversized wordmark on the left, the community
 * name sits on the right at low contrast in wide tracking, and the whole bar is
 * closed with a hairline rule and a technical grid so it reads as part of the
 * same surface rather than a bolt-on.
 */
export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="relative overflow-hidden" style={{ borderTop: '1px solid var(--border-glass)' }}>
      {/* Faint grid so the bar shares the backdrop's language. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid-fine"
        style={{ opacity: 0.5 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
        style={{
          background: 'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(139,92,246,0.1), transparent 70%)',
        }}
      />

      <div className="shell relative py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <Brand size="lg" showByline={false} />
            <p
              className="measure-tight mt-5 max-w-md text-[13px] leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              {t('home.subtitle')}
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            {/* Secondary branding: present, elegant, never the loudest thing. */}
            <span
              className="font-racing text-base font-bold uppercase"
              style={{ color: 'var(--text-secondary)', letterSpacing: '0.3em' }}
            >
              {t('brand.footer')}
            </span>
            <span
              className="text-[10.5px] uppercase"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.18em' }}
            >
              {t('brand.program')}
            </span>
          </div>
        </div>

        <hr className="rule mt-10" />

        <div
          className="mt-6 flex flex-col items-start justify-between gap-2 text-[10.5px] uppercase sm:flex-row sm:items-center"
          style={{ color: 'var(--text-muted)', letterSpacing: '0.16em' }}
        >
          <span>{t('brand.footer')}</span>
          <span>{t('brand.program')}</span>
        </div>
      </div>
    </footer>
  )
}