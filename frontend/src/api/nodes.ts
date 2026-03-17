import { apiFetch } from './client'
import type { NodeCreate, NodeMove, NodeOut, NodeUpdate } from '../types'

export async function getNodes(listId: string): Promise<NodeOut[]> {
  return apiFetch(`/lists/${listId}/nodes`)
}

export async function createNode(listId: string, data: NodeCreate): Promise<NodeOut> {
  return apiFetch(`/lists/${listId}/nodes`, { method: 'POST', body: JSON.stringify(data) })
}

export async function getNode(listId: string, nodeId: string): Promise<NodeOut> {
  return apiFetch(`/lists/${listId}/nodes/${nodeId}`)
}

export async function updateNode(listId: string, nodeId: string, data: NodeUpdate): Promise<NodeOut> {
  return apiFetch(`/lists/${listId}/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function moveNode(listId: string, nodeId: string, data: NodeMove): Promise<NodeOut> {
  return apiFetch(`/lists/${listId}/nodes/${nodeId}/move`, { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteNode(listId: string, nodeId: string): Promise<void> {
  return apiFetch(`/lists/${listId}/nodes/${nodeId}`, { method: 'DELETE' })
}
