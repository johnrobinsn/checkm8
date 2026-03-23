import { apiFetch } from './client'
import type { AutocompleteSuggestion, ListSettings, TodoList } from '../types'

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

export async function getSettings(listId: string): Promise<ListSettings> {
  return apiFetch(`/lists/${listId}/settings`)
}

export async function updateSettings(listId: string, settings: Partial<ListSettings>): Promise<ListSettings> {
  return apiFetch(`/lists/${listId}/settings`, { method: 'PATCH', body: JSON.stringify(settings) })
}

export async function archiveCompleted(listId: string): Promise<{ archived_count: number; archived_ids: string[] }> {
  return apiFetch(`/lists/${listId}/archive-completed`, { method: 'POST' })
}

export async function clearArchived(listId: string): Promise<{ deleted_count: number }> {
  return apiFetch(`/lists/${listId}/archived`, { method: 'DELETE' })
}

export async function getAutocomplete(listId: string, query: string): Promise<AutocompleteSuggestion[]> {
  return apiFetch(`/lists/${listId}/nodes/autocomplete?q=${encodeURIComponent(query)}`)
}
