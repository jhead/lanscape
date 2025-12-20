import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { checkAuthStatus } from '../utils/api'

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

  const logout = () => {
    // Clear the JWT cookie by setting it to expire
    document.cookie = 'jwt=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    setAuthenticated(false)
    setUsername('')
    setHeadscaleOnboarded(false)
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
