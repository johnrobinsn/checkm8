import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TreeNode, NodeOut } from '../types'
import { NodeRow } from './NodeRow'
import { getNodeDepth } from '../lib/tree'

interface TreeViewProps {
  visibleNodes: TreeNode[]
  nodes: NodeOut[]
  collapsed: Set<string>
  focusedId: string | null
  onFocus: (id: string) => void
  onToggleCollapse: (id: string) => void
  onUpdate: (nodeId: string, data: any) => void
  onDelete: (nodeId: string) => void
  onAddNode: (data: any) => void
  onMoveNode: (nodeId: string, parentId: string | null, afterId: string | null) => void
  onUndo: () => void
  onRedo: () => void
}

function SortableNode({
  node,
  focused,
  collapsed,
  startEditing,
  onToggleCollapse,
  onUpdate,
  onFocus,
  onDelete,
  onEditingChange,
}: {
  node: TreeNode
  focused: boolean
  collapsed: boolean
  startEditing?: boolean
  onToggleCollapse: () => void
  onUpdate: (data: any) => void
  onFocus: () => void
  onDelete: () => void
  onEditingChange?: (editing: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <NodeRow
        node={node}
        focused={focused}
        collapsed={collapsed}
        startEditing={startEditing}
        onToggleCollapse={onToggleCollapse}
        onUpdate={onUpdate}
        onFocus={onFocus}
        onDelete={onDelete}
        onEditingChange={onEditingChange}
      />
    </div>
  )
}

export function TreeView({
  visibleNodes,
  nodes,
  collapsed,
  focusedId,
  onFocus,
  onToggleCollapse,
  onUpdate,
  onDelete,
  onAddNode,
  onMoveNode,
  onUndo,
  onRedo,
}: TreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const addNodeContextAware = useCallback((type: 'item' | 'section') => {
    const focusedNode = focusedId ? visibleNodes.find((n) => n.id === focusedId) : null
    if (focusedNode) {
      if (type === 'item' && focusedNode.type === 'section') {
        // Add item as child of focused section
        onAddNode({ type, text: '', parent_id: focusedNode.id })
      } else {
        // Add as sibling after focused node (works for both items and sections)
        onAddNode({ type, text: '', parent_id: focusedNode.parent_id, after_id: focusedNode.id })
      }
    } else {
      onAddNode({ type, text: '' })
    }
  }, [focusedId, visibleNodes, onAddNode])

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
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, activatorEvent } = event
      if (!over || active.id === over.id) return

      const activeId = active.id as string
      const overId = over.id as string
      const overNode = nodes.find((n) => n.id === overId)
      if (!overNode) return

      // Determine if dropping above or below the midpoint of the target
      let dropAbove = false
      const overEl = containerRef.current?.querySelector(`[data-node-id="${overId}"]`)
      if (overEl && activatorEvent instanceof PointerEvent) {
        const rect = overEl.getBoundingClientRect()
        // Use the last known pointer position from the delta
        const pointerY = (activatorEvent as PointerEvent).clientY + (event.delta?.y ?? 0)
        const midY = rect.top + rect.height / 2
        dropAbove = pointerY < midY
      }

      if (dropAbove) {
        // Place before the over node: find the previous sibling at the same level
        const siblings = nodes
          .filter((n) => n.parent_id === overNode.parent_id)
          .sort((a, b) => a.position - b.position)
        const overSibIdx = siblings.findIndex((s) => s.id === overId)
        if (overSibIdx <= 0) {
          // First sibling — place at the very beginning
          onMoveNode(activeId, overNode.parent_id, null)
        } else {
          // Place after the previous sibling
          onMoveNode(activeId, overNode.parent_id, siblings[overSibIdx - 1].id)
        }
      } else {
        // Place after the over node
        onMoveNode(activeId, overNode.parent_id, overId)
      }
    },
    [nodes, onMoveNode],
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                  onToggleCollapse={() => onToggleCollapse(node.id)}
                  onUpdate={(data) => onUpdate(node.id, data)}
                  onFocus={() => onFocus(node.id)}
                  onDelete={() => onDelete(node.id)}
                  onEditingChange={(editing) => {
                    setIsEditing(editing)
                    if (!editing) setEditingNodeId(null)
                  }}
                />
              ))}
              <div className="mt-3 ml-1 sm:ml-2 flex items-center gap-1 sm:gap-2">
                <button
                  className="px-3 py-2 sm:py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded flex items-center gap-1.5 transition-colors"
                  onClick={() => addNodeContextAware('item')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add item
                </button>
                <button
                  className="px-3 py-2 sm:py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded flex items-center gap-1.5 transition-colors"
                  onClick={() => addNodeContextAware('section')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16" />
                  </svg>
                  Add section
                </button>
              </div>
            </>
          )}
        </SortableContext>
      </DndContext>
    </div>
  )
}
