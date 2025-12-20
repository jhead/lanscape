import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { checkAuthStatus, logoutUser } from '../utils/api'

interface AuthContextType {
  isAuthenticated: boolean
  username: string
  isHeadscaleOnboarded: boolean
  setAuthenticated: (value: boolean) => void
  setUsername: (value: string) => void
  setHeadscaleOnboarded: (value: boolean) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [isHeadscaleOnboarded, setHeadscaleOnboarded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function initAuth() {
      try {
        const authenticated = await checkAuthStatus()
        setAuthenticated(authenticated)
        if (authenticated) {
          setUsername('User') // Could fetch actual username from API
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
      setHeadscaleOnboarded(false)
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
        isHeadscaleOnboarded,
        setAuthenticated,
        setUsername,
        setHeadscaleOnboarded,
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
