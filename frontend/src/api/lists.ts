import { apiFetch } from './client'
import type { TodoList } from '../types'

export async function getLists(includeArchived = false, q?: string): Promise<TodoList[]> {
  const params = new URLSearchParams()
  if (includeArchived) params.set('include_archived', 'true')
  if (q) params.set('q', q)
  const qs = params.toString()
  return apiFetch(`/lists${qs ? `?${qs}` : ''}`)
}

export async function getList(id: string): Promise<TodoList> {
  return apiFetch(`/lists/${id}`)
}

export async function createList(title: string): Promise<TodoList> {
  return apiFetch('/lists', { method: 'POST', body: JSON.stringify({ title }) })
}

export async function updateList(id: string, title: string): Promise<TodoList> {
  return apiFetch(`/lists/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export async function archiveList(id: string): Promise<TodoList> {
  return apiFetch(`/lists/${id}/archive`, { method: 'POST' })
}

export async function restoreList(id: string): Promise<TodoList> {
  return apiFetch(`/lists/${id}/restore`, { method: 'POST' })
}

export async function deleteList(id: string): Promise<void> {
  return apiFetch(`/lists/${id}`, { method: 'DELETE' })
}
