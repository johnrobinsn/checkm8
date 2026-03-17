interface PresenceBarProps {
  userIds: string[]
}

export function PresenceBar({ userIds }: PresenceBarProps) {
  if (userIds.length === 0) return null

  return (
    <div className="flex items-center gap-1 px-2">
      {userIds.map((id) => (
        <div
          key={id}
          className="w-7 h-7 rounded-full bg-blue-500 dark:bg-blue-400 flex items-center justify-center text-white text-xs font-medium"
          title={id}
        >
          {id.slice(0, 2).toUpperCase()}
        </div>
      ))}
      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
        {userIds.length} online
      </span>
    </div>
  )
}
