import { useEffect, useState, type KeyboardEvent } from 'react'
import type { TodoList } from '../types'
import * as listsApi from '../api/lists'
import { useAuth } from '../hooks/useAuth'

interface ListSidebarProps {
  selectedId: string | null
  onSelect: (id: string) => void
  triggerNew?: number
}

export function ListSidebar({ selectedId, onSelect, triggerNew }: ListSidebarProps) {
  const { user, logout } = useAuth()
  const [lists, setLists] = useState<TodoList[]>([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const fetchLists = async () => {
    const data = search
      ? await listsApi.getLists(false, search)
      : await listsApi.getLists()
    setLists(data)
  }

  useEffect(() => {
    fetchLists()
  }, [search])

  // Ctrl+Shift+N trigger from parent
  useEffect(() => {
    if (triggerNew) {
      setCreating(true)
      setNewTitle('')
    }
  }, [triggerNew])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    const list = await listsApi.createList(newTitle.trim())
    setNewTitle('')
    setCreating(false)
    await fetchLists()
    onSelect(list.id)
  }

  const handleCreateKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') { setCreating(false); setNewTitle('') }
  }

  const handleArchive = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await listsApi.archiveList(id)
    fetchLists()
  }

  return (
    <div className="w-64 h-screen bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">checkm8</h1>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
        {user && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-3">{user.email}</p>
        )}
        <input
          type="text"
          placeholder="Search lists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 dark:text-gray-300"
        />
      </div>

      {/* List items */}
      <div className="flex-1 overflow-y-auto p-2">
        {lists.map((list) => (
          <div
            key={list.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group text-sm
              ${selectedId === list.id
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            onClick={() => onSelect(list.id)}
          >
            <span className="flex-1 truncate">{list.title}</span>
            <button
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100"
              onClick={(e) => handleArchive(e, list.id)}
              title="Archive"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Create new list */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        {creating ? (
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleCreateKeyDown}
            onBlur={() => { if (!newTitle.trim()) setCreating(false) }}
            placeholder="List name..."
            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 dark:text-gray-300"
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New list
          </button>
        )}
      </div>
    </div>
  )
}
