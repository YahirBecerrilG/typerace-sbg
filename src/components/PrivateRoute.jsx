import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

/**
 * Route guard for authenticated areas.
 *
 * The session is the real Supabase session (`useAuth` resolves it with
 * `supabase.auth.getSession()` and keeps it fresh through `onAuthStateChange`),
 * so this is not a client-side guess: with no valid session the request never
 * reaches a page, and with one, Supabase RLS/RPC still decide what that session
 * may read or do. This guard only decides which screen to render — the real
 * authorisation boundary is the database.
 *
 * The attempted URL is preserved so Login can send the user back to where they
 * were heading instead of always dropping them on the dashboard.
 */
export function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Never render a private page while the session is still unknown: bouncing to
  // /login during the first render would flash the login screen at signed-in
  // users on every hard refresh.
  if (loading) return <RouteLoading />

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

/**
 * Inverse guard for the public pages.
 *
 * A signed-in user who opens /login or /register directly is sent to their
 * dashboard: those pages have no purpose for an authenticated session and
 * leaving them reachable is how "logged in but stuck on login" happens.
 */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <RouteLoading />

  if (user) return <Navigate to="/dashboard" replace />

  return children
}

function RouteLoading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#080b14',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: '3px solid rgba(177,183,192,0.2)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
