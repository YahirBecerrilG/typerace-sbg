export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validatePassword(password) {
  if (password.length < 6) return 'Password must be at least 6 characters.'
  return null
}

export function validateDisplayName(name) {
  if (!name || name.trim().length < 2) return 'Display name must be at least 2 characters.'
  if (name.trim().length > 20) return 'Display name must be 20 characters or less.'
  return null
}

export function validateTournamentCode(code) {
  const clean = code.trim().toUpperCase()
  if (!/^TR-[A-Z0-9]{4}$/.test(clean)) {
    return 'Invalid code format. Expected: TR-XXXX'
  }
  return null
}
