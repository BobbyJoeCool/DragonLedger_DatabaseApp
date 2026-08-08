import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { ContentType } from '@/lib/contentTypes'
import {
  apiPath,
  filterKey,
  nameIndexParams,
  type ContentFilters,
  type NameIndexEntry,
} from '@/lib/contentQuery'

// Wraps GET /api/<type>?fields=name — lightweight {id,name}[] index for the
// entire filtered result set (not paginated), powering live names in the
// PositionBar tooltip while dragging without a full-record fetch per pixel.
export function useContentNameIndex(type: ContentType, filters: ContentFilters) {
  return useQuery({
    queryKey: ['content-name-index', ...filterKey(type, filters)],
    queryFn: async (): Promise<NameIndexEntry[]> => {
      const params = nameIndexParams(filters)
      const res = await apiFetch(`${apiPath(type)}?${params.toString()}`)
      if (!res.ok) throw new Error(`Failed to load ${type} name index`)
      return res.json() as Promise<NameIndexEntry[]>
    },
    staleTime: 30_000,
  })
}
