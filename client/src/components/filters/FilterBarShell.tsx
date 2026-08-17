import type { ReactNode } from 'react'
import { NameSearchInput } from '@/components/browse/NameSearchInput'
import { SourceMultiSelect } from '@/components/browse/SourceMultiSelect'
import type { ContentFilters } from '@/lib/contentQuery'

const SOURCE_TYPES = [
  { value: 'API', label: 'Open5e SRD' },
  { value: 'FILE', label: 'File Import' },
  { value: 'MANUAL', label: 'Homebrew' },
] as const

const selectClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

interface FilterBarShellProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
  children?: ReactNode
}

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
      <select
        value={filters.sourceType}
        onChange={(e) => onChange({ ...filters, sourceType: e.target.value })}
        className={selectClass}
      >
        <option value="">Any import</option>
        {SOURCE_TYPES.map((st) => (
          <option key={st.value} value={st.value}>
            {st.label}
          </option>
        ))}
      </select>
      {children}
    </div>
  )
}
