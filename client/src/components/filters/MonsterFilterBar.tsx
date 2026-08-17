import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const inputClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

const CR_VALUES = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '30',
] as const

const CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface MonsterFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

export function MonsterFilterBar({ filters, onChange }: MonsterFilterBarProps) {
  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <select
        value={filters.extra.cr ?? ''}
        onChange={(e) => setExtra('cr', e.target.value)}
        className={inputClass}
      >
        <option value="">Any CR</option>
        {CR_VALUES.map((cr) => (
          <option key={cr} value={cr}>
            CR {cr}
          </option>
        ))}
      </select>
      <select
        value={filters.extra.type ?? ''}
        onChange={(e) => setExtra('type', e.target.value)}
        className={inputClass}
      >
        <option value="">Any type</option>
        {CREATURE_TYPES.map((t) => (
          <option key={t} value={t}>
            {titleCase(t)}
          </option>
        ))}
      </select>
    </FilterBarShell>
  )
}
