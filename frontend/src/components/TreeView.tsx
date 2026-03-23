import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useMomentumScroll } from '../hooks/useMomentumScroll'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TreeNode, NodeOut } from '../types'
import { NodeRow } from './NodeRow'
import { ItemDetailPanel } from './ItemDetailPanel'
import { getNodeDepth } from '../lib/tree'
import { LongPressTouchSensor, sensorPhase } from '../sensors/LongPressTouchSensor'

interface TreeViewProps {
  visibleNodes: TreeNode[]
  nodes: NodeOut[]
  collapsed: Set<string>
  focusedId: string | null
  currentListId?: string
  onFocus: (id: string) => void
  onToggleCollapse: (id: string) => void
  onUpdate: (nodeId: string, data: any) => void
  onDelete: (nodeId: string) => void
  onAddNode: (data: any) => void
  onMoveNode: (nodeId: string, parentId: string | null, afterId: string | null, atBeginning?: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onNavigateToSection?: (listId: string, sectionId: string) => void
}

function SortableNode({
  node,
  focused,
  collapsed,
  startEditing,
  currentListId,
  previewDepth,
  onToggleCollapse,
  onUpdate,
  onFocus,
  onDelete,
  onEditingChange,
  onNavigateToSection,
  onOpenDetail,
  onPaste,
}: {
  node: TreeNode
  focused: boolean
  collapsed: boolean
  startEditing?: boolean
  currentListId?: string
  previewDepth?: number | null
  onToggleCollapse: () => void
  onUpdate: (data: any) => void
  onFocus: () => void
  onDelete: () => void
  onEditingChange?: (editing: boolean) => void
  onNavigateToSection?: (listId: string, sectionId: string) => void
  onOpenDetail?: () => void
  onPaste?: (data: any) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  // Debug: log listener keys once per node
  useEffect(() => {
    const el = document.getElementById('sensor-debug')
    if (el && focused) {
      el.textContent = `listeners: ${listeners ? Object.keys(listeners).join(', ') : 'null'}`
    }
  }, [listeners, focused])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    touchAction: 'none',
  }

  // When dragging, show the placeholder at the preview depth
  const displayNode = isDragging && previewDepth != null ? { ...node, depth: previewDepth } : node

  return (
    <div ref={setNodeRef} style={style} data-sortable {...attributes} {...listeners}>
      <NodeRow
        node={displayNode}
        focused={focused}
        collapsed={collapsed}
        startEditing={startEditing}
        currentListId={currentListId}
        onToggleCollapse={onToggleCollapse}
        onUpdate={onUpdate}
        onFocus={onFocus}
        onDelete={onDelete}
        onEditingChange={onEditingChange}
        onNavigateToSection={onNavigateToSection}
        onOpenDetail={onOpenDetail}
        onPaste={onPaste}
      />
    </div>
  )
}

export function TreeView({
  visibleNodes,
  nodes,
  collapsed,
  focusedId,
  currentListId,
  onFocus,
  onToggleCollapse,
  onUpdate,
  onDelete,
  onAddNode,
  onMoveNode,
  onUndo,
  onRedo,
  onNavigateToSection,
}: TreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [previewDepth, setPreviewDepth] = useState<number | null>(null)
  const previewDepthRef = useRef<number | null>(null)
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)

  // Auto-enter edit mode when a newly focused node has empty text (just created)
  useEffect(() => {
    if (!focusedId) return
    const node = visibleNodes.find((n) => n.id === focusedId)
    if (node && node.type === 'item' && node.text === '') {
      setEditingNodeId(focusedId)
    }
  }, [focusedId, visibleNodes])

  // Touch scroll with momentum (needed because touch-action: none disables browser scroll)
  const dragActiveRef = useRef(false)
  const scrollContainerRef = useRef<HTMLElement | null>(null)

  // Find the scrollable parent on mount
  useEffect(() => {
    let el = containerRef.current?.parentElement ?? null
    while (el) {
      const { overflowY } = getComputedStyle(el)
      if (overflowY === 'auto' || overflowY === 'scroll') {
        scrollContainerRef.current = el
        break
      }
      el = el.parentElement
    }
  }, [])

