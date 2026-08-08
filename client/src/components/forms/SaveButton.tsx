import { useState } from 'react'
import type { Source } from '@/hooks/useSources'
import { isEditCorrectable, type WritableContentType } from '@/lib/correctability'
import { SaveAsPrompt, type SaveAsChoice } from './SaveAsPrompt'

interface SaveButtonProps {
  contentType: WritableContentType
  // The entry's current Source.type — null in create mode, where there's no
  // existing entry to correct in place, so the button always just saves.
  sourceType: Source['type'] | null
  dirtyFields: string[]
  saving: boolean
  onSave: (choice?: SaveAsChoice) => void
}

// Phase 7 §1.4/§1.6 — the whole-form Save/Save-As button. Label and
// behavior update live as dirtyFields changes: correctable throughout ⇒
// "Save", submits in place; any locked field dirty ⇒ "Save as...", opens
// SaveAsPrompt instead of submitting directly.
export function SaveButton({ contentType, sourceType, dirtyFields, saving, onSave }: SaveButtonProps) {
  const [promptOpen, setPromptOpen] = useState(false)

  const canSaveDirectly =
    sourceType === null || isEditCorrectable(contentType, sourceType, dirtyFields)

  return (
    <>
      <button
        type="button"
        disabled={saving || dirtyFields.length === 0}
        onClick={() => (canSaveDirectly ? onSave() : setPromptOpen(true))}
        className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {saving ? 'Saving…' : canSaveDirectly ? 'Save' : 'Save as…'}
      </button>

      {promptOpen && (
        <SaveAsPrompt
          saving={saving}
          onClose={() => setPromptOpen(false)}
          onConfirm={(choice: SaveAsChoice) => {
            onSave(choice)
            setPromptOpen(false)
          }}
        />
      )}
    </>
  )
}
