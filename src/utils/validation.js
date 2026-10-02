/**
 * Form validation.
 *
 * The rules are unchanged; only the wording is now injectable. Each function
 * takes the `t()` function from the i18n layer and returns the translated
 * message, so the checks stay pure while the copy follows the active locale.
 * `t` defaults to an identity function, which keeps the module usable from
 * tests or anywhere a translator is not available.
 */

const identity = (key) => key

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validatePassword(password, t = identity) {
  if (password.length < 6) return t('validation.passwordShort')
  return null
}

export function validateDisplayName(name, t = identity) {
  if (!name || name.trim().length < 2) return t('validation.displayNameShort')
  if (name.trim().length > 20) return t('validation.displayNameLong')
  return null
}

export function validateTournamentCode(code, t = identity) {
  const clean = code.trim().toUpperCase()
  if (!/^TR-[A-Z0-9]{4}$/.test(clean)) {
    return t('validation.codeFormat')
  }
  return null
}