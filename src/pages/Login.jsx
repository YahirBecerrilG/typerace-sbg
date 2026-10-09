import { hoverLift } from '../components/ui/PresentationMotion'
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { AuthLayout, Field } from './Register'
import { useI18n } from '../i18n'

/**
 * Only same-origin in-app paths are honoured as a post-login destination.
 *
 * `PrivateRoute` stores the attempted location in router state, but that value
 * must never be trusted as an arbitrary redirect target: accepting an absolute
 * URL here would turn the login page into an open redirect.
 */
function safeRedirect(target) {
  if (typeof target !== 'string' || !target.startsWith('/')) return '/dashboard'
  // Reject protocol-relative URLs ("//evil.com") which are not same-origin.
  if (target.startsWith('//')) return '/dashboard'
  return target
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login({ email: form.email, password: form.password })
      navigate(safeRedirect(location.state?.from?.pathname), { replace: true })
    } catch (err) {
      toast.error(err.message || t('auth.loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Field
          label={t('auth.email')}
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder={t('auth.emailPlaceholder')}
          autoFocus
        />
        <Field
          label={t('auth.password')}
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder={t('auth.passwordPlaceholder')}
        />
        <motion.button data-ui-motion
          whileHover={hoverLift(motionSafe && !loading)}
          whileTap={motionSafe && !loading ? { y: 0, transition: { duration: 0.15, ease: 'easeOut' } } : undefined}
          type="submit"
          className="btn-primary btn-block"
          disabled={loading}
          style={{ marginTop: '8px', fontSize: '15px', padding: '14px' }}
        >
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </motion.button>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          {t('auth.noAccount')}{' '}
          <Link
            to="/register"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
          >
            {t('auth.createOne')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}