  const { handleTouchStart, handleTouchMove, handleTouchEnd, cancelMomentum } = useMomentumScroll({
    scrollContainerRef,
    isScrollDisabled: () => sensorPhase !== 'idle',
  })

  // Set grabbing cursor on body during drag
  useEffect(() => {
    if (activeId) {
      document.body.style.cursor = 'grabbing'
      return () => { document.body.style.cursor = '' }
    }
  }, [activeId])

  const addSectionWithPrompt = useCallback(() => {
    const name = prompt('Section name:')
    if (!name?.trim()) return
    onAddNode({ type: 'section', text: name.trim() })
  }, [onAddNode])

  const addNodeContextAware = useCallback((type: 'item' | 'section') => {
    if (type === 'section') {
      addSectionWithPrompt()
      return
    }
    const focusedNode = focusedId ? visibleNodes.find((n) => n.id === focusedId) : null
    if (focusedNode) {
      if (focusedNode.type === 'section') {
        onAddNode({ type, text: '', parent_id: focusedNode.id, at_beginning: true })
      } else {
        onAddNode({ type, text: '', parent_id: focusedNode.parent_id, after_id: focusedNode.id })
      }
    } else {
      onAddNode({ type, text: '' })
    }
  }, [focusedId, visibleNodes, onAddNode, addSectionWithPrompt])

