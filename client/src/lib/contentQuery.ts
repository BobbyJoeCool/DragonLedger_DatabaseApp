import { CONTENT_TYPE_API_PATH, type ContentType } from './contentTypes'

export const PAGE_LIMIT = 50

// One filter slice per content type, per outline.md §5.4's BrowseState shape.
// `extra` holds type-specific fields (e.g. { level, school } for Spells) —
// each <Type>FilterBar owns its own keys, this stays generic.
export interface ContentFilters {
  sourceIds: string[]
  sourceType: string
  edition: string
  query: string
  extra: Record<string, string>
}

export function defaultFilters(): ContentFilters {
  return { sourceIds: [], sourceType: '', edition: '', query: '', extra: {} }
}

export interface ContentListItem {
  id: string
  name: string
  sourceId: string
  [key: string]: unknown
}

export interface ContentPage {
  data: ContentListItem[]
  total: number
  page: number
  limit: number
}

export interface NameIndexEntry {
  id: string
  name: string
}

// Shared param-building for both the full list (?page=/?limit=) and the
// lightweight name index (?fields=name) — same filters, different pagination.
function baseParams(filters: ContentFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const id of filters.sourceIds) params.append('source', id)
  if (filters.sourceType) params.set('sourceType', filters.sourceType)
  if (filters.edition) params.set('edition', filters.edition)
  if (filters.query) params.set('q', filters.query)
  for (const [key, value] of Object.entries(filters.extra)) {
    if (value) params.set(key, value)
  }
  return params
}

export function listParams(filters: ContentFilters, page: number): URLSearchParams {
  const params = baseParams(filters)
  params.set('page', String(page))
  params.set('limit', String(PAGE_LIMIT))
  return params
}

export function nameIndexParams(filters: ContentFilters): URLSearchParams {
  const params = baseParams(filters)
  params.set('fields', 'name')
  return params
}

// Every full row matching the given filters, unpaginated (`?fields=all`,
// server-side §content/shared.ts) — for one-shot "give me everything
// currently filtered" fetches (the trading-card print sheet, the Monster+
// Spellcasting packet's spell-name matching) where useContentList's
// scroll-windowed infinite-query shape doesn't apply.
export function allFieldsParams(filters: ContentFilters): URLSearchParams {
  const params = baseParams(filters)
  params.set('fields', 'all')
  return params
}

// Stable key fragment shared by useContentList/useContentNameIndex — sorted
// sourceIds so checkbox-toggle order never produces spurious cache misses.
export function filterKey(type: ContentType, filters: ContentFilters) {
  return [type, [...filters.sourceIds].sort(), filters.sourceType, filters.edition, filters.query, filters.extra] as const
}

export function apiPath(type: ContentType): string {
  return CONTENT_TYPE_API_PATH[type]
}
