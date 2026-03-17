import { useCallback, useEffect, useState } from 'react'
import type { NodeCreate, NodeOut, NodeUpdate, WsMessage } from '../types'
import { buildTree, getVisibleNodes } from '../lib/tree'
import * as nodesApi from '../api/nodes'
import { useWebSocket } from './useWebSocket'
import { useUndoRedo } from './useUndoRedo'

export function useTree(listId: string | null) {
  const [nodes, setNodes] = useState<NodeOut[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [presenceUserIds, setPresenceUserIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const { execute, undo, redo } = useUndoRedo()

  // Fetch nodes when listId changes
  useEffect(() => {
    if (!listId) {
      setNodes([])
      return
    }
    setLoading(true)
    nodesApi.getNodes(listId).then((data) => {
      setNodes(data)
      setCollapsed(new Set())
      setFocusedId(null)
    }).finally(() => setLoading(false))
  }, [listId])

  // WebSocket handler
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'node_created':
        setNodes((prev) => [...prev, msg.node])
        break
      case 'node_updated':
        setNodes((prev) => prev.map((n) => (n.id === msg.node.id ? msg.node : n)))
        break
      case 'node_moved':
        setNodes((prev) => prev.map((n) => (n.id === msg.node.id ? msg.node : n)))
        break
      case 'node_deleted':
        setNodes((prev) => {
          // Remove the node and all descendants
          const toRemove = new Set<string>()
          const addDescendants = (id: string) => {
            toRemove.add(id)
            prev.filter((n) => n.parent_id === id).forEach((n) => addDescendants(n.id))
          }
          addDescendants(msg.node_id)
          return prev.filter((n) => !toRemove.has(n.id))
        })
        break
      case 'presence':
        setPresenceUserIds(msg.user_ids)
        break
    }
  }, [])

  useWebSocket(listId, handleWsMessage)

  const tree = buildTree(nodes)
  const visibleNodes = getVisibleNodes(tree, collapsed)

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const addNode = useCallback(async (data: NodeCreate) => {
    if (!listId) return null
    const node = await nodesApi.createNode(listId, data)
    setNodes((prev) => [...prev, node])
    setFocusedId(node.id)

    // Register undo (delete the node)
    await execute({
      doAction: async () => {},  // already done
      undoAction: async () => {
        await nodesApi.deleteNode(listId, node.id)
        setNodes((prev) => prev.filter((n) => n.id !== node.id))
      },
    })
    return node
  }, [listId, execute])

  const updateNode = useCallback(async (nodeId: string, data: NodeUpdate) => {
    if (!listId) return
    const oldNode = nodes.find((n) => n.id === nodeId)
    const updated = await nodesApi.updateNode(listId, nodeId, data)
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? updated : n)))

    if (oldNode) {
      await execute({
        doAction: async () => {},
        undoAction: async () => {
          const restored = await nodesApi.updateNode(listId, nodeId, {
            text: oldNode.text,
            checked: oldNode.checked,
            notes: oldNode.notes,
            priority: oldNode.priority,
            due_date: oldNode.due_date,
          })
          setNodes((prev) => prev.map((n) => (n.id === nodeId ? restored : n)))
        },
      })
    }
  }, [listId, nodes, execute])

  const moveNodeAction = useCallback(async (nodeId: string, parentId: string | null, afterId: string | null) => {
    if (!listId) return
    const oldNode = nodes.find((n) => n.id === nodeId)
    const moved = await nodesApi.moveNode(listId, nodeId, { parent_id: parentId, after_id: afterId })
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? moved : n)))

    if (oldNode) {
      const oldParentId = oldNode.parent_id
      // Find old previous sibling for undo
      const oldSiblings = nodes
        .filter((n) => n.parent_id === oldParentId && n.id !== nodeId)
        .sort((a, b) => a.position - b.position)
      const oldIdx = oldSiblings.findIndex((s) => s.position > oldNode.position)
      const oldAfterId = oldIdx > 0 ? oldSiblings[oldIdx - 1].id : (oldIdx === 0 ? null : oldSiblings[oldSiblings.length - 1]?.id ?? null)

      await execute({
        doAction: async () => {},
        undoAction: async () => {
          const restored = await nodesApi.moveNode(listId, nodeId, { parent_id: oldParentId, after_id: oldAfterId })
          setNodes((prev) => prev.map((n) => (n.id === nodeId ? restored : n)))
        },
      })
    }
  }, [listId, nodes, execute])

  const removeNode = useCallback(async (nodeId: string) => {
    if (!listId) return
    await nodesApi.deleteNode(listId, nodeId)
    setNodes((prev) => {
      const toRemove = new Set<string>()
      const addDescendants = (id: string) => {
        toRemove.add(id)
        prev.filter((n) => n.parent_id === id).forEach((n) => addDescendants(n.id))
      }
      addDescendants(nodeId)
      return prev.filter((n) => !toRemove.has(n.id))
    })
  }, [listId])

  return {
    nodes,
    tree,
    visibleNodes,
    collapsed,
    focusedId,
    setFocusedId,
    presenceUserIds,
    loading,
    toggleCollapse,
    addNode,
    updateNode,
    moveNode: moveNodeAction,
    removeNode,
    undo,
    redo,
  }
}
