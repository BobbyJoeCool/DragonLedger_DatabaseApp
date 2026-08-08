import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { Modal } from '@/components/ui/Modal'
import type { Source } from '@/hooks/useSources'

interface DeleteSourceDialogProps {
  source: Source
  onClose: () => void
}

// DELETE /api/sources/:id (Phase 1.2/4) — removes the source and cascades to
// its own content; cross-source dependents are orphaned, not deleted, and
// listed in the response's warnings[].
export function DeleteSourceDialog({ source, onClose }: DeleteSourceDialogProps) {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[] | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const res = await apiFetch(`/api/sources/${source.id}`, { method: 'DELETE' })
    if (res.status === 200) {
      const body = await res.json()
      if (body.warnings?.length > 0) {
        setWarnings(body.warnings)
        await queryClient.invalidateQueries({ queryKey: ['sources'] })
      } else {
        await queryClient.invalidateQueries({ queryKey: ['sources'] })
        onClose()
      }
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to delete source.')
    }
    setDeleting(false)
  }

  if (warnings) {
    return (
      <Modal title={`"${source.name}" deleted`} onClose={onClose}>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Some cross-source content was orphaned:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
            Close
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Delete "${source.name}"?`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        This will permanently delete this source and its {source.entryCount}{' '}
        {source.entryCount === 1 ? 'entry' : 'entries'}. This cannot be undone.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={deleting}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  )
}
