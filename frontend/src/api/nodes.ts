import { apiFetch } from './client'
import type { NodeCreate, NodeMove, NodeOut, NodeUpdate, SectionSearchResult, SectionResolveResult } from '../types'

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

export async function searchSections(query: string, listId?: string): Promise<SectionSearchResult[]> {
  const params = new URLSearchParams({ q: query })
  if (listId) params.set('list_id', listId)
  return apiFetch(`/sections/search?${params}`)
}

export async function resolveSection(name: string, listTitle?: string, currentListId?: string): Promise<SectionResolveResult> {
  const params = new URLSearchParams({ name })
  if (listTitle) params.set('list', listTitle)
  if (currentListId) params.set('current_list_id', currentListId)
  return apiFetch(`/sections/resolve?${params}`)
}
