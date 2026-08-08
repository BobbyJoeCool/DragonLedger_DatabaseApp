import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const inputClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

interface MonsterFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Extra filters per outline.md §3.2: cr, type (creature type)
export function MonsterFilterBar({ filters, onChange }: MonsterFilterBarProps) {
  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <input
        type="text"
        value={filters.extra.cr ?? ''}
        onChange={(e) => setExtra('cr', e.target.value)}
        placeholder="CR (e.g. 1/8, 5)"
        className={inputClass}
      />
      <input
        type="text"
        value={filters.extra.type ?? ''}
        onChange={(e) => setExtra('type', e.target.value)}
        placeholder="Creature type (e.g. dragon)"
        className={inputClass}
      />
    </FilterBarShell>
  )
}
