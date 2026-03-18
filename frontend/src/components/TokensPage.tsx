import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import * as authApi from '../api/auth'
import type { ApiToken, ApiTokenCreated } from '../api/auth'

export function TokensPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [loading, setLoading] = useState(true)
  const [newTokenName, setNewTokenName] = useState('')
  const [createdToken, setCreatedToken] = useState<ApiTokenCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    authApi.getTokens().then(setTokens).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!newTokenName.trim()) return
    setCreating(true)
    try {
      const token = await authApi.createToken(newTokenName.trim())
      setCreatedToken(token)
      setNewTokenName('')
      setTokens((prev) => [...prev, { id: token.id, name: token.name, created_at: token.created_at, last_used_at: token.last_used_at }])
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    await authApi.deleteToken(id)
    setTokens((prev) => prev.filter((t) => t.id !== id))
    if (createdToken?.id === id) setCreatedToken(null)
  }

  const handleCopy = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">API Tokens</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create tokens for CLI access and integrations
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-sm px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Back to app
          </button>
        </div>

        {/* Create token */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h3 className="font-medium mb-3">Create new token</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Token name (e.g. CLI, Ring0 agent)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newTokenName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </div>

        {/* Newly created token banner */}
        {createdToken && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
              Token created — copy it now, it won't be shown again!
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded text-sm font-mono break-all">
                {createdToken.token}
              </code>
              <button
                onClick={handleCopy}
                className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors whitespace-nowrap"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-green-700 dark:text-green-300 mt-2">
              Use with: <code className="bg-green-100 dark:bg-green-800 px-1 rounded">checkm8 auth login --token {'<token>'}</code>
            </p>
          </div>
        )}

        {/* Token list */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-medium">Active tokens</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No API tokens yet
            </p>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {tokens.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Created {new Date(t.created_at).toLocaleDateString()}
                      {t.last_used_at && ` · Last used ${new Date(t.last_used_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User info */}
        <div className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
          Signed in as {user?.name} ({user?.email})
        </div>
      </div>
    </div>
  )
}
