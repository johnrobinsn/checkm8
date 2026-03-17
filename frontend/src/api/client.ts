const API_BASE = '/api'

export function getToken(): string | null {
  return localStorage.getItem('checkm8_token')
}

export function setToken(token: string) {
  localStorage.setItem('checkm8_token', token)
}

export function clearToken() {
  localStorage.removeItem('checkm8_token')
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (resp.status === 401) {
    clearToken()
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (resp.status === 204) {
    return undefined as T
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${resp.status}`)
  }

  return resp.json()
}
