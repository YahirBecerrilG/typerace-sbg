import { useState, useEffect, useContext, createContext, useCallback } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId, userObj = null) => {
    let { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    // Resilient fallback: If profile was not found yet, ensure it is created using user metadata
    if (!data && userObj) {
      const fallbackName = userObj.user_metadata?.display_name || userObj.email?.split('@')[0] || 'Racer'
      const fallbackAvatar = userObj.user_metadata?.avatar_url || '🏎️'
      const { data: created } = await supabase
        .from('profiles')
        .upsert({ id: userId, display_name: fallbackName, avatar_url: fallbackAvatar }, { onConflict: 'id' })
        .select('*')
        .maybeSingle()
      if (created) data = created
    }

    setProfile(data)
  }, [])

  useEffect(() => {
    let active = true

    // Resolve the REAL session before any private route is allowed to render.
    // The catch is what matters for routing: if the session cannot be read we
    // must end in a definite "no user" state, otherwise PrivateRoute would spin
    // forever instead of redirecting to /login.
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return
        setUser(session?.user ?? null)
        if (session?.user) await fetchProfile(session.user.id, session.user)
        if (active) setLoading(false)
      })
      .catch((err) => {
        console.error('Could not read the Supabase session:', err)
        if (!active) return
        setUser(null)
        setProfile(null)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!active) return
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id, session.user)
        } else {
          setProfile(null)
        }
        // Every auth transition (sign in, sign out, token refresh) settles the
        // session, so the guard never stays stuck on the loading screen.
        setLoading(false)
      }
    )

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const register = async ({ email, password, displayName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    })
    if (error) throw error
    return data
  }

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const refreshProfile = () => {
    if (user) fetchProfile(user.id, user)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, register, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
