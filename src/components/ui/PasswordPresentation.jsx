import { motion, useReducedMotion } from 'framer-motion'
import { FadeMessage, fade } from './PresentationMotion'
import { cloneElement, useId, useState } from 'react'
import { CheckCircle2, Circle, Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../../i18n'

// Copy belongs only to these new presentation controls; existing dictionaries
// and authentication validation are deliberately left unchanged.
const AnimatedCheck = motion.create(CheckCircle2)
const AnimatedCircle = motion.create(Circle)

const COPY = {
  es: {
    show: 'Mostrar contraseña', hide: 'Ocultar contraseña',
    confirm: 'Confirmar contraseña', mismatch: 'Las contraseñas no coinciden.',
    match: 'Las contraseñas coinciden.', title: 'Guía de contraseña segura',
    note: 'Estas recomendaciones son informativas.',
    met: 'Cumplido', pending: 'Pendiente',
    rules: ['Mínimo 8 caracteres', 'Una letra mayúscula', 'Una letra minúscula', 'Un número', 'Un símbolo'],
  },
  en: {
    show: 'Show password', hide: 'Hide password',
    confirm: 'Confirm password', mismatch: 'Passwords do not match.',
    match: 'Passwords match.', title: 'Secure password guide',
    note: 'These recommendations are informational.',
    met: 'Met', pending: 'Pending',
    rules: ['At least 8 characters', 'One uppercase letter', 'One lowercase letter', 'One number', 'One symbol'],
  },
}

// Preserve the original input's id, name, value, onChange and all other props.
// The button changes only its display type; it never submits the form.
export function PasswordVisibility({ children }) {
  const [visible, setVisible] = useState(false)
  const { locale } = useI18n()
  const copy = COPY[locale] || COPY.en

  if (children.props.type !== 'password') return children

  return (
    <div className="password-input-wrap">
      {cloneElement(children, { type: visible ? 'text' : 'password' })}
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? copy.hide : copy.show}
        aria-pressed={visible}
        aria-controls={children.props.id}
      >
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  )
}

// This local confirmation is intentionally unnamed and has no constraints:
// it never enters the form payload or changes submission eligibility.
export function PasswordGuidance({ password }) {
  const motionSafe = !useReducedMotion()
  const [confirmation, setConfirmation] = useState('')
  const id = useId()
  const { locale } = useI18n()
  const copy = COPY[locale] || COPY.en
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password), /[^\p{L}\p{N}\s]/u.test(password)]
  const mismatch = confirmation.length > 0 && confirmation !== password

  return (
    <>
      <div className="password-checklist">
        <p className="password-checklist-title">{copy.title}</p>
        <ul>
          {copy.rules.map((rule, index) => (
            <li key={rule} className="password-rule" data-met={checks[index]}>
              {checks[index] ? <AnimatedCheck key="met" {...fade(motionSafe)} size={15} aria-hidden="true" /> : <AnimatedCircle key="pending" {...fade(motionSafe)} size={15} aria-hidden="true" />}
              <motion.span key={checks[index] ? 'met' : 'pending'} {...fade(motionSafe)}>{rule}<span className="sr-only"> — {checks[index] ? copy.met : copy.pending}</span></motion.span>
            </li>
          ))}
        </ul>
        <FadeMessage className="form-help">{copy.note}</FadeMessage>
      </div>
      <div>
        <label className="field-label" htmlFor={id}>{copy.confirm}</label>
        <PasswordVisibility>
          <input
            id={id}
            type="password"
            className="input-field"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            aria-invalid={mismatch ? 'true' : undefined}
            aria-describedby={confirmation ? `${id}-feedback` : undefined}
          />
        </PasswordVisibility>
        <div aria-live="polite" aria-atomic="true">
          {confirmation && (
            <FadeMessage key={mismatch ? 'mismatch' : 'match'} id={`${id}-feedback`} className={mismatch ? 'field-error' : 'password-match'}>
              {mismatch ? copy.mismatch : copy.match}
            </FadeMessage>
          )}
        </div>
      </div>
    </>
  )
}
