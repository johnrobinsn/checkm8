import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '../types'
import { getMe } from '../api/auth'
import { clearToken, getToken, setToken } from '../api/client'

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (token: string, user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(getToken())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch((err) => {
        // Only clear token on explicit 401 (handled by apiFetch).
        // Network errors / server downtime should not wipe credentials.
        if (err?.message === 'Unauthorized') {
          clearToken()
          setTokenState(null)
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  const login = (newToken: string, newUser: User) => {
    setToken(newToken)
    setTokenState(newToken)
    setUser(newUser)
  }

  const logout = () => {
    clearToken()
    setTokenState(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
