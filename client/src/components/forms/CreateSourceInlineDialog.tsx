import { AddSourceDialog } from '@/components/sources/AddSourceDialog'

interface CreateSourceInlineDialogProps {
  onClose: () => void
  onCreated: (source: { id: string; name: string }) => void
}

// Phase 7 §2/§5 — "no MANUAL source exists" fallback, invoked from
// SourcePicker. Thin wrapper: same create-a-MANUAL-source flow as
// SourcesScreen's AddSourceDialog, just also selects the new source in the
// picker that opened it.
export function CreateSourceInlineDialog({ onClose, onCreated }: CreateSourceInlineDialogProps) {
  return <AddSourceDialog onClose={onClose} onCreated={onCreated} />
}