  // Auto-focus tree container so keyboard shortcuts work immediately
  useEffect(() => {
    if (!isEditing) {
      containerRef.current?.focus()
    }
  }, [visibleNodes.length, isEditing])

  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  })
  const touchSensor = useSensor(LongPressTouchSensor, {
    delay: 600,
    tolerance: 15,
  })
  // On touch devices, DON'T include PointerSensor — pointerdown fires before
  // touchstart and steals the activation lock, preventing our touch sensor.
  const sensors = useSensors(
    ...(isTouchDevice ? [touchSensor] : [pointerSensor, touchSensor]),
  )

  const updatePreviewDepth = useCallback((depth: number) => {
    setPreviewDepth(depth)
    previewDepthRef.current = depth
  }, [])

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const activeNode = nodes.find((n) => n.id === (event.active.id as string))
      if (!activeNode) return

      const deltaX = event.delta?.x ?? 0
      const isMobile = window.innerWidth < 640
      const indentThreshold = isMobile ? 16 : 24
      const currentDepth = getNodeDepth(nodes, activeNode.id)

      if (deltaX < -indentThreshold && activeNode.parent_id) {
        updatePreviewDepth(Math.max(0, currentDepth - 1))
      } else if (deltaX > indentThreshold) {
        const siblings = visibleNodes.filter((n) => n.parent_id === activeNode.parent_id)
        const sibIdx = siblings.findIndex((s) => s.id === activeNode.id)
        if (sibIdx > 0 && currentDepth < 4) {
          updatePreviewDepth(currentDepth + 1)
        } else {
          updatePreviewDepth(currentDepth)
        }
      } else {
        updatePreviewDepth(currentDepth)
      }
    },
    [nodes, visibleNodes, updatePreviewDepth],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, activatorEvent } = event
      const activeId = active.id as string
      const activeNode = nodes.find((n) => n.id === activeId)
      if (!activeNode) return

      const deltaX = event.delta?.x ?? 0
      const isMobile = window.innerWidth < 640
      const indentThreshold = isMobile ? 16 : 24
      const desiredDepth = previewDepthRef.current ?? getNodeDepth(nodes, activeId)

      const dbg = document.getElementById('sensor-debug')
      const log = (msg: string) => { if (dbg) dbg.textContent = (dbg.textContent || '') + '\n' + msg }
      if (dbg) dbg.textContent = '--- DROP ---'

      const activeText = activeNode.text || activeId.slice(0,8)
      log(`active="${activeText}" dnd-over=${over ? (over.id as string).slice(0,8) : 'NULL'} same=${over?.id === active.id} deltaX=${deltaX.toFixed(0)} deltaY=${(event.delta?.y ?? 0).toFixed(0)} desiredDepth=${desiredDepth}`)

      // Resolve the "over" node — use dnd-kit's collision detection, with a fallback
      // to pointer-Y proximity when closestCenter returns null (common at section boundaries)
      let resolvedOverId: string | null = over && over.id !== active.id ? (over.id as string) : null

      // Indent/outdent: horizontal drag dropped on self
      if (!resolvedOverId) {
        log(`no resolvedOver, checking indent/outdent`)
        if (Math.abs(deltaX) > indentThreshold) {
          if (deltaX < 0 && activeNode.parent_id) {
            const parent = nodes.find((n) => n.id === activeNode.parent_id)
            if (parent) {
              onMoveNode(activeId, parent.parent_id, parent.id)
              return
            }
          } else if (deltaX > 0) {
            const siblings = visibleNodes.filter((n) => n.parent_id === activeNode.parent_id)
            const sibIdx = siblings.findIndex((s) => s.id === activeId)
            if (sibIdx > 0) {
              const prevSibling = siblings[sibIdx - 1]
              if (getNodeDepth(nodes, prevSibling.id) < 4) {
                onMoveNode(activeId, prevSibling.id, null)
                return
              }
            }
          }
        }

        // Fallback: find closest node by pointer Y position
        if (containerRef.current) {
          let startY: number | null = null
          if (activatorEvent instanceof PointerEvent) {
            startY = activatorEvent.clientY
          } else if (activatorEvent instanceof TouchEvent && activatorEvent.touches.length > 0) {
            startY = activatorEvent.touches[0].clientY
          }
          if (startY !== null) {
            const pointerY = startY + (event.delta?.y ?? 0)
            let closestDist = Infinity
            for (const vn of visibleNodes) {
              if (vn.id === activeId) continue
              const el = containerRef.current.querySelector(`[data-node-id="${vn.id}"]`)
              if (!el) continue
              const rect = el.getBoundingClientRect()
              const mid = rect.top + rect.height / 2
              const dist = Math.abs(pointerY - mid)
              if (dist < closestDist) {
                closestDist = dist
                resolvedOverId = vn.id
              }
            }
          }
        }

        if (!resolvedOverId) return
        log(`fallback over=${resolvedOverId.slice(0,8)}`)
      }

      // Vertical reorder — dropped on a different node
      const overNode = nodes.find((n) => n.id === resolvedOverId)
      if (!overNode) { log('overNode not found'); return }
      if (overNode.parent_id === activeId) { log('over is child of active'); return }

      const overDepth = getNodeDepth(nodes, resolvedOverId)
      log(`over="${overNode.text}" oD=${overDepth} dD=${desiredDepth}`)

      // Use desiredDepth (from preview) to determine the correct parent.
      // Walk up from over node to find the reference node at the right level.
      let refNode = overNode
      let refDepth = overDepth
      while (refDepth > desiredDepth && refNode.parent_id) {
        const parent = nodes.find((n) => n.id === refNode.parent_id)
        if (!parent) break
        refNode = parent
        refDepth--
      }

      // Determine drop above/below the reference node
      let dropAbove = false
      const overEl = containerRef.current?.querySelector(`[data-node-id="${resolvedOverId}"]`)
      if (overEl) {
        const rect = overEl.getBoundingClientRect()
        let startY: number | null = null
        if (activatorEvent instanceof PointerEvent) {
          startY = activatorEvent.clientY
        } else if (activatorEvent instanceof TouchEvent && activatorEvent.touches.length > 0) {
          startY = activatorEvent.touches[0].clientY
        }
        if (startY !== null) {
          const pointerY = startY + (event.delta?.y ?? 0)
          const midY = rect.top + rect.height / 2
          dropAbove = pointerY < midY
        }
      }

      log(`ref="${refNode.text}" refD=${refDepth} dropAbove=${dropAbove} branch=${desiredDepth === refDepth + 1 ? 'cross-section' : 'same-level'}`)

      // Helper: find previous visible node at a given depth (uses visual order, not data order)
      const findPrevAtDepth = (nodeId: string, depth: number) => {
        const idx = visibleNodes.findIndex((n) => n.id === nodeId)
        for (let i = idx - 1; i >= 0; i--) {
          if (visibleNodes[i].depth === depth && visibleNodes[i].id !== activeId) {
            return nodes.find((n) => n.id === visibleNodes[i].id) ?? null
          }
        }
        return null
      }

      // Helper: find the last visible child of a section (visual order)
      const findLastVisibleChild = (parentId: string) => {
        const children = visibleNodes.filter((n) => n.parent_id === parentId && n.id !== activeId)
        return children.length > 0 ? children[children.length - 1] : null
      }

      // Helper: find previous visible sibling (same parent, visual order)
      const findPrevVisibleSibling = (nodeId: string, parentId: string | null) => {
        const siblings = visibleNodes.filter((n) => n.parent_id === parentId && n.id !== activeId)
        const idx = siblings.findIndex((n) => n.id === nodeId)
        return idx > 0 ? siblings[idx - 1] : null
      }

      if (desiredDepth === refDepth + 1) {
        if (dropAbove) {
          // Finger is ABOVE the section header → item belongs at end of PREVIOUS section
          const prevSection = findPrevAtDepth(refNode.id, refDepth)
          if (prevSection) {
            const lastChild = findLastVisibleChild(prevSection.id)
            log(`→ MOVE into prev section "${prevSection.text}" after="${lastChild?.text ?? 'BEGIN'}" (dropAbove cross-section)`)
            onMoveNode(activeId, prevSection.id, lastChild?.id ?? null, !lastChild)
          } else {
            // No previous section — place at beginning of this section
            log(`→ MOVE into "${refNode.text}" atBegin (no prev section)`)
            onMoveNode(activeId, refNode.id, null, true)
          }
        } else {
          // Finger is BELOW the section header → item goes into THIS section
          log(`→ MOVE into "${refNode.text}" atBegin (dropBelow cross-section)`)
          onMoveNode(activeId, refNode.id, null, true)
        }
      } else {
        // Same level as refNode — place before or after
        const parentId = refNode.parent_id
        const parentNode = parentId ? nodes.find((n) => n.id === parentId) : null
        if (dropAbove) {
          const prevSibling = findPrevVisibleSibling(refNode.id, parentId)
          if (!prevSibling && parentNode) {
            // Dropping above the first item in a section — check if there's a previous section
            const prevSection = findPrevAtDepth(parentNode.id, getNodeDepth(nodes, parentNode.id))
            if (prevSection) {
              const lastChild = findLastVisibleChild(prevSection.id)
              log(`→ MOVE into prev section "${prevSection.text}" after="${lastChild?.text ?? 'BEGIN'}" (drop above first child)`)
              onMoveNode(activeId, prevSection.id, lastChild?.id ?? null, !lastChild)
            } else {
              log(`→ MOVE sibling atBegin parent="${parentNode?.text ?? 'root'}" (no prev section)`)
              onMoveNode(activeId, parentId, null, true)
            }
          } else if (!prevSibling) {
            log(`→ MOVE sibling atBegin parent="${parentNode?.text ?? 'root'}" (no parentNode)`)
            onMoveNode(activeId, parentId, null, true)
          } else {
            log(`→ MOVE sibling after="${prevSibling.text}" parent="${parentNode?.text ?? 'root'}"`)
            onMoveNode(activeId, parentId, prevSibling.id)
          }
        } else {
          log(`→ MOVE sibling after ref="${refNode.text}" parent="${parentNode?.text ?? 'root'}" (dropBelow)`)
          onMoveNode(activeId, parentId, refNode.id)
        }
      }
    },
    [nodes, visibleNodes, onMoveNode],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const focusedIdx = visibleNodes.findIndex((n) => n.id === focusedId)
      const focusedNode = focusedIdx >= 0 ? visibleNodes[focusedIdx] : null

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          if (focusedIdx < visibleNodes.length - 1) {
            onFocus(visibleNodes[focusedIdx + 1].id)
          }
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (focusedIdx > 0) {
            onFocus(visibleNodes[focusedIdx - 1].id)
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          if (focusedNode && focusedNode.children.length > 0 && collapsed.has(focusedNode.id)) {
            onToggleCollapse(focusedNode.id)
          } else if (focusedNode && focusedNode.children.length > 0) {
            onFocus(focusedNode.children[0].id)
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          if (focusedNode && focusedNode.children.length > 0 && !collapsed.has(focusedNode.id)) {
            onToggleCollapse(focusedNode.id)
          } else if (focusedNode && focusedNode.parent_id) {
            onFocus(focusedNode.parent_id)
          }
          break
        }
        case ' ': {
          e.preventDefault()
          if (focusedNode && focusedNode.type === 'item') {
            onUpdate(focusedNode.id, { checked: !focusedNode.checked })
          } else if (focusedNode && focusedNode.type === 'section') {
            onToggleCollapse(focusedNode.id)
          }
          break
        }
        case 'F2': {
          e.preventDefault()
          if (focusedNode) {
            setEditingNodeId(focusedNode.id)
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (focusedNode) {
            if (editingNodeId === focusedNode.id) {
              setEditingNodeId(null)
            } else {
              setEditingNodeId(focusedNode.id)
            }
          }
          break
        }
        case 'Insert':
        case 'n': {
          // Ctrl+N or Insert to add new item
          if (e.key === 'n' && !(e.ctrlKey || e.metaKey)) break
          e.preventDefault()
          addNodeContextAware('item')
          break
        }
        case 'g': {
          // Ctrl+Alt+G to add new section/group
          if (!((e.ctrlKey || e.metaKey) && e.altKey)) break
          e.preventDefault()
          addNodeContextAware('section')
          break
        }
        case 'Tab': {
          e.preventDefault()
          if (!focusedNode) break
          if (e.shiftKey) {
            // Outdent: move to grandparent, after current parent
            if (focusedNode.parent_id) {
              const parent = nodes.find((n) => n.id === focusedNode.parent_id)
              if (parent) {
                onMoveNode(focusedNode.id, parent.parent_id, parent.id)
              }
            }
          } else {
            // Indent: make previous sibling the parent
            const siblings = visibleNodes.filter((n) => n.parent_id === focusedNode.parent_id)
            const sibIdx = siblings.findIndex((s) => s.id === focusedNode.id)
            if (sibIdx > 0) {
              const prevSibling = siblings[sibIdx - 1]
              const depth = getNodeDepth(nodes, prevSibling.id)
              if (depth < 4) { // parent would be at depth, child at depth+1, max 5
                onMoveNode(focusedNode.id, prevSibling.id, null)
              }
            }
          }
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (focusedNode) {
            e.preventDefault()
            onDelete(focusedNode.id)
            // Focus next or previous
            if (focusedIdx < visibleNodes.length - 1) {
              onFocus(visibleNodes[focusedIdx + 1].id)
            } else if (focusedIdx > 0) {
              onFocus(visibleNodes[focusedIdx - 1].id)
            }
          }
          break
        }
        case 'z': {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (e.shiftKey) {
              onRedo()
            } else {
              onUndo()
            }
          }
          break
        }
        default:
          break
      }
    },
    [visibleNodes, focusedId, collapsed, nodes, onFocus, onToggleCollapse, onUpdate, addNodeContextAware, onMoveNode, onDelete, onUndo, onRedo],
  )

  return (
    <div
      ref={containerRef}
      className="flex-1 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Debug overlay — remove after fixing touch drag */}
      <div id="sensor-debug" className="fixed top-0 left-0 right-0 z-[9999] bg-black/80 text-green-400 text-xs font-mono px-2 py-1 whitespace-pre-wrap" style={{ maxHeight: '30vh', overflow: 'auto' }}
        onClick={(e) => {
          const el = e.currentTarget
          const text = el.textContent || ''
          navigator.clipboard.writeText(text).then(() => {
            const orig = el.style.borderColor
            el.style.borderColor = '#4ade80'
            el.style.borderWidth = '2px'
            el.style.borderStyle = 'solid'
            const badge = document.createElement('span')
            badge.textContent = ' Copied!'
            badge.style.color = '#4ade80'
            badge.style.fontWeight = 'bold'
            el.appendChild(badge)
            setTimeout(() => { badge.remove(); el.style.borderColor = orig; el.style.borderWidth = ''; el.style.borderStyle = '' }, 1000)
          })
        }}
      >
        sensor: idle
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e: DragStartEvent) => { cancelMomentum(); dragActiveRef.current = true; setActiveId(e.active.id as string) }}
        onDragMove={handleDragMove}
        onDragEnd={(e: DragEndEvent) => { handleDragEnd(e); dragActiveRef.current = false; setActiveId(null); setPreviewDepth(null); previewDepthRef.current = null }}
        onDragCancel={() => { dragActiveRef.current = false; setActiveId(null); setPreviewDepth(null); previewDepthRef.current = null }}
      >
        <SortableContext items={visibleNodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {visibleNodes.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg mb-2">No items yet</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  onClick={() => addNodeContextAware('item')}
                >
                  + Add item
                </button>
                <button
                  className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  onClick={() => addNodeContextAware('section')}
                >
                  + Add section
                </button>
              </div>
            </div>
          ) : (
            <>
              {visibleNodes.map((node) => (
                <SortableNode
                  key={node.id}
                  node={node}
                  focused={node.id === focusedId}
                  collapsed={collapsed.has(node.id)}
                  startEditing={node.id === editingNodeId}
                  currentListId={currentListId}
                  previewDepth={node.id === activeId ? previewDepth : undefined}
                  onToggleCollapse={() => onToggleCollapse(node.id)}
                  onUpdate={(data) => onUpdate(node.id, data)}
                  onFocus={() => onFocus(node.id)}
                  onDelete={() => onDelete(node.id)}
                  onEditingChange={(editing) => {
                    setIsEditing(editing)
                    if (!editing) setEditingNodeId(null)
                  }}
                  onNavigateToSection={onNavigateToSection}
                  onOpenDetail={() => setDetailNodeId(node.id)}
                  onPaste={(data) => onAddNode({ ...data, parent_id: node.parent_id, after_id: node.id })}
                />
              ))}
            </>
          )}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeId ? (() => {
            const node = visibleNodes.find((n) => n.id === activeId)
            if (!node) return null
            const isMob = window.innerWidth < 640
            const indentPx = isMob ? 16 : 24
            const depthDiff = (previewDepth ?? node.depth) - node.depth
            const offsetX = depthDiff * indentPx
            return (
              <div
                className="bg-white dark:bg-gray-900 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 transition-transform duration-100"
                style={{ cursor: 'grabbing', opacity: 0.5, transform: `translateX(${offsetX}px)` }}
              >
                <NodeRow
                  node={node}
                  focused={false}
                  collapsed={collapsed.has(node.id)}
                  onToggleCollapse={() => {}}
                  onUpdate={() => {}}
                  onFocus={() => {}}
                  onDelete={() => {}}
                />
              </div>
            )
          })() : null}
        </DragOverlay>
      </DndContext>

      {/* Add section button — outside DndContext to avoid touch event interference */}
      {visibleNodes.length > 0 && (
        <div className="mt-3 ml-1 sm:ml-2">
          <button
            type="button"
            className="px-3 py-2.5 sm:py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded flex items-center gap-1.5 transition-colors"
            onClick={() => addSectionWithPrompt()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16" />
            </svg>
            Add section
          </button>
        </div>
      )}

      {/* Item detail panel */}
      {detailNodeId && (() => {
        const detailNode = visibleNodes.find((n) => n.id === detailNodeId)
        if (!detailNode || detailNode.type !== 'item') return null
        return (
          <ItemDetailPanel
            node={detailNode}
            onUpdate={(data) => onUpdate(detailNodeId, data)}
            onDelete={() => onDelete(detailNodeId)}
            onClose={() => setDetailNodeId(null)}
          />
        )
      })()}
    </div>
  )
}
