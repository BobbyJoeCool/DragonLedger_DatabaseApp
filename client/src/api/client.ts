const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }

  if (MUTATING.has(method)) {
    const password = sessionStorage.getItem('app-password')
    if (password) headers['x-app-password'] = password
  }

  return fetch(path, { ...init, headers })
}
