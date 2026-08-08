import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'

export interface Source {
  id: string
  name: string
  type: 'API' | 'FILE' | 'MANUAL'
  description: string | null
  lastUpdated: string
  isDeletable: boolean
  entryCount: number
}

// Wraps GET /api/sources (Phase 1) — powers SourceMultiSelect's checkbox
// list and its "all checked" default.
export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: async (): Promise<Source[]> => {
      const res = await apiFetch('/api/sources')
      if (!res.ok) throw new Error('Failed to load sources')
      return res.json() as Promise<Source[]>
    },
    staleTime: 60_000,
  })
}
