import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTree } from '../hooks/useTree'
import { ListSidebar } from './ListSidebar'
import { TreeView } from './TreeView'
import { PresenceBar } from './PresenceBar'
import { ShareDialog } from './ShareDialog'
import { ToastContainer } from './Toast'
import * as listsApi from '../api/lists'
import type { TodoList } from '../types'

export function AppShell() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [selectedListId, setSelectedListId] = useState<string | null>(() => searchParams.get('list'))
  const [selectedList, setSelectedList] = useState<TodoList | null>(null)
  const [showShare, setShowShare] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const {
    nodes,
    visibleNodes,
    collapsed,
    focusedId,
    setFocusedId,
    presenceUserIds,
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
      listsApi.getList(selectedListId).then(setSelectedList).catch(() => setSelectedList(null))
    } else {
      setSelectedList(null)
    }
  }, [selectedListId])

  const [triggerNewList, setTriggerNewList] = useState(0)

  // Global keyboard shortcut: Ctrl+Shift+N to create new list
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'n') {
        e.preventDefault()
        setTriggerNewList((c) => c + 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isOwner = selectedList?.owner_id === user?.id

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Mobile sidebar toggle */}
      <button
        className="lg:hidden fixed top-3 left-3 z-40 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-md"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <div className={`${sidebarOpen ? '' : 'hidden'} lg:block`}>
        <ListSidebar
          selectedId={selectedListId}
          onSelect={(id) => { setSelectedListId(id); setSidebarOpen(false) }}
          triggerNew={triggerNewList}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedList ? (
          <>
            {/* List header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold truncate">{selectedList.title}</h2>
              <div className="flex items-center gap-3">
                <PresenceBar userIds={presenceUserIds} />
                <button
                  onClick={() => setShowShare(true)}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
              </div>
            </div>

            {/* Tree content */}
            <div className="flex-1 overflow-y-auto p-4">
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
                  onFocus={setFocusedId}
                  onToggleCollapse={toggleCollapse}
                  onUpdate={updateNode}
                  onDelete={removeNode}
                  onAddNode={addNode}
                  onMoveNode={moveNode}
                  onUndo={undo}
                  onRedo={redo}
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

      <ToastContainer />
    </div>
  )
}
