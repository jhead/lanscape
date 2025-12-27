import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { checkAuthStatus, logoutUser, getCurrentUser } from '../utils/api'

interface AuthContextType {
  isAuthenticated: boolean
  username: string
  setAuthenticated: (value: boolean) => void
  setUsername: (value: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function initAuth() {
      try {
        const authenticated = await checkAuthStatus()
        setAuthenticated(authenticated)
        if (authenticated) {
          // Fetch actual username from API
          try {
            const userInfo = await getCurrentUser()
            setUsername(userInfo.user_handle || 'User')
          } catch {
            setUsername('User')
          }
        }
      } catch (error) {
        console.error('Error checking auth status:', error)
      } finally {
        setLoading(false)
      }
    }
    initAuth()
  }, [])

  const logout = async () => {
    try {
      // Call the logout endpoint to clear the JWT cookie on the server
      await logoutUser()
      console.log('[Auth] Logout successful')
    } catch (error) {
      console.error('[Auth] Logout error:', error)
      // Continue with local state cleanup even if API call fails
    } finally {
      // Clear local state regardless of API call result
      setAuthenticated(false)
      setUsername('')
    }
  }

  if (loading) {
    return <div className="container">Loading...</div>
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        username,
        setAuthenticated,
        setUsername,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
