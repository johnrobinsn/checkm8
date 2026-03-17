import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { setToken } from '../api/client'
import { getMe } from '../api/auth'

export function AuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setError('No token received')
      return
    }

    // Store the token, then fetch user info
    setToken(token)
    getMe()
      .then((user) => {
        login(token, user)
        const redirect = localStorage.getItem('checkm8_redirect')
        localStorage.removeItem('checkm8_redirect')
        navigate(redirect || '/')
      })
      .catch((err) => {
        setError(err.message || 'Authentication failed')
      })
  }, [searchParams, login, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => navigate('/login')} className="px-4 py-2 bg-blue-500 text-white rounded-lg">
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
