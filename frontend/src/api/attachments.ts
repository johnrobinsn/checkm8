import { getToken, clearToken } from './client'
import { apiFetch } from './client'
import type { Attachment } from '../types'

const API_BASE = '/api'

export async function uploadAttachment(
  listId: string,
  nodeId: string,
  file: File,
): Promise<Attachment> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)

  const resp = await fetch(
    `${API_BASE}/lists/${listId}/nodes/${nodeId}/attachments`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    },
  )

  if (resp.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${resp.status}`)
  }
  return resp.json()
}

export async function getAttachments(
  listId: string,
  nodeId: string,
): Promise<Attachment[]> {
  return apiFetch<Attachment[]>(`/lists/${listId}/nodes/${nodeId}/attachments`)
}

export async function deleteAttachment(
  listId: string,
  nodeId: string,
  attachmentId: string,
): Promise<void> {
  return apiFetch<void>(
    `/lists/${listId}/nodes/${nodeId}/attachments/${attachmentId}`,
    { method: 'DELETE' },
  )
}
