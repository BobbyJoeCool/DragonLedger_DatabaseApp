import type { ReactNode } from 'react'
import { NameSearchInput } from '@/components/browse/NameSearchInput'
import { SourceMultiSelect } from '@/components/browse/SourceMultiSelect'
import type { ContentFilters } from '@/lib/contentQuery'

interface FilterBarShellProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
  children?: ReactNode
}

// Not one of the 8 hand-built <Type>FilterBars itself (Decision 1.3 keeps
// those separate, direct-to-edit files) — just the Source+Name baseline
// every one of them composes, so that repeated pair isn't retyped 8 times.
export function FilterBarShell({ filters, onChange, children }: FilterBarShellProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SourceMultiSelect
        selectedIds={filters.sourceIds}
        onChange={(sourceIds) => onChange({ ...filters, sourceIds })}
      />
      <NameSearchInput
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
      />
      {children}
    </div>
  )
}
