import { useAuth } from '../hooks/useAuth'
import type { PresenceUser } from '../types'

interface PresenceBarProps {
  users: PresenceUser[]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const COLORS = [
  'bg-emerald-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500',
]

function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function PresenceBar({ users }: PresenceBarProps) {
  const { user: currentUser } = useAuth()
  const others = users.filter((u) => u.id !== currentUser?.id)

  if (others.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {others.map((u) => (
        <div key={u.id} className="relative group">
          {u.avatar_url ? (
            <img
              src={u.avatar_url}
              alt={u.name}
              className="w-7 h-7 rounded-full ring-2 ring-white dark:ring-gray-800"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className={`w-7 h-7 rounded-full ${colorForId(u.id)} ring-2 ring-white dark:ring-gray-800 flex items-center justify-center text-white text-xs font-medium`}
            >
              {getInitials(u.name || '??')}
            </div>
          )}
          {/* Tooltip */}
          <div className="absolute top-full right-0 mt-1.5 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {u.name || 'Unknown'}
          </div>
        </div>
      ))}
    </div>
  )
}
