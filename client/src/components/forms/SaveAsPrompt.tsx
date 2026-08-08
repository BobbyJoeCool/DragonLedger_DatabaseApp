import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SourcePicker } from './SourcePicker'

export interface SaveAsChoice {
  saveAs: 'original' | 'homebrew'
  targetSourceId?: string
}

interface SaveAsPromptProps {
  onClose: () => void
  onConfirm: (choice: SaveAsChoice) => void
  saving: boolean
}

// Phase 7 §1.4 — shown when a non-correctable field goes dirty. "Original"
// overwrites the official entry in place (Phase 4 §1.9's saveAs: "original");
// "homebrew" duplicates into a MANUAL source, original left untouched.
export function SaveAsPrompt({ onClose, onConfirm, saving }: SaveAsPromptProps) {
  const [targetSourceId, setTargetSourceId] = useState('')

  return (
    <Modal title="Save changes" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This edit changes a field that can't be corrected in place on this entry. Overwrite the
          original, or save your changes as a new homebrew copy instead?
        </p>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Save as homebrew copy</p>
          <SourcePicker value={targetSourceId} onChange={setTargetSourceId} />
          <button
            type="button"
            disabled={saving || !targetSourceId}
            onClick={() => onConfirm({ saveAs: 'homebrew', targetSourceId })}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save as Homebrew'}
          </button>
        </div>

        <div className="flex justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onConfirm({ saveAs: 'original' })}
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Overwrite Original'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
