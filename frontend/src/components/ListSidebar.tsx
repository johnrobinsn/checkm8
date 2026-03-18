import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TodoList } from '../types'
import * as listsApi from '../api/lists'
import { useAuth } from '../hooks/useAuth'
import { useGlobalWebSocket } from '../hooks/useGlobalWebSocket'

interface ListSidebarProps {
  selectedId: string | null
  onSelect: (id: string, focusNodeId?: string) => void
  triggerNew?: number
}

export function ListSidebar({ selectedId, onSelect, triggerNew }: ListSidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState<TodoList[]>([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const listContainerRef = useRef<HTMLDivElement>(null)

  const fetchLists = async () => {
    const data = search
      ? await listsApi.getLists(false, search)
      : await listsApi.getLists()
    setLists(data)
    setHighlightIdx(-1)
  }

  useEffect(() => {
    fetchLists()
  }, [search])

  // Auto-refresh sidebar when list-level events arrive via global WebSocket
  useGlobalWebSocket(useCallback(() => {
    fetchLists()
  }, [search]))

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

  const handleSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (lists.length > 0) {
        setHighlightIdx(0)
      }
    } else if (e.key === 'Escape') {
      setSearch('')
    }
  }

  const handleListKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, lists.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => {
        if (i <= 0) {
          // Focus back to search input
          const input = listContainerRef.current?.parentElement?.querySelector<HTMLInputElement>('input[type="text"]')
          input?.focus()
          return -1
        }
        return i - 1
      })
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < lists.length) {
      const list = lists[highlightIdx]
      const firstMatch = list.matching_nodes?.[0]
      onSelect(list.id, firstMatch?.id)
      setSearch('')
    } else if (e.key === 'Escape') {
      setSearch('')
      setHighlightIdx(-1)
    }
  }

  // Focus the list container when highlight changes
  useEffect(() => {
    if (highlightIdx >= 0) {
      listContainerRef.current?.focus()
    }
  }, [highlightIdx])

  return (
    <div className="w-72 sm:w-64 h-dvh bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="10" fill="#2563eb"/>
              <path d="M13 25 l6 6 L35 15" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="16" y="35" width="16" height="3" rx="1" fill="rgba(255,255,255,0.5)"/>
              <rect x="18" y="32" width="12" height="3" rx="1" fill="rgba(255,255,255,0.35)"/>
            </svg>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">checkm8</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/settings/tokens')}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="API Tokens"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </button>
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
        </div>
        {user && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-3">{user.email}</p>
        )}
        <div className="relative">
          <input
            type="text"
            id="sidebar-search"
            placeholder="Search lists & items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 text-gray-700 dark:text-gray-300 pr-7"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setHighlightIdx(-1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              tabIndex={-1}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* List items */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto p-2 outline-none"
        tabIndex={-1}
        onKeyDown={handleListKeyDown}
      >
        {lists.map((list, idx) => (
          <div key={list.id}>
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group text-sm
                ${selectedId === list.id
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : idx === highlightIdx
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              onClick={() => {
                const firstMatch = list.matching_nodes?.[0]
                onSelect(list.id, firstMatch?.id)
                if (search) { setSearch(''); setHighlightIdx(-1) }
              }}
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
            {search && list.matching_nodes && list.matching_nodes.length > 0 && (
              <div className="ml-6 mb-1">
                {list.matching_nodes.map((node) => (
                  <div
                    key={node.id}
                    className="text-xs text-gray-400 dark:text-gray-500 py-0.5 truncate cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
                    onClick={() => { onSelect(list.id, node.id); setSearch(''); setHighlightIdx(-1) }}
                  >
                    <span className="text-gray-300 dark:text-gray-600 mr-1">{node.type === 'section' ? '§' : '•'}</span>
                    {node.text || (node.notes ? `(note: ${node.notes.slice(0, 40)})` : 'untitled')}
                  </div>
                ))}
              </div>
            )}
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
