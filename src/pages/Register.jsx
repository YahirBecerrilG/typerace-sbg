import { FadeMessage } from '../components/ui/PresentationMotion'
import { entrance, hoverLift } from '../components/ui/PresentationMotion'
import { useId, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { validateEmail, validatePassword, validateDisplayName } from '../utils/validation'
import { useI18n } from '../i18n'
import { AppShell } from '../components/ui/AppShell'
import { Brand } from '../components/ui/Brand'
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher'
import { Footer } from '../components/ui/Footer'
import { PasswordGuidance, PasswordVisibility } from '../components/ui/PasswordPresentation'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const motionSafe = !useReducedMotion()
  const [form, setForm] = useState({ displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    const dnErr = validateDisplayName(form.displayName, t)
    if (dnErr) e.displayName = dnErr
    if (!validateEmail(form.email)) e.email = t('validation.emailInvalid')
    const pwErr = validatePassword(form.password, t)
    if (pwErr) e.password = pwErr
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      await register({ email: form.email, password: form.password, displayName: form.displayName.trim() })
      toast.success(t('auth.accountCreated'))
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || t('auth.registrationFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Field
          label={t('auth.displayName')}
          value={form.displayName}
          onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
          placeholder={t('auth.displayNamePlaceholder')}
          error={errors.displayName}
          autoFocus
        />
        <Field
          label={t('auth.email')}
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder={t('auth.emailPlaceholder')}
          error={errors.email}
        />
        <Field
          label={t('auth.password')}
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder={t('auth.passwordPlaceholder')}
          error={errors.password}
        />
        <PasswordGuidance password={form.password} />
        <motion.button data-ui-motion
          whileHover={hoverLift(motionSafe && !loading)}
          whileTap={motionSafe && !loading ? { y: 0, transition: { duration: 0.15, ease: 'easeOut' } } : undefined}
          type="submit"
          className="btn-primary btn-block"
          disabled={loading}
          style={{ marginTop: '8px', fontSize: '15px', padding: '14px' }}
        >
          {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
        </motion.button>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          {t('auth.hasAccount')}{' '}
          <Link
            to="/login"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
          >
            {t('auth.signIn')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

// ─── Shared Auth Layout ──────────────────────────────────────────────────────
export function AuthLayout({ title, subtitle, children }) {
  const motionSafe = !useReducedMotion()
  return (
    <AppShell width="panel">
      <header className="form-header flex items-center justify-between">
        <Brand size="sm" />
        <LanguageSwitcher />
      </header>

      <main className="form-main flex min-h-[70vh] items-center justify-center">
        <motion.div data-ui-motion
          {...entrance(motionSafe, 0)}
          className="auth-card glass-card hairline-top w-full"
          style={{ padding: 'clamp(26px, 5vw, 40px)' }}
        >
          <h1
            className="font-racing font-extrabold tracking-tight"
            style={{ fontSize: 'clamp(26px, 5vw, 32px)', color: 'var(--text-primary)', marginBottom: '6px' }}
          >
            {title}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '30px' }}>
            {subtitle}
          </p>
          {children}
        </motion.div>
      </main>

      <Footer />
    </AppShell>
  )
}

// ─── Reusable Field ──────────────────────────────────────────────────────────
export function Field({ label, type = 'text', value, onChange, placeholder, error, autoFocus }) {
  // Generated rather than derived from `label`: labels are translated, so a
  // label-derived id would change on every language switch.
  const id = useId()

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <PasswordVisibility>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="input-field"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </PasswordVisibility>
      {error && (
        <FadeMessage id={`${id}-error`} className="field-error" role="alert">
          {error}
        </FadeMessage>
      )}
    </div>
  )
}
