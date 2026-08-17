import type { SelectionState } from '@/hooks/useSelection'

interface BulkActionBarProps {
  selection: SelectionState
  isSignedIn: boolean
  onDelete: () => void
  onExport: () => void
  onPrint: () => void
}

export function BulkActionBar({ selection, isSignedIn, onDelete, onExport, onPrint }: BulkActionBarProps) {
  if (selection.count === 0) return null

  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-lg border bg-popover px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">{selection.count} selected</span>
      <div className="h-4 w-px bg-border" />
      <button
        type="button"
        onClick={onExport}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      >
        Export JSON
      </button>
      <button
        type="button"
        onClick={onPrint}
        className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
      >
        Print as Cards
      </button>
      {isSignedIn && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        >
          Delete
        </button>
      )}
      <button
        type="button"
        onClick={selection.clearAll}
        className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    </div>
  )
}
