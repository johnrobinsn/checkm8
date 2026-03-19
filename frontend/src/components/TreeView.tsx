import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  // When dragging, show the placeholder at the preview depth
  const displayNode = isDragging && previewDepth != null ? { ...node, depth: previewDepth } : node

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
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
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null)

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
  )

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const activeNode = nodes.find((n) => n.id === (event.active.id as string))
      if (!activeNode) return

      const deltaX = event.delta?.x ?? 0
      const isMobile = window.innerWidth < 640
      const indentThreshold = isMobile ? 16 : 24
      const currentDepth = getNodeDepth(nodes, activeNode.id)

      if (deltaX < -indentThreshold && activeNode.parent_id) {
        // Dragging left → preview outdent
        setPreviewDepth(Math.max(0, currentDepth - 1))
      } else if (deltaX > indentThreshold) {
        // Dragging right → preview indent (if previous sibling exists and depth allows)
        const siblings = visibleNodes.filter((n) => n.parent_id === activeNode.parent_id)
        const sibIdx = siblings.findIndex((s) => s.id === activeNode.id)
        if (sibIdx > 0 && currentDepth < 4) {
          setPreviewDepth(currentDepth + 1)
        } else {
          setPreviewDepth(currentDepth)
        }
      } else {
        setPreviewDepth(currentDepth)
      }
    },
    [nodes, visibleNodes],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, activatorEvent } = event
      const activeId = active.id as string
      const activeNode = nodes.find((n) => n.id === activeId)
      if (!activeNode) return

      // Check horizontal drag for indent/outdent (works even when dropped on self)
      const deltaX = event.delta?.x ?? 0
      const isMobile = window.innerWidth < 640
      const indentThreshold = isMobile ? 16 : 24

      if (Math.abs(deltaX) > indentThreshold) {
        if (deltaX < 0 && activeNode.parent_id) {
          // Drag left → outdent: move to grandparent, placed after current parent
          const parent = nodes.find((n) => n.id === activeNode.parent_id)
          if (parent) {
            onMoveNode(activeId, parent.parent_id, parent.id)
            return
          }
        } else if (deltaX > 0) {
          // Drag right → indent: make previous sibling the parent
          const siblings = visibleNodes.filter((n) => n.parent_id === activeNode.parent_id)
          const sibIdx = siblings.findIndex((s) => s.id === activeId)
          if (sibIdx > 0) {
            const prevSibling = siblings[sibIdx - 1]
            const depth = getNodeDepth(nodes, prevSibling.id)
            if (depth < 4) {
              onMoveNode(activeId, prevSibling.id, null)
              return
            }
          }
        }
      }

      // Vertical reorder — requires dropping on a different node
      if (!over || active.id === over.id) return
      const overId = over.id as string
      const overNode = nodes.find((n) => n.id === overId)
      if (!overNode) return
      if (overNode.parent_id === activeId) return

      let dropAbove = false
      const overEl = containerRef.current?.querySelector(`[data-node-id="${overId}"]`)
      if (overEl && activatorEvent instanceof PointerEvent) {
        const rect = overEl.getBoundingClientRect()
        const pointerY = (activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0)
        const midY = rect.top + rect.height / 2
        dropAbove = pointerY < midY
      }

      if (dropAbove) {
        const siblings = nodes
          .filter((n) => n.parent_id === overNode.parent_id)
          .sort((a, b) => a.position - b.position)
        const overSibIdx = siblings.findIndex((s) => s.id === overId)
        if (overSibIdx <= 0) {
          onMoveNode(activeId, overNode.parent_id, null, true)
        } else {
          onMoveNode(activeId, overNode.parent_id, siblings[overSibIdx - 1].id)
        }
      } else {
        onMoveNode(activeId, overNode.parent_id, overId)
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
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragMove={handleDragMove}
        onDragEnd={(e: DragEndEvent) => { setActiveId(null); setPreviewDepth(null); handleDragEnd(e) }}
        onDragCancel={() => { setActiveId(null); setPreviewDepth(null) }}
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
