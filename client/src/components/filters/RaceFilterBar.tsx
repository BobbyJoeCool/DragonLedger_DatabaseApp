import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

interface RaceFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Source + name search only — no extra filters (outline.md §3.2).
export function RaceFilterBar({ filters, onChange }: RaceFilterBarProps) {
  return <FilterBarShell filters={filters} onChange={onChange} />
}
