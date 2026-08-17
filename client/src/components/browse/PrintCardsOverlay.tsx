import { useState } from 'react'
import { CARD_COMPONENTS } from '@/lib/cardRegistry'
import { CardThemeProvider, type CardThemeName } from '@/components/cards/shared'
import { ThemeSelect } from '@/components/cards/ThemeSelect'
import { CONTENT_TYPE_LABELS, type ContentType } from '@/lib/contentTypes'

interface PrintCardsOverlayProps {
  type: ContentType
  entries: Record<string, unknown>[]
  onClose: () => void
}

export function PrintCardsOverlay({ type, entries, onClose }: PrintCardsOverlayProps) {
  const [theme, setTheme] = useState<CardThemeName>('parchment')
  const Card = CARD_COMPONENTS[type]

  if (!Card) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background p-4 print:hidden">
        <div>
          <h2 className="text-lg font-semibold">Print Cards — {CONTENT_TYPE_LABELS[type]}</h2>
          <p className="text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSelect value={theme} onChange={setTheme} />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Print
          </button>
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
            Close
          </button>
        </div>
      </div>

      <CardThemeProvider theme={theme}>
        <style>{`@media print { @page { margin: 0.5in; } }`}</style>
        <div className="space-y-6 p-6 print:space-y-0 print:p-2">
          {entries.map((entry) => (
            <div key={entry.id as string} className="break-inside-avoid print:pb-4">
              <Card entry={entry} mode="list" />
            </div>
          ))}
        </div>
      </CardThemeProvider>
    </div>
  )
}
