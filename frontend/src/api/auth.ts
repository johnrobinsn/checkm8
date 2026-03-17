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
