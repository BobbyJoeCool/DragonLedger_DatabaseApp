import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { apiPath } from '@/lib/contentQuery'
import type { ContentType } from '@/lib/contentTypes'

// Wraps GET /api/<type>/:id. A 404 resolves to `data: null` (not an error) so
// DetailScreen can distinguish "not found" from "still loading"/"request
// failed" — isError only fires on a genuine network/server failure.
export function useContentDetail(type: ContentType, id: string | undefined) {
  return useQuery({
    queryKey: ['content-detail', type, id],
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      const res = await apiFetch(`${apiPath(type)}/${id}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`Failed to load ${type} detail`)
      return res.json() as Promise<Record<string, unknown>>
    },
    enabled: Boolean(id),
  })
}
