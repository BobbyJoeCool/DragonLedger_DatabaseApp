import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { Modal } from '@/components/ui/Modal'

interface AddSourceDialogProps {
  onClose: () => void
}

// Creates a MANUAL source — POST /api/sources (Phase 1.2).
export function AddSourceDialog({ onClose }: AddSourceDialogProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await apiFetch('/api/sources', {
      method: 'POST',
      body: JSON.stringify({ name, description: description || undefined }),
    })
    if (res.ok) {
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
      onClose()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to create source.')
    }
    setSaving(false)
  }

  return (
    <Modal title="Add Source" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
