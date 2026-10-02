import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, LogOut } from 'lucide-react'
import { Brand } from './Brand'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useI18n } from '../../i18n'
import { useAuth } from '../../hooks/useAuth'

/**
 * Auth-aware top bar, rendered full-bleed above the content column.
 *
 * Structure follows the reference layout: identity on the left, a single quiet
 * pill of links in the middle, language and session on the right. The nav only
 * shows links a signed-in user can act on, so Dashboard / Join / Create never
 * appear to anonymous visitors. Handlers and destinations are unchanged from
 * the previous inline versions — this only centralises them.
 *
 * `onSignOut` lets a screen own the sign-out side effects (redirect + toast);
 * without it the plain Supabase logout is used.
 *
 * Routes are exactly the same as before; only the arrangement is new. The
 * mobile disclosure is pure presentation and renders the same links.
 */
export function TopNav({ onSignOut, className = '' }) {
  const { t } = useI18n()
  const { user, profile, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const isAuthenticated = !!user

  const displayName =
    profile?.display_name || user?.user_metadata?.display_name || t('common.player')

  const navItems = isAuthenticated
    ? [
        { to: '/dashboard', label: t('nav.dashboard') },
        { to: '/join-tournament', label: t('join.title') },
        { to: '/create-tournament', label: t('create.title') },
      ]
    : []

  const signOut = onSignOut || logout

  return (
    <header className={`nav-shell ${className}`.trim()}>
      <div className="nav-inner">
        <Brand size="sm" />

        {/* ── Primary navigation ── */}
        {navItems.length > 0 && (
          <nav aria-label={t('common.primaryNav')}>
            <div className="nav-links">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className="nav-link">
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}

        <div className="flex items-center gap-2.5">
          <LanguageSwitcher />

          {isAuthenticated && (
            <>
              {/* Session chip — initials plus display name, presentation only. */}
              <div className="nav-user hidden sm:inline-flex">
                <span className="nav-user-initial" aria-hidden="true">
                  {displayName[0]?.toUpperCase()}
                </span>
                <span
                  className="max-w-[180px] truncate text-[13px] font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                  title={displayName}
                >
                  {displayName}
                </span>
              </div>

              <button
                type="button"
                onClick={signOut}
                className="icon-btn"
                aria-label={t('nav.signOut')}
                title={t('nav.signOut')}
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </>
          )}

          {/* ── Mobile disclosure ── */}
          {navItems.length > 0 && (
            <button
              type="button"
              className="icon-btn lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={t('common.primaryNav')}
            >
              {menuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="border-t lg:hidden" style={{ borderColor: 'var(--border-glass)' }}>
          <nav
            aria-label={t('common.primaryNav')}
            className="mx-auto flex w-full max-w-[var(--shell)] flex-col gap-1 px-5 py-4 sm:px-6 lg:px-10"
          >
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className="nav-link justify-center"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}