import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { TreeNode, NodeUpdate, NodeCreate, SectionSearchResult, AutocompleteSuggestion } from '../types'
import { getDueDateColor, getPriorityColor } from '../lib/tree'
import { parseLinks, hasLinks } from '../lib/parseLinks'
import { resolveSection } from '../api/nodes'
import { getAutocomplete } from '../api/lists'
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
  onDeleteSection?: (deleteChildren: boolean) => void
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
  onDeleteSection,
  onEditingChange,
  onNavigateToSection,
  onOpenDetail,
  onPaste,
}: NodeRowProps) {
  const [editing, setEditingState] = useState(false)
  const [editText, setEditText] = useState(node.text)
  const pendingTextRef = useRef<string | null>(null)
  const committedRef = useRef(false)

  const setEditing = (value: boolean) => {
    if (value) committedRef.current = false
    setEditingState(value)
    onEditingChange?.(value)
  }

  // Allow parent to trigger edit mode
  useEffect(() => {
    if (startEditingProp && focused && !editing) {
      setEditing(true)
    }
  }, [startEditingProp, focused])

  // When focus leaves this row, commit any pending edit and close panels
  useEffect(() => {
    if (!focused) {
      if (editing) commitEdit()
      setDeleteConfirm(false)
    }
  }, [focused])
  const inputRef = useRef<HTMLInputElement>(null)

  // Section autocomplete state (triggered by [[)
  const [acQuery, setAcQuery] = useState('')
  const [acActive, setAcActive] = useState(false)
  const [acAnchor, setAcAnchor] = useState<{ top: number; left: number; height: number } | null>(null)
  const acStartPos = useRef<number>(-1)

  // Archive autocomplete state (triggered by typing)
  const [archiveAc, setArchiveAc] = useState<AutocompleteSuggestion[]>([])
  const [archiveAcVisible, setArchiveAcVisible] = useState(false)
  const archiveAcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [archiveAcIndex, setArchiveAcIndex] = useState(-1)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
      // Fetch archive suggestions immediately (shows top items when text is empty)
      if (node.type === 'item') {
        fetchArchiveAc(editText)
      }
    }
  }, [editing])

  useEffect(() => {
    if (pendingTextRef.current !== null && node.text === pendingTextRef.current) {
      pendingTextRef.current = null
    }
    if (!editing) {
      setEditText(node.text)
      setAcActive(false)
      setArchiveAcVisible(false)
      setArchiveAc([])
      if (archiveAcTimer.current) clearTimeout(archiveAcTimer.current)
    }
  }, [node.text, editing])

  const commitEdit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const textToSave = editText
    setEditing(false)
    setAcActive(false)
    setArchiveAcVisible(false)
    if (textToSave !== node.text) {
      pendingTextRef.current = textToSave
      onUpdate({ text: textToSave })
    }
  }


  // Fetch archive autocomplete suggestions (empty string returns top 3 by frequency)
  const fetchArchiveAc = useCallback((text: string) => {
    if (archiveAcTimer.current) clearTimeout(archiveAcTimer.current)
    if (!currentListId) {
      setArchiveAc([])
      setArchiveAcVisible(false)
      return
    }
    const delay = text.trim() ? 200 : 0
    archiveAcTimer.current = setTimeout(async () => {
      const results = await getAutocomplete(currentListId, text.trim())
      setArchiveAc(results)
      setArchiveAcVisible(results.length > 0)
      setArchiveAcIndex(-1)
    }, delay)
  }, [currentListId])

  const selectArchiveAc = (text: string) => {
    setEditText(text)
    setArchiveAcVisible(false)
    setArchiveAc([])
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Archive autocomplete keyboard navigation
    if (archiveAcVisible && archiveAc.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setArchiveAcIndex((prev) => Math.min(prev + 1, archiveAc.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setArchiveAcIndex((prev) => Math.max(prev - 1, -1))
        return
      }
      if (e.key === 'Enter' && archiveAcIndex >= 0) {
        e.preventDefault()
        selectArchiveAc(archiveAc[archiveAcIndex].text)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setArchiveAcVisible(false)
        return
      }
    }

    // Let section autocomplete handle these keys when active
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
      setArchiveAcVisible(false)
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
      // We're inside a [[ ... sequence — use section autocomplete
      const query = textBefore.slice(openIdx + 2)
      acStartPos.current = openIdx
      setAcQuery(query)
      setAcActive(true)
      setArchiveAcVisible(false)
      // Position the dropdown near the input
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect()
        setAcAnchor({ top: rect.top, left: rect.left, height: rect.height })
      }
    } else {
      setAcActive(false)
      setAcQuery('')
      // Archive autocomplete — only for items, not sections
      if (node.type === 'item') {
        fetchArchiveAc(val)
      }
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

  // Long-press delete confirm on detail button
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteChildren, setDeleteChildren] = useState(false)
  const detailLpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detailLpFired = useRef(false)

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
    const displayText = pendingTextRef.current ?? node.text
    if (!displayText) {
      return <span className="text-gray-400 italic">untitled</span>
    }
    if (!hasLinks(displayText)) {
      return <>{displayText}</>
    }
    const segments = parseLinks(displayText)
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
                // Delay to allow autocomplete mousedown to fire first
                setTimeout(() => commitEdit(), 150)
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
            {archiveAcVisible && archiveAc.length > 0 && !acActive && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                {archiveAc.map((s, i) => (
                  <button
                    key={s.text}
                    className={`w-full px-3 py-1.5 text-left text-sm flex items-center justify-between transition-colors ${
                      i === archiveAcIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectArchiveAc(s.text)
                    }}
                  >
                    <span className="text-gray-900 dark:text-white truncate">{s.text}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">{s.frequency}x</span>
                  </button>
                ))}
              </div>
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

        {/* Detail button: tap → details, long-press → delete confirm */}
        {onOpenDetail && (
          <button
            className="p-1 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 select-none"
            style={{ WebkitTouchCallout: 'none' }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
            onPointerDown={(e) => {
              e.stopPropagation()
              detailLpFired.current = false
              detailLpTimer.current = setTimeout(() => {
                detailLpFired.current = true
                setDeleteConfirm(true)
              }, 500)
            }}
            onPointerUp={() => {
              if (detailLpTimer.current) {
                clearTimeout(detailLpTimer.current)
                detailLpTimer.current = null
              }
            }}
            onPointerLeave={() => {
              if (detailLpTimer.current) {
                clearTimeout(detailLpTimer.current)
                detailLpTimer.current = null
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (!detailLpFired.current) {
                onOpenDetail()
              }
            }}
            tabIndex={-1}
            title="Details (long-press to delete)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
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

      {/* Delete confirm panel */}
      {deleteConfirm && (
        <div
          style={{ paddingLeft: `${indent + 8}px` }}
          className="py-1.5 px-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-500">Delete this {node.type === 'section' ? 'section' : 'item'}?</span>
            <button
              onClick={() => {
                setDeleteConfirm(false)
                if (node.type === 'section' && onDeleteSection) {
                  onDeleteSection(deleteChildren)
                } else {
                  onDelete()
                }
                setDeleteChildren(false)
              }}
              className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Delete
            </button>
            <button
              onClick={() => { setDeleteConfirm(false); setDeleteChildren(false) }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              Cancel
            </button>
          </div>
          {node.type === 'section' && (
            <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteChildren}
                onChange={(e) => setDeleteChildren(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-red-500 focus:ring-red-500"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">Delete all items within section</span>
            </label>
          )}
        </div>
      )}

    </div>
  )
}
