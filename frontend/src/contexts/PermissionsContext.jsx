import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'

const PermissionsContext = createContext()

export function PermissionsProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSignedOut, setIsSignedOut] = useState(false)
  const [cachedUser, setCachedUser] = useState(null)
  const [cachedPermissions, setCachedPermissions] = useState([])
  const skipNextAutoLoadRef = useRef(false)

  const CACHE_KEY = 'travelcover_cached_session'

  const FALLBACK_USER = {
    id: 'local-admin',
    full_name: 'Admin User',
    email: 'admin@travelcover.local',
    role: 'super_admin',
    roles: {
      role_name: 'super_admin',
      role_permissions: []
    }
  }

  useEffect(() => {
    // In a real app, you'd get this from authentication
    // For now, we'll simulate with a Super Admin
    if (skipNextAutoLoadRef.current) {
      skipNextAutoLoadRef.current = false
      return
    }

    if (!isSignedOut) {
      loadUserPermissions()
    }
  }, [isSignedOut])

  async function loadUserPermissions() {
    try {
      // TODO: Replace with actual logged-in user ID
      // For now, let's just get the first Super Admin user
      const { data: users, error: fetchError } = await supabase
        .from('app_users')
        .select(`
          *,
          roles (
            id,
            role_name,
            role_permissions (
              permissions (permission_key)
            )
          )
        `)
        .limit(1)

      if (fetchError) {
        throw fetchError
      }

      const user = Array.isArray(users) ? users[0] : null

      if (user) {
        setCurrentUser(user)
        
        // Extract permission keys
        const userPermissions = user.roles?.role_permissions?.map(
          rp => rp.permissions.permission_key
        ) || []
        
        setPermissions(userPermissions)
        setCachedUser(users)
        setCachedPermissions(userPermissions)

        localStorage.setItem(CACHE_KEY, JSON.stringify({
          user,
          permissions: userPermissions
        }))
      } else {
        setCurrentUser(FALLBACK_USER)
        setPermissions([])
        setCachedUser(FALLBACK_USER)
        setCachedPermissions([])
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          user: FALLBACK_USER,
          permissions: []
        }))
      }
      
      setLoading(false)
    } catch (error) {
      console.error('Error loading permissions:', error)
      setCurrentUser(FALLBACK_USER)
      setPermissions([])
      setCachedUser(FALLBACK_USER)
      setCachedPermissions([])
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        user: FALLBACK_USER,
        permissions: []
      }))
      setLoading(false)
    }
  }

  function hasPermission(permissionKey) {
    return permissions.includes(permissionKey)
  }

  function hasAnyPermission(permissionKeys) {
    return permissionKeys.some(key => permissions.includes(key))
  }

  function hasAllPermissions(permissionKeys) {
    return permissionKeys.every(key => permissions.includes(key))
  }

  async function signOut() {
    if (currentUser) {
      setCachedUser(currentUser)
      setCachedPermissions(permissions)

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        user: currentUser,
        permissions
      }))
    }

    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error signing out from auth session:', error)
    }

    setCurrentUser(null)
    setPermissions([])
    setIsSignedOut(true)
  }

  async function signInAgain() {
    if (cachedUser) {
      setCurrentUser(cachedUser)
      setPermissions(cachedPermissions)
      skipNextAutoLoadRef.current = true
      setIsSignedOut(false)
      return
    }

    const persistedCache = localStorage.getItem(CACHE_KEY)
    if (persistedCache) {
      try {
        const parsed = JSON.parse(persistedCache)
        if (parsed?.user) {
          setCachedUser(parsed.user)
          setCachedPermissions(parsed.permissions || [])
          setCurrentUser(parsed.user)
          setPermissions(parsed.permissions || [])
          skipNextAutoLoadRef.current = true
          setIsSignedOut(false)
          return
        }
      } catch (error) {
        console.error('Failed to parse cached session:', error)
      }
    }

    setIsSignedOut(false)
  }

  return (
    <PermissionsContext.Provider value={{
      currentUser,
      permissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      signOut,
      signInAgain,
      loading
    }}>
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