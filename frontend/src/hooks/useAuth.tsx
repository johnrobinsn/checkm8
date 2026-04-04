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

function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem('checkm8_user')
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function setCachedUser(user: User | null) {
  try {
    if (user) localStorage.setItem('checkm8_user', JSON.stringify(user))
    else localStorage.removeItem('checkm8_user')
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken())
  const cachedUser = token ? getCachedUser() : null
  const [user, setUser] = useState<User | null>(cachedUser)
  // Skip loading spinner if we have a cached user + token
  const [loading, setLoading] = useState(!cachedUser && !!token)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setUser(null)
      setCachedUser(null)
      return
    }
    getMe()
      .then((u) => {
        setUser(u)
        setCachedUser(u)
      })
      .catch((err) => {
        // Only clear token on explicit 401 (handled by apiFetch).
        // Network errors / server downtime should not wipe credentials.
        if (err?.message === 'Unauthorized') {
          clearToken()
          setTokenState(null)
          setUser(null)
          setCachedUser(null)
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  const login = (newToken: string, newUser: User) => {
    setToken(newToken)
    setTokenState(newToken)
    setUser(newUser)
    setCachedUser(newUser)
  }

  const logout = () => {
    clearToken()
    setTokenState(null)
    setUser(null)
    setCachedUser(null)
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
