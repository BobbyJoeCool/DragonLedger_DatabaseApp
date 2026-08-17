import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

const inputClass =
  'rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

const ITEM_TYPES = [
  'adventuring-gear',
  'ammunition',
  'armor',
  'equipment-pack',
  'heavy-armor',
  'land-vehicle',
  'light-armor',
  'medium-armor',
  'mount',
  'potion',
  'ring',
  'rod',
  'scroll',
  'shield',
  'spellcasting-focus',
  'staff',
  'tools',
  'wand',
  'waterborne-vehicle',
  'weapon',
  'wondrous-item',
] as const

const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
] as const

function formatSlug(s: string) {
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

interface ItemFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

export function ItemFilterBar({ filters, onChange }: ItemFilterBarProps) {
  function setExtra(key: string, value: string) {
    onChange({ ...filters, extra: { ...filters.extra, [key]: value } })
  }

  return (
    <FilterBarShell filters={filters} onChange={onChange}>
      <select
        value={filters.extra.type ?? ''}
        onChange={(e) => setExtra('type', e.target.value)}
        className={inputClass}
      >
        <option value="">Any type</option>
        {ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {formatSlug(t)}
          </option>
        ))}
      </select>
      <select
        value={filters.extra.rarity ?? ''}
        onChange={(e) => setExtra('rarity', e.target.value)}
        className={inputClass}
      >
        <option value="">Any rarity</option>
        {RARITIES.map((r) => (
          <option key={r} value={r}>
            {formatSlug(r)}
          </option>
        ))}
      </select>
    </FilterBarShell>
  )
}
