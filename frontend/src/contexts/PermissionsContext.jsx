import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { getCurrentAppUserProfile } from '../services/appUsers'

const PermissionsContext = createContext()

export function PermissionsProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

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

      if (event === 'SIGNED_OUT' || !session) {
        setCurrentUser(null)
        setPermissions([])
        setLoading(false)
        return
      }

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
      setLoading(false)
    }
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
        signOut,
        loading,
        authError,
        clearAuthError,
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
