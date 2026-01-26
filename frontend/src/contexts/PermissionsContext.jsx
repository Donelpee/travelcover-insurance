import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const PermissionsContext = createContext()

export function PermissionsProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // In a real app, you'd get this from authentication
    // For now, we'll simulate with a Super Admin
    loadUserPermissions()
  }, [])

  async function loadUserPermissions() {
    try {
      // TODO: Replace with actual logged-in user ID
      // For now, let's just get the first Super Admin user
      const { data: users } = await supabase
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
        .single()

      if (users) {
        setCurrentUser(users)
        
        // Extract permission keys
        const userPermissions = users.roles?.role_permissions?.map(
          rp => rp.permissions.permission_key
        ) || []
        
        setPermissions(userPermissions)
      }
      
      setLoading(false)
    } catch (error) {
      console.error('Error loading permissions:', error)
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

  return (
    <PermissionsContext.Provider value={{
      currentUser,
      permissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
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