import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { apiFetch } from '@/api/client'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { useContentDetail } from '@/hooks/useContentDetail'
import { apiPath } from '@/lib/contentQuery'
import { CONTENT_TYPE_SINGULAR, isContentType } from '@/lib/contentTypes'

interface DependentEntry {
  type: string
  id: string
  name: string
}

type DeleteState =
  | { step: 'idle' }
  | {
      step: 'confirming'
      dependents: { willDelete: DependentEntry[]; willOrphan: DependentEntry[] } | null
    }
  | { step: 'deleting' }

export function DetailScreen() {
  const { type: rawType, id } = useParams()
  const navigate = useNavigate()
  const [deleteState, setDeleteState] = useState<DeleteState>({ step: 'idle' })
  const isSignedIn = Boolean(sessionStorage.getItem('app-password'))

  const type = rawType && isContentType(rawType) ? rawType : undefined
  const {
    data: entry,
    isLoading,
    isError,
  } = useContentDetail(type ?? 'spells', type ? id : undefined)

  if (!type) {
    return <p className="text-sm text-destructive">Unknown content type "{rawType}".</p>
  }

  const label = CONTENT_TYPE_SINGULAR[type]

  async function requestDelete() {
    const res = await apiFetch(`${apiPath(type!)}/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({}),
    })
    if (res.status === 409) {
      const body = await res.json()
      setDeleteState({ step: 'confirming', dependents: body.error.dependents })
    } else {
      // 400 CONFIRM_REQUIRED (no dependents) — nothing to show beyond the
      // generic confirmation.
      setDeleteState({ step: 'confirming', dependents: null })
    }
  }

  async function confirmDelete() {
    setDeleteState({ step: 'deleting' })
    const res = await apiFetch(`${apiPath(type!)}/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    })
    if (res.status === 204) {
      navigate('/browse')
    } else {
      setDeleteState({ step: 'idle' })
    }
  }

  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted-foreground">
        <Link to="/browse" className="hover:underline">
          Browse
        </Link>
        {' → '}
        <span>{label}</span>
        {' → '}
        <span className="text-foreground">
          {isLoading ? '…' : ((entry?.name as string | undefined) ?? 'Not found')}
        </span>
      </nav>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-sm text-destructive">Failed to load this {label.toLowerCase()}.</p>
      )}
      {!isLoading && !isError && entry === null && (
        <div className="rounded-md border p-6 text-center">
          <h2 className="text-lg font-semibold">404 — {label} not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This entry may have been deleted or the link is out of date.
          </p>
        </div>
      )}

      {entry && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{entry.name as string}</h2>
              <div className="mt-2">
                <SourceBadge sourceId={entry.sourceId as string} />
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={!isSignedIn}
                title={isSignedIn ? 'Coming in Phase 7' : 'Sign in to edit'}
                className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={!isSignedIn}
                onClick={requestDelete}
                title={isSignedIn ? undefined : 'Sign in to delete'}
                className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Placeholder card — the full-content, printable <Type>DetailFields
              layout is deferred to its own design session (tasks.md Phase 5
              item 11); this just dumps every field so nothing is hidden. */}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 rounded-md border p-4 text-sm">
            {Object.entries(entry)
              .filter(([key]) => !['id', 'name', 'sourceId', 'slug'].includes(key))
              .map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="wrap-break-word">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </dd>
                </div>
              ))}
          </dl>
        </>
      )}

      {deleteState.step !== 'idle' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md space-y-3 rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg">
            <h3 className="text-lg font-semibold">Delete this {label.toLowerCase()}?</h3>
            {deleteState.step === 'confirming' && deleteState.dependents && (
              <div className="space-y-2 text-sm">
                {deleteState.dependents.willDelete.length > 0 && (
                  <p>
                    <span className="font-medium">Also deleted</span> (official, replaceable on
                    refresh): {deleteState.dependents.willDelete.map((d) => d.name).join(', ')}
                  </p>
                )}
                {deleteState.dependents.willOrphan.length > 0 && (
                  <p>
                    <span className="font-medium">Orphaned, not deleted</span> (homebrew):{' '}
                    {deleteState.dependents.willOrphan.map((d) => d.name).join(', ')}
                  </p>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteState({ step: 'idle' })}
                disabled={deleteState.step === 'deleting'}
                className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteState.step === 'deleting'}
                className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50"
              >
                {deleteState.step === 'deleting' ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
