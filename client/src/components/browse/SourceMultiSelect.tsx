import { useEffect, useRef, useState } from 'react'
import { useSources } from '@/hooks/useSources'

interface SourceMultiSelectProps {
  // Empty array is the canonical "all sources" state (Decision 1.6:
  // all-checked default) — mirrors the server's sourceWhere([]) = no filter.
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

// Custom-built (not shadcn's stock single-select dropdown, per Decision 1.6)
// checkbox multi-select. The live db has 1,000+ Source rows (one per
// Compendium book) — the design doc assumed a handful ("SRD-2024 and
// Homebrew"), so a bare unfiltered checkbox list would be impractical.
// Adds a search-to-filter box within the popover to keep it usable; this is
// a rendering-only concern (filters which checkboxes are drawn), not a
// change to the actual content query.
export function SourceMultiSelect({ selectedIds, onChange }: SourceMultiSelectProps) {
  const { data: sources, isLoading } = useSources()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const allIds = sources?.map((s) => s.id) ?? []
  const isAllSelected = selectedIds.length === 0
  const checkedIds = isAllSelected ? allIds : selectedIds

  function toggle(id: string) {
    const next = checkedIds.includes(id) ? checkedIds.filter((x) => x !== id) : [...checkedIds, id]
    onChange(next.length === allIds.length ? [] : next)
  }

  const filteredSources = (sources ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  )

  const summary = isAllSelected
    ? 'All sources'
    : selectedIds.length === 1
      ? (sources?.find((s) => s.id === selectedIds[0])?.name ?? '1 source')
      : `${selectedIds.length} sources`

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isLoading}
        className="rounded-md border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
      >
        {isLoading ? 'Loading sources…' : summary}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter sources…"
            autoFocus
            className="mb-2 w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {!isAllSelected && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-2 text-xs text-primary hover:underline"
            >
              Select all
            </button>
          )}
          <div className="max-h-64 overflow-y-auto">
            {filteredSources.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">No matching sources.</p>
            )}
            {filteredSources.map((source) => (
              <label
                key={source.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={checkedIds.includes(source.id)}
                  onChange={() => toggle(source.id)}
                  className="accent-primary"
                />
                <span className="truncate" title={source.name}>
                  {source.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
