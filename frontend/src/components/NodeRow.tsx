import { useState, useRef, useEffect, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { TreeNode, NodeUpdate, NodeCreate, SectionSearchResult } from '../types'
import { getDueDateColor, getPriorityColor } from '../lib/tree'
import { parseLinks, hasLinks } from '../lib/parseLinks'
import { resolveSection } from '../api/nodes'
import { SectionAutocomplete } from './SectionAutocomplete'

interface NodeRowProps {
  node: TreeNode
  focused: boolean
  collapsed: boolean
  startEditing?: boolean
  currentListId?: string
  onToggleCollapse: () => void
  onUpdate: (data: NodeUpdate) => void
  onFocus: () => void
  onDelete: () => void
  onEditingChange?: (editing: boolean) => void
  onNavigateToSection?: (listId: string, sectionId: string) => void
  onOpenDetail?: () => void
  onPaste?: (data: NodeCreate) => void
}

export function NodeRow({
  node,
  focused,
  collapsed,
  startEditing: startEditingProp,
  currentListId,
  onToggleCollapse,
  onUpdate,
  onFocus,
  onDelete,
  onEditingChange,
  onNavigateToSection,
  onOpenDetail,
  onPaste,
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

  // Autocomplete state
  const [acQuery, setAcQuery] = useState('')
  const [acActive, setAcActive] = useState(false)
  const [acAnchor, setAcAnchor] = useState<{ top: number; left: number; height: number } | null>(null)
  const acStartPos = useRef<number>(-1)

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
      setAcActive(false)
    }
    setNotesText(node.notes || '')
  }, [node.text, node.notes])

  const commitEdit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const textToSave = editText
    setEditing(false)
    setAcActive(false)
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
    // Let autocomplete handle these keys when active
    if (acActive && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) {
      return // SectionAutocomplete's global handler will catch these
    }
    if (acActive && e.key === 'Enter') {
      return // autocomplete handles Enter
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    }
    if (e.key === 'Escape') {
      setEditText(node.text)
      setEditing(false)
      setAcActive(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const cursor = e.target.selectionStart ?? val.length
    setEditText(val)

    // Check for [[ trigger
    const textBefore = val.slice(0, cursor)
    const openIdx = textBefore.lastIndexOf('[[')
    const closeIdx = textBefore.lastIndexOf(']]')

    if (openIdx >= 0 && openIdx > closeIdx) {
      // We're inside a [[ ... sequence
      const query = textBefore.slice(openIdx + 2)
      acStartPos.current = openIdx
      setAcQuery(query)
      setAcActive(true)
      // Position the dropdown near the input
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect()
        setAcAnchor({ top: rect.top, left: rect.left, height: rect.height })
      }
    } else {
      setAcActive(false)
      setAcQuery('')
    }
  }

  const handleAcSelect = (result: SectionSearchResult) => {
    // Build the link text
    const linkText = result.list_id === currentListId
      ? `[[${result.text}]]`
      : `[[${result.list_title}/${result.text}]]`

    // Replace from [[ to cursor with the completed link
    const before = editText.slice(0, acStartPos.current)
    const cursor = inputRef.current?.selectionStart ?? editText.length
    const after = editText.slice(cursor)
    const newText = before + linkText + after
    setEditText(newText)
    setAcActive(false)
    setAcQuery('')

    // Re-focus and position cursor after the inserted link
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = before.length + linkText.length
        inputRef.current.focus()
        inputRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  const handleLinkClick = async (name: string, listTitle?: string) => {
    if (!onNavigateToSection) return
    try {
      const result = await resolveSection(name, listTitle, currentListId)
      onNavigateToSection(result.list_id, result.section_id)
    } catch {
      // Section not found — could show a toast, but for now just ignore
    }
  }

  // Context menu state — desktop right-click only, not mobile long-press
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const lastPointerType = useRef<string>('mouse')

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Don't show context menu on touch — long-press is for drag
    if (lastPointerType.current === 'touch') return
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!ctxMenu) return
    const handleClick = () => setCtxMenu(null)
    const handleKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [ctxMenu])

  const serializeNode = () => ({
    _checkm8: true,
    type: node.type,
    text: node.text,
    checked: node.checked,
    notes: node.notes,
    priority: node.priority,
    due_date: node.due_date,
    pinned: node.pinned,
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(serializeNode()))
    setCtxMenu(null)
  }

  const handleCut = async () => {
    await navigator.clipboard.writeText(JSON.stringify(serializeNode()))
    setCtxMenu(null)
    onDelete()
  }

  const handlePaste = async () => {
    setCtxMenu(null)
    if (!onPaste) return
    try {
      const text = await navigator.clipboard.readText()
      const data = JSON.parse(text)
      if (data._checkm8) {
        onPaste({
          type: data.type || 'item',
          text: data.text || '',
          checked: data.checked || false,
          notes: data.notes || null,
          priority: data.priority || null,
          due_date: data.due_date || null,
        })
      }
    } catch {
      // Invalid clipboard content — ignore
    }
  }

  const hasChildren = node.children.length > 0
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const indent = node.depth * (isMobile ? 16 : 24)

  // Render text with links
  const renderText = () => {
    if (!node.text) {
      return <span className="text-gray-400 italic">untitled</span>
    }
    if (!hasLinks(node.text)) {
      return <>{node.text}</>
    }
    const segments = parseLinks(node.text)
    return (
      <>
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return <span key={i}>{seg.value}</span>
          }
          return (
            <button
              key={i}
              className="text-blue-500 hover:text-blue-600 hover:underline cursor-pointer inline"
              onClick={(e) => {
                e.stopPropagation()
                handleLinkClick(seg.name, seg.listTitle)
              }}
              title={seg.listTitle ? `${seg.listTitle} / ${seg.name}` : seg.name}
            >
              {seg.name}
            </button>
          )
        })}
      </>
    )
  }

  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focused])

  return (
    <div data-node-id={node.id} ref={rowRef}>
      <div
        className={`flex items-center gap-2 ${node.type === 'section' ? 'py-2 mt-3 first:mt-0' : 'py-1'} px-2 rounded group cursor-default select-none relative
          ${focused ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-400 dark:ring-blue-500 z-10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
          ${node.type === 'item' && node.checked ? 'opacity-60' : ''}
          ${node.type === 'section' && node.depth > 0 ? 'border-l-2 border-gray-300 dark:border-gray-600' : ''}`}
        style={{ paddingLeft: `${indent + 8}px`, WebkitTouchCallout: 'none' }}
        onClick={onFocus}
        onDoubleClick={() => setEditing(true)}
        onPointerDown={(e) => { lastPointerType.current = e.pointerType }}
        onContextMenu={handleContextMenu}
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
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={editText}
              onChange={handleInputChange}
              onBlur={() => {
                // Delay to allow autocomplete mousedown to fire
                setTimeout(() => {
                  if (!acActive) commitEdit()
                }, 150)
              }}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent border-none outline-none text-gray-900 dark:text-white text-sm p-0"
            />
            {acActive && (
              <SectionAutocomplete
                query={acQuery}
                listId={currentListId}
                anchorRect={acAnchor}
                onSelect={handleAcSelect}
                onClose={() => { setAcActive(false); setAcQuery('') }}
              />
            )}
          </div>
        ) : (
          <span className={`flex-1 ${node.type === 'section' ? (node.depth === 0 ? 'text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400' : 'text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500') : 'text-sm text-gray-700 dark:text-gray-300'} ${node.checked ? 'line-through' : ''}`}>
            {renderText()}
          </span>
        )}

        {/* Pin indicator & toggle for sections */}
        {node.type === 'section' && (
          <button
            className={`p-1 flex-shrink-0 transition-opacity ${node.pinned ? 'text-blue-500 !opacity-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 sm:opacity-0 sm:group-hover:opacity-100'}`}
            onClick={(e) => { e.stopPropagation(); onUpdate({ pinned: !node.pinned }) }}
            tabIndex={-1}
            title={node.pinned ? 'Unpin section' : 'Pin to top'}
          >
            <svg className="w-3.5 h-3.5" fill={node.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        )}

        {/* Due date */}
        {node.due_date && (
          <span className={`text-xs flex-shrink-0 ${getDueDateColor(node.due_date)}`}>
            {node.due_date}
          </span>
        )}

        {/* Notes toggle (sections only — items use detail panel via long-press) */}
        {node.type === 'section' && (
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
        )}

        {/* Detail button (items) / Delete button (sections) */}
        {node.type === 'item' && onOpenDetail ? (
          <button
            className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onOpenDetail() }}
            tabIndex={-1}
            title="Details"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </button>
        ) : (
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
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded py-0.5 min-w-[100px]"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="w-full px-3 py-1 text-left text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800" onClick={handleCut}>Cut</button>
          <button className="w-full px-3 py-1 text-left text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800" onClick={handleCopy}>Copy</button>
          <div className="mx-2 my-0.5 border-t border-gray-100 dark:border-gray-800" />
          <button className="w-full px-3 py-1 text-left text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30" onClick={handlePaste} disabled={!onPaste}>Paste</button>
        </div>
      )}

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
