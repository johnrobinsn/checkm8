import { apiFetch } from './client'
import type { User } from '../types'

export async function getGoogleLoginUrl(): Promise<{ url: string }> {
  return apiFetch('/auth/google/login')
}

export async function getMe(): Promise<User> {
  return apiFetch('/auth/me')
}

export async function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' })
}

// API Token management
export interface ApiToken {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
}

export interface ApiTokenCreated extends ApiToken {
  token: string
}

export async function getTokens(): Promise<ApiToken[]> {
  return apiFetch('/auth/tokens')
}

export async function createToken(name: string): Promise<ApiTokenCreated> {
  return apiFetch('/auth/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function deleteToken(tokenId: string): Promise<void> {
  return apiFetch(`/auth/tokens/${tokenId}`, { method: 'DELETE' })
}
