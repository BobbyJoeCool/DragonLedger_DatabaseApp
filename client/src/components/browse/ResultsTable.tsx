import { useMemo, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useContentList } from '@/hooks/useContentList'
import { useContentNameIndex } from '@/hooks/useContentNameIndex'
import { useSources } from '@/hooks/useSources'
import type { ContentFilters, ContentListItem } from '@/lib/contentQuery'
import type { ContentType } from '@/lib/contentTypes'
import type { SelectionState } from '@/hooks/useSelection'
import { PositionBar } from './PositionBar'

interface ResultsTableProps {
  type: ContentType
  filters: ContentFilters
  selection: SelectionState
  onItemClick?: (id: string) => void
}

const ROW_HEIGHT = 40

interface ColumnDef {
  label: string
  key: string
  width: string
  format?: (value: unknown) => string
}

function formatSpellLevel(value: unknown): string {
  if (value === 0) return 'Cantrip'
  return String(value ?? '')
}

function formatArray(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  return String(value ?? '')
}

function titleCase(value: unknown): string {
  const s = String(value ?? '')
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function formatItemType(value: unknown): string {
  const s = String(value ?? '')
  return s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const TYPE_COLUMNS: Record<ContentType, ColumnDef[]> = {
  spells: [
    { label: 'Level', key: 'level', width: 'w-16', format: formatSpellLevel },
    { label: 'School', key: 'school', width: 'w-24', format: titleCase },
    { label: 'Classes', key: 'classes', width: 'w-48', format: formatArray },
  ],
  classes: [],
  races: [],
  backgrounds: [],
  conditions: [],
  items: [
    { label: 'Type', key: 'itemType', width: 'w-32', format: formatItemType },
    { label: 'Rarity', key: 'rarity', width: 'w-24', format: titleCase },
  ],
  monsters: [
    { label: 'CR', key: 'challengeRating', width: 'w-12' },
    { label: 'Type', key: 'monsterType', width: 'w-28', format: titleCase },
  ],
  feats: [
    { label: 'Category', key: 'category', width: 'w-24', format: titleCase },
  ],
}

function cellValue(item: ContentListItem, col: ColumnDef): string {
  const raw = item[col.key]
  if (col.format) return col.format(raw)
  return String(raw ?? '')
}

export function ResultsTable({ type, filters, selection, onItemClick }: ResultsTableProps) {
  const [startPage, setStartPage] = useState(1)
  const parentRef = useRef<HTMLDivElement>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const filterSignature = JSON.stringify(filters)
  useEffect(() => {
    setStartPage(1)
    parentRef.current?.scrollTo({ top: 0 })
  }, [filterSignature])

  const query = useContentList(type, filters, startPage)
  const nameIndexQuery = useContentNameIndex(type, filters)
  const { data: sources } = useSources()
  const sourceMap = useMemo(
    () => new Map((sources ?? []).map((s) => [s.id, s.name])),
    [sources],
  )

  const pages = query.data?.pages ?? []
  const items = pages.flatMap((p) => p.data)
  const total = pages[0]?.total ?? 0
  const limit = pages[0]?.limit ?? items.length
  const leadingOffset = pages.length > 0 ? (pages[0]!.page - 1) * limit : 0
  const columns = TYPE_COLUMNS[type]

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })
  const virtualItems = virtualizer.getVirtualItems()

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

  const loadedItems = items.filter(Boolean)
  const pageAllSelected = loadedItems.length > 0 && loadedItems.every((item) => selection.isSelected(item.id))
  const pageSomeSelected = loadedItems.some((item) => selection.isSelected(item.id))

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = pageSomeSelected && !pageAllSelected
    }
  }, [pageSomeSelected, pageAllSelected])

  function handleHeaderCheckboxChange() {
    const ids = loadedItems.map((item) => item.id)
    if (pageAllSelected) {
      selection.deselectPage(ids)
    } else {
      selection.selectPage(ids)
    }
  }

  function handleSelectAllFiltered() {
    if (nameIndexQuery.data) {
      selection.selectAll(nameIndexQuery.data.map((entry) => entry.id))
    }
  }

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
      <div className="flex-1 overflow-hidden rounded-md border">
        <div className="flex items-center border-b px-3 py-2 text-xs text-muted-foreground">
          <input
            ref={headerCheckboxRef}
            type="checkbox"
            checked={pageAllSelected}
            onChange={handleHeaderCheckboxChange}
            className="mr-2 h-4 w-4 shrink-0 accent-primary"
            aria-label="Select all on this page"
          />
          <span className="min-w-0 flex-1">
            {total} result{total !== 1 ? 's' : ''}
            {selection.count > 0 && ` · ${selection.count} selected`}
          </span>
          {columns.map((col) => (
            <span key={col.key} className={`${col.width} shrink-0 pl-3 text-right`}>
              {col.label}
            </span>
          ))}
        </div>
        {pageAllSelected && total > loadedItems.length && (
          <button
            type="button"
            onClick={handleSelectAllFiltered}
            className="w-full border-b bg-accent/20 py-1 text-center text-xs hover:bg-accent/30"
          >
            Select all {total} results matching this filter
          </button>
        )}
        <div ref={parentRef} className="h-[60vh] overflow-y-auto">
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
                    <>
                      <input
                        type="checkbox"
                        checked={selection.isSelected(item.id)}
                        onChange={() => selection.toggle(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-2 h-4 w-4 shrink-0 accent-primary"
                        aria-label={`Select ${item.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => onItemClick?.(item.id)}
                        className="flex min-w-0 flex-1 items-center text-left hover:underline"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {item.name}
                          <span className="ml-1 text-xs text-muted-foreground/70">
                            ({sourceMap.get(item.sourceId) ?? ''})
                          </span>
                        </span>
                        {columns.map((col) => (
                          <span
                            key={col.key}
                            className={`${col.width} shrink-0 truncate pl-3 text-right text-xs text-muted-foreground`}
                          >
                            {cellValue(item, col)}
                          </span>
                        ))}
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Loading…</span>
                  )}
                </div>
              )
            })}
          </div>
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
