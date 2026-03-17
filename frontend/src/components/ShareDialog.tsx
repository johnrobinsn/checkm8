import { useEffect, useState } from 'react'
import type { Permission, Share } from '../types'
import * as sharingApi from '../api/sharing'

interface ShareDialogProps {
  listId: string
  isOwner: boolean
  onClose: () => void
}

export function ShareDialog({ listId, isOwner, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<Share[]>([])
  const [permission, setPermission] = useState<Permission>('read')
  const [copied, setCopied] = useState(false)
  const [newShareToken, setNewShareToken] = useState<string | null>(null)

  useEffect(() => {
    sharingApi.getShares(listId).then(setShares)
  }, [listId])

  const handleCreateLink = async () => {
    const share = await sharingApi.createShare(listId, permission)
    setShares((prev) => [...prev, share])
    setNewShareToken(share.share_token)
  }

  const handleCopy = () => {
    if (!newShareToken) return
    const url = `${window.location.origin}/claim/${newShareToken}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRevoke = async (shareId: string) => {
    await sharingApi.revokeShare(listId, shareId)
    setShares((prev) => prev.filter((s) => s.id !== shareId))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Share List</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Generate new link */}
        {isOwner && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as Permission)}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 outline-none"
              >
                <option value="read">Can view</option>
                <option value="write">Can edit</option>
              </select>
              <button
                onClick={handleCreateLink}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create link
              </button>
            </div>

            {newShareToken && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <input
                  readOnly
                  value={`${window.location.origin}/claim/${newShareToken}`}
                  className="flex-1 bg-transparent text-sm text-gray-600 dark:text-gray-300 outline-none truncate"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Existing shares */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Shared with ({shares.length})
          </h3>
          {shares.length === 0 ? (
            <p className="text-sm text-gray-400">No shares yet</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {shares.map((share) => (
                <div key={share.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {share.user_id ? share.user_id.slice(0, 8) + '...' : 'Unclaimed'}
                    </span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${share.permission === 'write' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
                      {share.permission}
                    </span>
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRevoke(share.id)}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
