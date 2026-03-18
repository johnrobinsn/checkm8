import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import type { TreeNode, NodeUpdate } from '../types'
import { getDueDateColor, getPriorityColor } from '../lib/tree'

interface NodeRowProps {
  node: TreeNode
  focused: boolean
  collapsed: boolean
  startEditing?: boolean
  onToggleCollapse: () => void
  onUpdate: (data: NodeUpdate) => void
  onFocus: () => void
  onDelete: () => void
  onEditingChange?: (editing: boolean) => void
}

export function NodeRow({
  node,
  focused,
  collapsed,
  startEditing: startEditingProp,
  onToggleCollapse,
  onUpdate,
  onFocus,
  onDelete,
  onEditingChange,
}: NodeRowProps) {
  const [editing, setEditingState] = useState(false)
  const [editText, setEditText] = useState(node.text)
  const committedRef = useRef(false)

  const setEditing = (value: boolean) => {
    setEditingState(value)
    onEditingChange?.(value)
  }

  // Allow parent to trigger edit mode
  useEffect(() => {
    if (startEditingProp && focused && !editing) {
      committedRef.current = false
      setEditing(true)
    }
  }, [startEditingProp, focused])
  const [showNotes, setShowNotes] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState(node.notes || '')
  const inputRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    if (editingNotes && notesRef.current) {
      notesRef.current.focus()
    }
  }, [editingNotes])

  useEffect(() => {
    if (!editing) {
      setEditText(node.text)
    }
    setNotesText(node.notes || '')
  }, [node.text, node.notes])

  const commitEdit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const textToSave = editText
    setEditing(false)
    if (textToSave !== node.text) {
      onUpdate({ text: textToSave })
    }
  }

  const commitNotes = () => {
    setEditingNotes(false)
    if (notesText !== (node.notes || '')) {
      onUpdate({ notes: notesText || null })
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    }
    if (e.key === 'Escape') {
      setEditText(node.text)
      setEditing(false)
    }
  }

  const hasChildren = node.children.length > 0
  // Smaller indent on mobile to prevent overflow
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const indent = node.depth * (isMobile ? 16 : 24)

  return (
    <div data-node-id={node.id}>
      <div
        className={`flex items-center gap-2 ${node.type === 'section' ? 'py-2 mt-3 first:mt-0' : 'py-1'} px-2 rounded group cursor-default select-none relative
          ${focused ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-400 dark:ring-blue-500 z-10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
          ${node.type === 'item' && node.checked ? 'opacity-60' : ''}
          ${node.type === 'section' && node.depth > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={onFocus}
        onDoubleClick={() => setEditing(true)}
        tabIndex={-1}
      >
        {/* Collapse/expand toggle */}
        <button
          className={`w-7 h-7 sm:w-5 sm:h-5 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 ${hasChildren ? '' : 'invisible'}`}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
          tabIndex={-1}
        >
          <svg className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 4l8 6-8 6V4z"/>
          </svg>
        </button>

        {/* Checkbox (items only) */}
        {node.type === 'item' && (
          <input
            type="checkbox"
            checked={node.checked}
            onChange={() => onUpdate({ checked: !node.checked })}
            className="w-5 h-5 sm:w-4 sm:h-4 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500 cursor-pointer flex-shrink-0"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Priority dot */}
        {node.priority && (
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getPriorityColor(node.priority)}`} title={node.priority} />
        )}

        {/* Text */}
        {editing ? (
          <input
            ref={inputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white text-sm p-0"
          />
        ) : (
          <span className={`flex-1 ${node.type === 'section' ? (node.depth === 0 ? 'text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400' : 'text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500') : 'text-sm text-gray-700 dark:text-gray-300'} ${node.checked ? 'line-through' : ''}`}>
            {node.text || <span className="text-gray-400 italic">untitled</span>}
          </span>
        )}

        {/* Due date */}
        {node.due_date && (
          <span className={`text-xs flex-shrink-0 ${getDueDateColor(node.due_date)}`}>
            {node.due_date}
          </span>
        )}

        {/* Notes toggle */}
        <button
          className={`p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 ${node.notes ? '!opacity-100' : ''}`}
          onClick={(e) => { e.stopPropagation(); setShowNotes(!showNotes) }}
          tabIndex={-1}
          title="Notes"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-3 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
          </svg>
        </button>

        {/* Delete */}
        <button
          className="p-1 text-gray-400 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          tabIndex={-1}
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>

      {/* Inline notes */}
      {showNotes && (
        <div style={{ paddingLeft: `${indent + 52}px` }} className="pb-1 overflow-hidden">
          {editingNotes ? (
            <textarea
              ref={notesRef}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              onBlur={commitNotes}
              onKeyDown={(e) => { if (e.key === 'Escape') { setNotesText(node.notes || ''); setEditingNotes(false) } }}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-sm text-gray-600 dark:text-gray-400 outline-none focus:ring-1 focus:ring-blue-400 resize-y min-h-[60px]"
              rows={3}
            />
          ) : (
            <div
              className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded p-2 cursor-text whitespace-pre-wrap min-h-[28px]"
              onClick={() => setEditingNotes(true)}
            >
              {node.notes || <span className="italic text-gray-400">Add a note...</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
