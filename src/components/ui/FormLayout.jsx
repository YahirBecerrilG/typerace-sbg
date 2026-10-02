import { Link } from 'react-router-dom'
import { AppShell } from './AppShell'
import { Brand } from './Brand'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Footer } from './Footer'
import { useI18n } from '../../i18n'

/**
 * Centred frame for the single-purpose forms (create / join).
 *
 * Same chrome as every other screen, just on the `form` container tier, so a user
 * moving between the two forms never sees the layout change. The card is wide
 * enough to fill that tier on a desktop monitor rather than sitting as a narrow
 * column in the corner.
 */
export function FormLayout({ title, subtitle, children }) {
  const { t } = useI18n()

  return (
    <AppShell width="form">
      <header className="flex items-center justify-between py-6">
        <Brand size="sm" />
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-ghost btn-sm">
            {t('nav.dashboard')}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex min-h-[68vh] items-center justify-center py-6">
        <div className="glass-card hairline-top w-full" style={{ padding: '38px' }}>
          <h1
            className="mb-2 font-racing font-extrabold tracking-tight"
            style={{ fontSize: '30px', color: 'var(--text-primary)' }}
          >
            {title}
          </h1>
          <p className="mb-8 text-sm" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
          {children}
        </div>
      </main>

      <Footer />
    </AppShell>
  )
}