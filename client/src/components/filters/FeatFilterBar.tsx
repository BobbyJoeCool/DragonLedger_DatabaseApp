import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const inputClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

// The only per-type extra filter with a real closed set of values
// (server/src/schemas/content/feat.ts), unlike school/type/rarity elsewhere
// which are free text — a select fits here specifically.
const CATEGORIES = ['GENERAL', 'ORIGIN', 'FIGHTING_STYLE', 'EPIC_BOON', 'CLASS_SPECIFIC'] as const

interface FeatFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Extra filter per outline.md §3.2: category
export function FeatFilterBar({ filters, onChange }: FeatFilterBarProps) {
  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <select
        value={filters.extra.category ?? ''}
        onChange={(e) => setExtra('category', e.target.value)}
        className={inputClass}
      >
        <option value="">Any category</option>
        {CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </FilterBarShell>
  )
}
