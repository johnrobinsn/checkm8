import { useState, useEffect, useRef } from 'react'
import type { TreeNode, NodeUpdate, Priority } from '../types'

interface ItemDetailPanelProps {
  node: TreeNode
  onUpdate: (data: NodeUpdate) => void
  onDelete: () => void
  onClose: () => void
}

const PRIORITIES: { value: Priority | null; label: string; color: string }[] = [
  { value: null, label: 'None', color: 'bg-gray-200 dark:bg-gray-600' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'high', label: 'High', color: 'bg-red-500' },
]

export function ItemDetailPanel({ node, onUpdate, onDelete, onClose }: ItemDetailPanelProps) {
  const [text, setText] = useState(node.text)
  const [notes, setNotes] = useState(node.notes || '')
  const [priority, setPriority] = useState<Priority | null>(node.priority)
  const [dueDate, setDueDate] = useState(node.due_date || '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // Sync from prop changes (e.g. real-time updates)
  useEffect(() => {
    setText(node.text)
    setNotes(node.notes || '')
    setPriority(node.priority)
    setDueDate(node.due_date || '')
  }, [node.text, node.notes, node.priority, node.due_date])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const commitText = () => {
    if (text !== node.text) onUpdate({ text })
  }

  const commitNotes = () => {
    const val = notes || null
    if (val !== (node.notes || null)) onUpdate({ notes: val })
  }

  const handlePriority = (p: Priority | null) => {
    setPriority(p)
    onUpdate({ priority: p })
  }

  const handleDueDate = (d: string) => {
    setDueDate(d)
    onUpdate({ due_date: d || null })
  }

  const handleDelete = () => {
    onDelete()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[60] transition-opacity"
        onClick={onClose}
        onTouchEnd={(e) => { e.stopPropagation(); onClose() }}
      />

      {/* Panel — stopPropagation prevents dnd-kit TouchSensor from intercepting */}
      <div
        ref={panelRef}
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto sm:max-w-lg sm:mx-auto sm:bottom-4 sm:left-4 sm:right-4 sm:rounded-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Drag handle indicator */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Item Details
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Item text */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
          </div>

          {/* Checked status */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
            <button
              onClick={() => onUpdate({ checked: !node.checked })}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                node.checked
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {node.checked ? 'Completed' : 'Not done'}
            </button>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Priority</label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.label}
                  onClick={() => handlePriority(p.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    priority === p.value
                      ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Due date</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => handleDueDate(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
              />
              {dueDate && (
                <button
                  onClick={() => handleDueDate('')}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</label>
            <textarea
              ref={notesRef}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={commitNotes}
              placeholder="Add notes..."
              rows={4}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white resize-y min-h-[80px] placeholder-gray-400"
            />
          </div>

          {/* Metadata */}
          <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5 pt-1 border-t border-gray-100 dark:border-gray-800">
            <p>Created: {new Date(node.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(node.updated_at).toLocaleString()}</p>
            <p className="font-mono">ID: {node.id}</p>
          </div>

          {/* Delete */}
          <div className="pt-2">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500">Delete this item?</span>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-red-400 hover:text-red-500 transition-colors"
              >
                Delete item...
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
