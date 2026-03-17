import { apiFetch } from './client'
import type { Permission, Share } from '../types'

export async function createShare(listId: string, permission: Permission = 'read'): Promise<Share> {
  return apiFetch(`/lists/${listId}/shares`, { method: 'POST', body: JSON.stringify({ permission }) })
}

export async function getShares(listId: string): Promise<Share[]> {
  return apiFetch(`/lists/${listId}/shares`)
}

export async function revokeShare(listId: string, shareId: string): Promise<void> {
  return apiFetch(`/lists/${listId}/shares/${shareId}`, { method: 'DELETE' })
}

export async function claimShare(shareToken: string): Promise<{ list_id: string; permission: Permission }> {
  return apiFetch(`/shares/claim/${shareToken}`, { method: 'POST' })
}
