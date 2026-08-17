import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const selectClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

const SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface SpellFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

export function SpellFilterBar({ filters, onChange }: SpellFilterBarProps) {
  const classNamesQuery = useQuery({
    queryKey: ['class-names-for-filter'],
    queryFn: async () => {
      const res = await apiFetch('/api/classes?fields=name')
      if (!res.ok) throw new Error('Failed to load classes')
      const rows = (await res.json()) as { id: string; name: string }[]
      return [...new Set(rows.map((r) => r.name))].sort()
    },
    staleTime: 60_000,
  })

  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <select
        value={filters.extra.level ?? ''}
        onChange={(e) => setExtra('level', e.target.value)}
        className={selectClass}
      >
        <option value="">Any level</option>
        <option value="0">Cantrip</option>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((level) => (
          <option key={level} value={level}>
            Level {level}
          </option>
        ))}
      </select>
      <select
        value={filters.extra.school ?? ''}
        onChange={(e) => setExtra('school', e.target.value)}
        className={selectClass}
      >
        <option value="">Any school</option>
        {SCHOOLS.map((school) => (
          <option key={school} value={school}>
            {titleCase(school)}
          </option>
        ))}
      </select>
      <select
        value={filters.extra.class ?? ''}
        onChange={(e) => setExtra('class', e.target.value)}
        className={selectClass}
      >
        <option value="">Any class</option>
        {(classNamesQuery.data ?? []).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </FilterBarShell>
  )
}
