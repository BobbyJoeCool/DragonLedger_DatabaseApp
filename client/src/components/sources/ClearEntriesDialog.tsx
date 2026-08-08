import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import type { Source } from '@/hooks/useSources'

interface ClearEntriesDialogProps {
  source: Source
  onClose: () => void
}

// DELETE /api/sources/:id/entries (Phase 4 §1.8) — bulk-clear, heavier
// confirmation than a single delete proportional to blast radius: the user
// must type the source's exact name.
export function ClearEntriesDialog({ source, onClose }: ClearEntriesDialogProps) {
  const queryClient = useQueryClient()
  const [confirmName, setConfirmName] = useState('')
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ deletedCount: number; warnings: string[] } | null>(null)

  async function handleClear() {
    setClearing(true)
    setError('')
    const res = await apiFetch(`/api/sources/${source.id}/entries`, {
      method: 'DELETE',
      body: JSON.stringify({ confirmName }),
    })
    if (res.ok) {
      const body = await res.json()
      setResult(body)
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error?.message ?? 'Failed to clear entries.')
    }
    setClearing(false)
  }

  if (result) {
    return (
      <Modal title="Entries cleared" onClose={onClose}>
        <p className="text-sm">
          Deleted {result.deletedCount} {result.deletedCount === 1 ? 'entry' : 'entries'} from "{source.name}".
        </p>
        {result.warnings.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Some cross-source content was orphaned:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
            Close
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Clear all entries in "${source.name}"?`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        This deletes all {source.entryCount} {source.entryCount === 1 ? 'entry' : 'entries'} in this source. The
        source itself stays — this is not the same as deleting it. This cannot be undone.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Type <span className="font-mono">{source.name}</span> to confirm
        </label>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoFocus
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={clearing}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing || confirmName !== source.name}
          className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50"
        >
          {clearing ? 'Clearing…' : 'Clear Entries'}
        </button>
      </div>
    </Modal>
  )
}
