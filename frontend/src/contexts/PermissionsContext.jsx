import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { getCurrentAppUserProfile } from '../services/appUsers'

const PermissionsContext = createContext()

function detectPasswordRecoveryFromUrl() {
  if (typeof window === 'undefined') return false

  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

  return (
    search.get('type') === 'recovery' ||
    search.get('reset_password') === 'true' ||
    hash.get('type') === 'recovery'
  )
}

function getPasswordResetRedirectUrl() {
  const configuredRedirect =
    import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() ||
    import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL?.trim()

  const redirectUrl = configuredRedirect || `${window.location.origin}${window.location.pathname}`
  const url = new URL(redirectUrl, window.location.origin)

  url.searchParams.set('reset_password', 'true')

  return url.toString()
}

export function PermissionsProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(detectPasswordRecoveryFromUrl())

  async function loadCurrentUser() {
    setLoading(true)

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session) {
        setCurrentUser(null)
        setPermissions([])
        setLoading(false)
        return null
      }

      if (isPasswordRecovery) {
        setCurrentUser(null)
        setPermissions([])
        setLoading(false)
        return null
      }

      const profile = await getCurrentAppUserProfile()

      if (!profile) {
        await supabase.auth.signOut()
        setCurrentUser(null)
        setPermissions([])
        setAuthError('Your signed-in account is not linked to an active app user.')
        setLoading(false)
        return null
      }

      const permissionKeys = Array.isArray(profile.permissions)
        ? profile.permissions.filter(Boolean)
        : []

      setCurrentUser(profile)
      setPermissions(permissionKeys)
      setAuthError('')
      setLoading(false)
      return profile
    } catch (error) {
      console.error('Error loading signed-in user profile:', error)
      setCurrentUser(null)
      setPermissions([])
      setAuthError(error?.message || 'Unable to load your account profile.')
      setLoading(false)
      return null
    }
  }

  useEffect(() => {
    let isMounted = true

    const initialize = async () => {
      if (!isMounted) return
      await loadCurrentUser()
    }

    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return

      if (event === 'PASSWORD_RECOVERY') {
        setCurrentUser(null)
        setPermissions([])
        setAuthError('')
        setIsPasswordRecovery(true)
        setLoading(false)
        return
      }

      if (event === 'SIGNED_OUT' || !session) {
        setCurrentUser(null)
        setPermissions([])
        setIsPasswordRecovery(false)
        setLoading(false)
        return
      }

      setIsPasswordRecovery(false)

      window.setTimeout(() => {
        if (isMounted) {
          loadCurrentUser()
        }
      }, 0)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setLoading(true)
    setAuthError('')
    setIsPasswordRecovery(false)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setLoading(false)
      setAuthError(error.message)
      throw error
    }

    return loadCurrentUser()
  }

  async function signOut() {
    setLoading(true)

    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Error signing out from auth session:', error)
    } finally {
      setCurrentUser(null)
      setPermissions([])
      setIsPasswordRecovery(false)
      setLoading(false)
    }
  }

  async function requestPasswordReset(email) {
    const redirectTo = getPasswordResetRedirectUrl()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })

    if (error) {
      throw error
    }
  }

  async function completePasswordRecovery(newPassword) {
    setLoading(true)
    setAuthError('')

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw error
      }

      window.history.replaceState({}, document.title, window.location.pathname)
      await supabase.auth.signOut()
      setIsPasswordRecovery(false)
      setLoading(false)
    } catch (error) {
      setLoading(false)
      setAuthError(error?.message || 'Unable to update your password.')
      throw error
    }
  }

  function cancelPasswordRecovery() {
    window.history.replaceState({}, document.title, window.location.pathname)
    setIsPasswordRecovery(false)
    setAuthError('')
  }

  function clearAuthError() {
    setAuthError('')
  }

  function hasPermission(permissionKey) {
    return permissions.includes(permissionKey)
  }

  function hasAnyPermission(permissionKeys) {
    return permissionKeys.some((key) => permissions.includes(key))
  }

  function hasAllPermissions(permissionKeys) {
    return permissionKeys.every((key) => permissions.includes(key))
  }

  return (
    <PermissionsContext.Provider
      value={{
        currentUser,
        permissions,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        signIn,
        requestPasswordReset,
        completePasswordRecovery,
        cancelPasswordRecovery,
        signOut,
        loading,
        authError,
        clearAuthError,
        isPasswordRecovery,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const context = useContext(PermissionsContext)
  if (!context) {
    throw new Error('usePermissions must be used within PermissionsProvider')
  }
  return context
}
