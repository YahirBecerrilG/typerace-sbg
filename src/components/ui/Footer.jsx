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
    <footer className="site-footer relative overflow-hidden" style={{ borderTop: '1px solid var(--border-glass)' }}>
      {/* Faint grid so the bar shares the backdrop's language. */}



      <div className="shell footer-inner relative">
        <div className="footer-layout">
          <div>
            <Brand size="lg" showByline={false} />
            <p
              className="footer-description measure-tight max-w-md"
            >
              {t('home.subtitle')}
            </p>
          </div>

          <div className="footer-credit">
            {/* Secondary branding: present, elegant, never the loudest thing. */}
            <span
              className="footer-community font-racing text-base font-bold uppercase"
            >
              {t('brand.footer')}
            </span>
            <span
              className="footer-program uppercase"
            >
              {t('brand.program')}
            </span>
          </div>
        </div>

      </div>
    </footer>
  )
}
