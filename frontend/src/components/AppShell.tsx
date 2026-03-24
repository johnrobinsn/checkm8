import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTree } from '../hooks/useTree'
import { useVisualViewport } from '../hooks/useVisualViewport'
import { ListSidebar } from './ListSidebar'
import { TreeView } from './TreeView'
import { PresenceBar } from './PresenceBar'
import { ShareDialog } from './ShareDialog'
import { ListSettingsDialog } from './ListSettingsDialog'
import { ToastContainer } from './Toast'
import * as listsApi from '../api/lists'
import type { TodoList } from '../types'

export function AppShell() {
  useVisualViewport()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [selectedListId, setSelectedListId] = useState<string | null>(
    () => searchParams.get('list') || localStorage.getItem('checkm8_last_list')
  )
  const [selectedList, setSelectedList] = useState<TodoList | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // On mobile, start with sidebar closed if we have a saved list to show
    const isMobile = window.innerWidth < 1024 // lg breakpoint
    const hasSavedList = !!(searchParams.get('list') || localStorage.getItem('checkm8_last_list'))
    return isMobile ? !hasSavedList : true
  })

  const {
    nodes,
    visibleNodes,
    collapsed,
    focusedId,
    setFocusedId,
    presenceUsers,
    loading,
    toggleCollapse,
    addNode,
    updateNode,
    moveNode,
    removeNode,
    undo,
    redo,
  } = useTree(selectedListId)

  useEffect(() => {
    if (selectedListId) {
      localStorage.setItem('checkm8_last_list', selectedListId)
      listsApi.getList(selectedListId).then(setSelectedList).catch(() => {
        setSelectedList(null)
        setSelectedListId(null)
        localStorage.removeItem('checkm8_last_list')
        // Saved list gone — open sidebar so user can pick another
        setSidebarOpen(true)
      })
    } else {
      setSelectedList(null)
    }
  }, [selectedListId])

  const [triggerNewList, setTriggerNewList] = useState(0)

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      console.log('global keydown', e.key, e.code, 'ctrl:', e.ctrlKey, 'alt:', e.altKey, 'meta:', e.metaKey)
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'n') {
        e.preventDefault()
        setTriggerNewList((c) => c + 1)
      }
      // Ctrl+Alt+L or / (when not in an input) to focus search
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        document.getElementById('sidebar-search')?.focus()
        if (!sidebarOpen) setSidebarOpen(true)
      } else if (e.key === '/' && !isInput) {
        e.preventDefault()
        document.getElementById('sidebar-search')?.focus()
        if (!sidebarOpen) setSidebarOpen(true)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [sidebarOpen])

  const isOwner = selectedList?.owner_id === user?.id

  // Build breadcrumb trail from focused node to root
  const breadcrumbs = (() => {
    const crumbs: { id: string | null; label: string }[] = []
    if (!selectedList) return crumbs
    // Walk up from focused node to build ancestor chain
    if (focusedId) {
      let currentId: string | null = focusedId
      const nodeMap = new Map(nodes.map((n) => [n.id, n]))
      while (currentId) {
        const n = nodeMap.get(currentId)
        if (!n) break
        // Only include sections in breadcrumb, not items
        if (n.type === 'section') {
          crumbs.unshift({ id: n.id, label: n.text || 'Untitled' })
        }
        currentId = n.parent_id
      }
    }
    // Prepend list name
    crumbs.unshift({ id: null, label: selectedList.title })
    return crumbs
  })()

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase()
    return visibleNodes.filter((n) => n.text.toLowerCase().includes(term)).map((n) => n.id)
  }, [visibleNodes, searchTerm])

  // Focus first match when search term changes
  useEffect(() => {
    if (searchMatches.length > 0) {
      setSearchIndex(0)
      setFocusedId(searchMatches[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  const searchNext = useCallback(() => {
    if (searchMatches.length === 0) return
    const next = (searchIndex + 1) % searchMatches.length
    setSearchIndex(next)
    setFocusedId(searchMatches[next])
  }, [searchMatches, searchIndex, setFocusedId])

  const searchPrev = useCallback(() => {
    if (searchMatches.length === 0) return
    const prev = (searchIndex - 1 + searchMatches.length) % searchMatches.length
    setSearchIndex(prev)
    setFocusedId(searchMatches[prev])
  }, [searchMatches, searchIndex, setFocusedId])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchTerm('')
    setSearchIndex(0)
  }, [])

  // Settings dialog state
  const [settingsOpen, setSettingsOpen] = useState(false)


  // FAB state
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const fabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fabLongPressedRef = useRef(false)

  const addSectionWithPrompt = useCallback(() => {
    const name = prompt('Section name:')
    if (!name?.trim()) return
    addNode({ type: 'section', text: name.trim() })
  }, [addNode])

  const addNodeContextAware = useCallback((type: 'item' | 'section') => {
    if (type === 'section') {
      addSectionWithPrompt()
      return
    }
    const focusedNode = focusedId ? nodes.find((n) => n.id === focusedId) : null
    if (focusedNode) {
      if (focusedNode.type === 'section') {
        addNode({ type, text: '', parent_id: focusedNode.id, at_beginning: true })
      } else {
        addNode({ type, text: '', parent_id: focusedNode.parent_id, after_id: focusedNode.id })
      }
    } else {
      addNode({ type, text: '' })
    }
  }, [focusedId, nodes, addNode, addSectionWithPrompt])

  return (
    <div className="flex overflow-hidden bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100" style={{ height: 'var(--viewport-height, 100dvh)' }}>
      {/* Sidebar - overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-30' : 'hidden'} lg:relative lg:block`}>
        <ListSidebar
          selectedId={selectedListId}
          onSelect={(id, focusNodeId) => { setSelectedListId(id); setSidebarOpen(false); if (focusNodeId) setFocusedId(focusNodeId) }}
          triggerNew={triggerNewList}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedList ? (
          <>
            {/* App bar with integrated breadcrumbs */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <button
                  className={`lg:hidden p-1.5 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${sidebarOpen ? 'hidden' : ''}`}
                  onClick={() => setSidebarOpen(true)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <nav className="flex items-center min-w-0 text-base font-semibold">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={crumb.id ?? 'root'} className="flex items-center min-w-0">
                      {i > 0 && (
                        <svg className="w-4 h-4 mx-0.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      {i === breadcrumbs.length - 1 ? (
                        <span className="truncate">{crumb.label}</span>
                      ) : (
                        <button
                          className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 truncate transition-colors"
                          onClick={() => { if (crumb.id) setFocusedId(crumb.id); else setFocusedId(null) }}
                        >
                          {crumb.label}
                        </button>
                      )}
                    </span>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <PresenceBar users={presenceUsers} />
                <button
                  onClick={() => { setSearchOpen((v) => !v); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50) }}
                  className={`p-1 rounded-lg transition-colors ${searchOpen ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                  title="Search"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
                {isOwner && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="List settings"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                )}
                <button
                  onClick={() => setShowShare(true)}
                  className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>
            </div>

            {/* Search panel */}
            {searchOpen && (
              <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); searchNext() }
                    if (e.key === 'Escape') { e.preventDefault(); closeSearch() }
                  }}
                />
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                  {searchTerm.trim() ? `${searchMatches.length > 0 ? searchIndex + 1 : 0} / ${searchMatches.length}` : ''}
                </span>
                <button onClick={searchPrev} disabled={searchMatches.length === 0} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" title="Previous">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <button onClick={searchNext} disabled={searchMatches.length === 0} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30" title="Next">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <button onClick={closeSearch} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Close">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}


            {/* Tree content */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <TreeView
                  visibleNodes={visibleNodes}
                  nodes={nodes}
                  collapsed={collapsed}
                  focusedId={focusedId}
                  currentListId={selectedListId ?? undefined}
                  onFocus={setFocusedId}
                  onToggleCollapse={toggleCollapse}
                  onUpdate={updateNode}
                  onDelete={removeNode}
                  onAddNode={addNode}
                  onMoveNode={moveNode}
                  onUndo={undo}
                  onRedo={redo}
                  onNavigateToSection={(listId, sectionId) => {
                    setSelectedListId(listId)
                    setFocusedId(sectionId)
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <h2 className="text-xl mb-2">Select a list</h2>
              <p className="text-sm">or create a new one from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {/* Share dialog */}
      {showShare && selectedListId && (
        <ShareDialog
          listId={selectedListId}
          isOwner={isOwner}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Settings dialog */}
      {settingsOpen && selectedListId && (
        <ListSettingsDialog
          listId={selectedListId}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Floating Action Button */}
      {selectedList && (
        <>
          {fabMenuOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setFabMenuOpen(false)} />
          )}
          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {fabMenuOpen && (
              <div className="mb-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  className="w-full px-4 py-3 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                  onClick={() => { addNodeContextAware('item'); setFabMenuOpen(false) }}
                >
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add item
                </button>
                <button
                  className="w-full px-4 py-3 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 transition-colors"
                  onClick={() => { addNodeContextAware('section'); setFabMenuOpen(false) }}
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16" />
                  </svg>
                  Add section
                </button>
              </div>
            )}
            <button
              className="w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-all select-none"
              onPointerDown={() => {
                fabLongPressedRef.current = false
                fabTimerRef.current = setTimeout(() => {
                  fabLongPressedRef.current = true
                  setFabMenuOpen(true)
                }, 500)
              }}
              onPointerUp={() => {
                if (fabTimerRef.current) {
                  clearTimeout(fabTimerRef.current)
                  fabTimerRef.current = null
                }
                if (!fabLongPressedRef.current && !fabMenuOpen) {
                  addNodeContextAware('item')
                }
                fabLongPressedRef.current = false
              }}
              onPointerLeave={() => {
                if (fabTimerRef.current) {
                  clearTimeout(fabTimerRef.current)
                  fabTimerRef.current = null
                }
              }}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </>
      )}

      <ToastContainer />
    </div>
  )
}
