import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

interface BackgroundFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Source + name search only — no extra filters (outline.md §3.2).
export function BackgroundFilterBar({ filters, onChange }: BackgroundFilterBarProps) {
  return <FilterBarShell filters={filters} onChange={onChange} />
}
