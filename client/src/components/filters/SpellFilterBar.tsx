import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const inputClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

interface SpellFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Extra filters per outline.md §3.2: level, school, class
export function SpellFilterBar({ filters, onChange }: SpellFilterBarProps) {
  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <select
        value={filters.extra.level ?? ''}
        onChange={(e) => setExtra('level', e.target.value)}
        className={inputClass}
      >
        <option value="">Any level</option>
        <option value="0">Cantrip</option>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((level) => (
          <option key={level} value={level}>
            Level {level}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={filters.extra.school ?? ''}
        onChange={(e) => setExtra('school', e.target.value)}
        placeholder="School (e.g. evocation)"
        className={inputClass}
      />
      <input
        type="text"
        value={filters.extra.class ?? ''}
        onChange={(e) => setExtra('class', e.target.value)}
        placeholder="Class (e.g. Wizard)"
        className={inputClass}
      />
    </FilterBarShell>
  )
}
