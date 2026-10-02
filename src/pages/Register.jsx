import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { validateEmail, validatePassword, validateDisplayName } from '../utils/validation'
import toast from 'react-hot-toast'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    const dnErr = validateDisplayName(form.displayName)
    if (dnErr) e.displayName = dnErr
    if (!validateEmail(form.email)) e.email = 'Enter a valid email address.'
    const pwErr = validatePassword(form.password)
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
      toast.success('Account created! Welcome to TypeRacing.')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create Account" subtitle="Join the race. Sign up to compete.">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Field
          label="Display Name"
          value={form.displayName}
          onChange={(v) => setForm((f) => ({ ...f, displayName: v }))}
          placeholder="RacerX"
          error={errors.displayName}
          autoFocus
        />
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder="you@email.com"
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder="••••••••"
          error={errors.password}
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ marginTop: '8px', fontSize: '15px', padding: '14px', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </motion.button>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#00f5ff', textDecoration: 'none', fontWeight: 600 }}>
            Sign In
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

// ─── Shared Auth Layout ──────────────────────────────────────────────────────
export function AuthLayout({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#080b14',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
    }}>
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} />
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card"
        style={{ width: '100%', maxWidth: '440px', padding: '40px', position: 'relative', zIndex: 1 }}
      >
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '22px',
            fontWeight: 900,
            marginBottom: '32px',
          }}
            className="gradient-text"
          >
            TYPERACER
          </div>
        </Link>
        <h1 style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '32px',
          fontWeight: 800,
          color: 'white',
          marginBottom: '6px',
        }}>
          {title}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '32px' }}>
          {subtitle}
        </p>
        {children}
      </motion.div>
    </div>
  )
}

// ─── Reusable Field ──────────────────────────────────────────────────────────
export function Field({ label, type = 'text', value, onChange, placeholder, error, autoFocus }) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: '8px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        fontFamily: 'Inter, sans-serif',
      }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input-field"
        style={error ? { borderColor: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.1)' } : {}}
      />
      {error && (
        <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px', fontFamily: 'Inter, sans-serif' }}>
          {error}
        </p>
      )}
    </div>
  )
}
