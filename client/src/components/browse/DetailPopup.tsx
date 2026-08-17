import { useState } from 'react'
import { Link } from 'react-router'
import { createPortal } from 'react-dom'
import { useContentDetail } from '@/hooks/useContentDetail'
import { CARD_COMPONENTS } from '@/lib/cardRegistry'
import { CardThemeProvider, type CardThemeName } from '@/components/cards/shared'
import { ThemeSelect } from '@/components/cards/ThemeSelect'
import { CONTENT_TYPE_SINGULAR, type ContentType } from '@/lib/contentTypes'

interface DetailPopupProps {
  type: ContentType
  id: string
  onClose: () => void
}

export function DetailPopup({ type, id, onClose }: DetailPopupProps) {
  const [theme, setTheme] = useState<CardThemeName>('parchment')
  const { data: entry, isLoading, isError } = useContentDetail(type, id)
  const Card = CARD_COMPONENTS[type]
  const label = CONTENT_TYPE_SINGULAR[type]

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg border bg-popover text-popover-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b p-4">
          <h3 className="min-w-0 truncate text-lg font-semibold">
            {isLoading ? 'Loading…' : ((entry?.name as string) ?? `${label} not found`)}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeSelect value={theme} onChange={setTheme} />
            <Link
              to={`/browse/${type}/${id}`}
              className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
            >
              Full Page
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-6">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {isError && (
            <p className="text-sm text-destructive">Failed to load this {label.toLowerCase()}.</p>
          )}
          {!isLoading && !isError && entry === null && (
            <p className="text-sm text-muted-foreground">This entry may have been deleted.</p>
          )}
          {entry && Card && (
            <CardThemeProvider theme={theme}>
              <Card entry={entry} mode="list" />
            </CardThemeProvider>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
