import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const inputClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

interface ItemFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Extra filters per outline.md §3.2: type, rarity
export function ItemFilterBar({ filters, onChange }: ItemFilterBarProps) {
  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <input
        type="text"
        value={filters.extra.type ?? ''}
        onChange={(e) => setExtra('type', e.target.value)}
        placeholder="Type (e.g. weapon)"
        className={inputClass}
      />
      <input
        type="text"
        value={filters.extra.rarity ?? ''}
        onChange={(e) => setExtra('rarity', e.target.value)}
        placeholder="Rarity (e.g. rare)"
        className={inputClass}
      />
    </FilterBarShell>
  )
}
