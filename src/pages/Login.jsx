import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AuthLayout, Field } from './Register'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login({ email: form.email, password: form.password })
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to continue your journey.">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => setForm((f) => ({ ...f, email: v }))}
          placeholder="you@email.com"
          autoFocus
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder="••••••••"
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ marginTop: '8px', fontSize: '15px', padding: '14px', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </motion.button>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#00f5ff', textDecoration: 'none', fontWeight: 600 }}>
            Create one
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
