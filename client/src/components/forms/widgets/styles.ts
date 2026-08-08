// Shared Tailwind class strings for the JSON-shape widgets (Phase 7 §4) —
// matches the literal classNames already used throughout Modal.tsx,
// SourceMultiSelect.tsx, AddSourceDialog.tsx. Purely presentational; each
// widget still owns its own markup/behavior (Phase 7 §1.1 rejects a
// generic config-driven form engine, not shared CSS strings).
export const fieldInput =
  'w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring'
export const fieldLabel = 'mb-1 block text-xs font-medium text-muted-foreground'
export const rowCard = 'space-y-2 rounded-md border p-3'
export const smallButton =
  'rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50'
export const primarySmallButton =
  'rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50'
export const removeButton = 'text-xs text-destructive hover:underline disabled:opacity-50'
export const sectionTitle = 'text-sm font-medium'
