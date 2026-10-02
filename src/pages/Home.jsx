import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Car } from '../components/Car'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080b14',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div className="bg-grid" style={{ position: 'absolute', inset: 0, opacity: 0.4 }} />

      {/* Radial glow */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(0,245,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '700px', padding: '0 24px' }}
      >
        {/* Cars row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '32px' }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.5 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
            >
              <Car colorIndex={i} state="racing" size={64} />
            </motion.div>
          ))}
        </motion.div>

        {/* Logo */}
        <h1
          className="gradient-text"
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 'clamp(56px, 10vw, 96px)',
            fontWeight: 900,
            lineHeight: 0.9,
            letterSpacing: '-0.02em',
            marginBottom: '16px',
          }}
        >
          TYPE<span style={{ opacity: 0.7 }}>RACING</span>
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: '18px',
          marginBottom: '48px',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.02em',
        }}>
          Competitive multiplayer typing tournaments. Race your way to the top.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="btn-primary"
            style={{ fontSize: '16px', padding: '14px 36px' }}
            onClick={() => navigate('/register')}
          >
            Get Started
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="btn-secondary"
            style={{ fontSize: '16px', padding: '14px 36px' }}
            onClick={() => navigate('/login')}
          >
            Sign In
          </motion.button>
        </div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '56px' }}
        >
          {['Real-time multiplayer', 'Tournament brackets', '4-error crash mechanic', 'Live leaderboards'].map((f) => (
            <span key={f} style={{
              padding: '6px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '999px',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: 'Inter, sans-serif',
            }}>
              {f}
            </span>
          ))}
        </motion.div>
      </motion.div>
    </div>
  )
}
