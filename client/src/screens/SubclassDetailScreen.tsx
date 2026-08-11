import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { apiFetch } from '@/api/client'
import { SubclassCard } from '@/components/content/SubclassCard'
import { ThemeSelect } from '@/components/cards/ThemeSelect'
import { CardThemeProvider, type CardThemeName } from '@/components/cards/shared'

// /browse/subclasses/:id — Subclass is nested-only (reached from a Class's
// card), same pattern as SubraceDetailScreen.
export function SubclassDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cardTheme, setCardTheme] = useState<CardThemeName>('parchment')
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  const { data: entry, isLoading } = useQuery({
    queryKey: ['subclass-detail', id],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const res = await apiFetch(`/api/subclasses/${id}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to load subclass')
      return res.json() as Promise<Record<string, unknown>>
    },
  })

  async function confirmDelete() {
    setDeleting(true)
    const res = await apiFetch(`/api/subclasses/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    })
    if (res.status === 204) {
      await queryClient.invalidateQueries({ queryKey: ['subclasses-of-class'] })
      navigate('/browse')
    } else {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted-foreground">
        <Link to="/browse" className="hover:underline">
          Browse
        </Link>
        {' → '}
        <span>Subclass</span>
        {' → '}
        <span className="text-foreground">
          {isLoading ? '…' : ((entry?.name as string | undefined) ?? 'Not found')}
        </span>
      </nav>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && entry === null && (
        <div className="rounded-md border p-6 text-center">
          <h2 className="text-lg font-semibold">404 — Subclass not found</h2>
        </div>
      )}

      {entry && (
        <>
          <div className="flex justify-end gap-2">
            <ThemeSelect value={cardTheme} onChange={setCardTheme} />
            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => navigate(`/browse/subclasses/${id}/edit`)}
              className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={!isSignedIn}
              onClick={() => setConfirming(true)}
              className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          <CardThemeProvider theme={cardTheme}>
            <SubclassCard subclass={entry as unknown as import('@dragonledger/content-types').Subclass} />
          </CardThemeProvider>
        </>
      )}

      {confirming && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg">
            <h3 className="text-lg font-semibold">Delete this subclass?</h3>
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
