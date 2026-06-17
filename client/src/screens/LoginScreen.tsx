import { useState } from 'react'
import { useNavigate } from 'react-router'
import { apiFetch } from '@/api/client'

export function LoginScreen() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await apiFetch('/api/auth/check', {
      method: 'POST',
      headers: { 'x-app-password': password },
    })

    if (res.ok) {
      sessionStorage.setItem('app-password', password)
      navigate('/browse', { replace: true })
    } else {
      setError('Incorrect password.')
    }

    setLoading(false)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 rounded-lg border p-8">
        <div>
          <h1 className="text-xl font-semibold">DragonLedger</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the app password to enable editing.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
