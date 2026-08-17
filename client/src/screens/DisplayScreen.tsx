import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { CARD_COMPONENTS } from '@/lib/cardRegistry'
import { apiPath } from '@/lib/contentQuery'
import { CONTENT_TYPE_LABELS, CONTENT_TYPE_SINGULAR, type ContentType } from '@/lib/contentTypes'
import { CardThemeProvider, type CardThemeName } from '@/components/cards/shared'
import { ThemeSelect } from '@/components/cards/ThemeSelect'
import { useDisplayCollection, type DisplayItem } from '@/hooks/useDisplayCollection'

function groupByType(items: DisplayItem[]): Map<ContentType, DisplayItem[]> {
  const map = new Map<ContentType, DisplayItem[]>()
  for (const item of items) {
    const list = map.get(item.type) ?? []
    list.push(item)
    map.set(item.type, list)
  }
  return map
}

function DisplayCard({
  item,
  theme,
  onRemove,
}: {
  item: DisplayItem
  theme: CardThemeName
  onRemove: () => void
}) {
  const { data: entry, isLoading } = useQuery({
    queryKey: ['content-detail', item.type, item.id],
    queryFn: async () => {
      const res = await apiFetch(`${apiPath(item.type)}/${item.id}`)
      if (!res.ok) return null
      return res.json() as Promise<Record<string, unknown>>
    },
  })

  const Card = CARD_COMPONENTS[item.type]

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Loading {item.name}…
      </div>
    )
  }

  if (!entry || !Card) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-destructive/30 p-4">
        <span className="text-sm text-muted-foreground">
          {item.name} — entry not found (may have been deleted)
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-destructive hover:underline"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <div className="group relative break-inside-avoid print:pb-4">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 z-10 rounded-md bg-background/80 px-2 py-1 text-xs text-destructive opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 print:hidden"
      >
        Remove
      </button>
      <CardThemeProvider theme={theme}>
        <Card entry={entry} mode="list" />
      </CardThemeProvider>
    </div>
  )
}

export function DisplayScreen() {
  const { items, removeItem, clearAll, count } = useDisplayCollection()
  const [theme, setTheme] = useState<CardThemeName>('parchment')
  const grouped = groupByType(items)

  if (count === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Display</h2>
        <p className="text-muted-foreground">
          No items in your collection. Check the boxes next to items in Browse to add them here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Display</h2>
          <p className="mt-1 text-muted-foreground">
            {count} {count === 1 ? 'item' : 'items'} in your collection.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <ThemeSelect value={theme} onChange={setTheme} />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Print
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            Clear All
          </button>
        </div>
      </div>

      <style>{`@media print { @page { margin: 0.5in; } body, html { background: white !important; color: black !important; } }`}</style>

      {[...grouped.entries()].map(([type, typeItems], idx) => (
        <section key={type} className={idx > 0 ? 'print:break-before-page' : ''}>
          <h3 className="mb-3 border-b pb-2 text-lg font-medium">
            {CONTENT_TYPE_LABELS[type]}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({typeItems.length} {typeItems.length === 1 ? CONTENT_TYPE_SINGULAR[type].toLowerCase() : type})
            </span>
          </h3>
          <div className="space-y-4">
            {typeItems.map((item) => (
              <DisplayCard
                key={`${item.type}:${item.id}`}
                item={item}
                theme={theme}
                onRemove={() => removeItem(item.type, item.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
