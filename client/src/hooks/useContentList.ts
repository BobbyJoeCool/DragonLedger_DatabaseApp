import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { ContentType } from '@/lib/contentTypes'
import {
  apiPath,
  filterKey,
  listParams,
  type ContentFilters,
  type ContentPage,
} from '@/lib/contentQuery'

// Wraps GET /api/<type> via useInfiniteQuery — bidirectional (Decision 1.5):
// `startPage` anchors the query (changes on jump-to-position, via the
// PositionBar) and is part of the query key, so jumping resets to a fresh
// query starting at that page rather than needing to fetch every page in
// between. getNextPageParam/getPreviousPageParam extend from there in either
// direction as the user scrolls.
export function useContentList(type: ContentType, filters: ContentFilters, startPage: number) {
  return useInfiniteQuery({
    queryKey: ['content-list', ...filterKey(type, filters), startPage],
    queryFn: async ({ pageParam }): Promise<ContentPage> => {
      const params = listParams(filters, pageParam)
      const res = await apiFetch(`${apiPath(type)}?${params.toString()}`)
      if (!res.ok) throw new Error(`Failed to load ${type}`)
      return res.json() as Promise<ContentPage>
    },
    initialPageParam: startPage,
    getNextPageParam: (lastPage) => {
      const maxPage = Math.max(1, Math.ceil(lastPage.total / lastPage.limit))
      return lastPage.page < maxPage ? lastPage.page + 1 : undefined
    },
    getPreviousPageParam: (firstPage) => (firstPage.page > 1 ? firstPage.page - 1 : undefined),
    // Without this, a jump-to-position (startPage changes → new query key)
    // briefly resets data to undefined, collapsing `total` to 0 — which
    // zeroes the virtualizer's scroll extent and snaps the scroll position
    // back to the top before the new anchor page even loads. Keeping the
    // previous pages displayed until the new ones arrive avoids that collapse.
    placeholderData: keepPreviousData,
  })
}
