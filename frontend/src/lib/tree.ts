import type { NodeOut, TreeNode } from '../types'

export function buildTree(nodes: NodeOut[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Create TreeNode wrappers (skip archived nodes)
  for (const node of nodes) {
    if (node.archived) continue
    map.set(node.id, { ...node, children: [], depth: 0 })
  }

  // Build parent-child relationships
  for (const node of nodes) {
    const treeNode = map.get(node.id)!
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id)!
      treeNode.depth = parent.depth + 1
      parent.children.push(treeNode)
    } else {
      roots.push(treeNode)
    }
  }

  // Sort children by position, pinned sections first
  const sortChildren = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      // Pinned sections float to top
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.position - b.position
    })
    for (const n of nodes) sortChildren(n.children)
  }
  sortChildren(roots)

  // Recalculate depths
  const setDepths = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth
      setDepths(n.children, depth + 1)
    }
  }
  setDepths(roots, 0)

  return roots
}

export function getVisibleNodes(
  tree: TreeNode[],
  collapsed: Set<string>,
): TreeNode[] {
  const result: TreeNode[] = []
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      result.push(node)
      if (!collapsed.has(node.id)) {
        walk(node.children)
      }
    }
  }
  walk(tree)
  return result
}

export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

export function getNodeDepth(nodes: NodeOut[], nodeId: string): number {
  const map = new Map(nodes.map((n) => [n.id, n]))
  let depth = 0
  let current = map.get(nodeId)
  while (current?.parent_id) {
    depth++
    current = map.get(current.parent_id)
  }
  return depth
}

export function getPreviousSibling(
  nodes: NodeOut[],
  nodeId: string,
): NodeOut | null {
  const node = nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const siblings = nodes
    .filter((n) => n.parent_id === node.parent_id)
    .sort((a, b) => a.position - b.position)
  const idx = siblings.findIndex((s) => s.id === nodeId)
  return idx > 0 ? siblings[idx - 1] : null
}

export function getLastChild(tree: TreeNode[], nodeId: string): TreeNode | null {
  const node = findNode(tree, nodeId)
  if (!node || node.children.length === 0) return null
  return node.children[node.children.length - 1]
}

export function getDueDateColor(dueDate: string | null): string {
  if (!dueDate) return ''
  const now = new Date()
  const due = new Date(dueDate + 'T00:00:00')
  const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'text-red-500 dark:text-red-400'
  if (diffDays <= 1) return 'text-yellow-500 dark:text-yellow-400'
  return 'text-gray-500 dark:text-gray-400'
}

export function getPriorityColor(priority: string | null): string {
  switch (priority) {
    case 'high': return 'bg-red-500'
    case 'medium': return 'bg-yellow-500'
    case 'low': return 'bg-green-500'
    default: return ''
  }
}
