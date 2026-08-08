import { FilterBarShell } from './FilterBarShell'
import type { ContentFilters } from '@/lib/contentQuery'

interface ConditionFilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

// Source + name search only — no extra filters (outline.md §3.2).
export function ConditionFilterBar({ filters, onChange }: ConditionFilterBarProps) {
  return <FilterBarShell filters={filters} onChange={onChange} />
}
