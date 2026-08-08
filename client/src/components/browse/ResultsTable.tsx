import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useContentList } from '@/hooks/useContentList'
import { useContentNameIndex } from '@/hooks/useContentNameIndex'
import type { ContentFilters } from '@/lib/contentQuery'
import type { ContentType } from '@/lib/contentTypes'
import { PositionBar } from './PositionBar'

interface ResultsTableProps {
  type: ContentType
  filters: ContentFilters
}

const ROW_HEIGHT = 40

// The most involved piece of Phase 5 (Decision 1.5): virtualized,
// bidirectional infinite scroll with a draggable jump-to-position bar.
// Column layout is a placeholder — <Type>Row's real per-type columns are
// deferred to their own design session (tasks.md Phase 5 item 11), same
// status as DetailScreen's <Type>DetailFields.
export function ResultsTable({ type, filters }: ResultsTableProps) {
  const [startPage, setStartPage] = useState(1)
  const parentRef = useRef<HTMLDivElement>(null)

  // Position bar resets to top whenever the filter set changes (Decision 1.5).
  const filterSignature = JSON.stringify(filters)
  useEffect(() => {
    setStartPage(1)
    parentRef.current?.scrollTo({ top: 0 })
  }, [filterSignature])

  const query = useContentList(type, filters, startPage)
  const nameIndexQuery = useContentNameIndex(type, filters)

  const pages = query.data?.pages ?? []
  const items = pages.flatMap((p) => p.data)
  const total = pages[0]?.total ?? 0
  const limit = pages[0]?.limit ?? items.length
  const leadingOffset = pages.length > 0 ? (pages[0]!.page - 1) * limit : 0

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })
  const virtualItems = virtualizer.getVirtualItems()

  // Auto-fetch adjacent pages as the visible window nears either edge of
  // what's currently loaded — equivalent to the IntersectionObserver-sentinel
  // mechanism (Decision 1.5), driven by the virtualizer's own visible range
  // instead of a separate DOM sentinel.
  useEffect(() => {
    if (virtualItems.length === 0) return
    const firstVisible = virtualItems[0]!.index
    const lastVisible = virtualItems[virtualItems.length - 1]!.index
    const loadedEnd = leadingOffset + items.length

    if (lastVisible >= loadedEnd - 10 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
    if (
      firstVisible <= leadingOffset + 10 &&
      query.hasPreviousPage &&
      !query.isFetchingPreviousPage
    ) {
      void query.fetchPreviousPage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualItems, leadingOffset, items.length, query.hasNextPage, query.hasPreviousPage])

  function handleJump(targetIndex: number) {
    const targetPage = Math.floor(targetIndex / (limit || 50)) + 1
    setStartPage(targetPage)
    virtualizer.scrollToIndex(targetIndex, { align: 'center' })
  }

  const currentIndex =
    virtualItems.length > 0
      ? Math.round((virtualItems[0]!.index + virtualItems[virtualItems.length - 1]!.index) / 2)
      : leadingOffset

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">Failed to load results.</p>
  }
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No results match these filters.</p>
  }

  return (
    <div className="flex gap-2">
      <div ref={parentRef} className="h-[60vh] flex-1 overflow-y-auto rounded-md border">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index - leadingOffset]
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-center border-b px-3 text-sm"
              >
                {item ? (
                  <Link
                    to={`/browse/${type}/${item.id}`}
                    className="flex w-full items-center justify-between hover:underline"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="ml-2 shrink-0 truncate text-xs text-muted-foreground">
                      {item.sourceId}
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Loading…</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <PositionBar
        total={total}
        currentIndex={currentIndex}
        nameIndex={nameIndexQuery.data}
        onJump={handleJump}
      />
    </div>
  )
}
