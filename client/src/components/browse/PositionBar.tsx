import { useRef, useState } from 'react'
import type { NameIndexEntry } from '@/lib/contentQuery'

interface PositionBarProps {
  total: number
  currentIndex: number // 0-based, approximate position currently in view
  nameIndex: NameIndexEntry[] | undefined // ordered the same as the main list (name asc)
  onJump: (index: number) => void // 0-based target index, fires once on release
}

// A slim bar along the results' edge: `1` at top, `total` at bottom, current
// position in between. Dragging computes a target index via simple pointer-
// position arithmetic (no network call); the live tooltip name comes from
// the name-index companion fetch, not a per-pixel full-record fetch. The
// actual jump (onJump) only fires once, on release (Decision 1.5).
export function PositionBar({ total, currentIndex, nameIndex, onJump }: PositionBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function indexFromClientY(clientY: number): number {
    const bar = barRef.current
    if (!bar || total <= 0) return 0
    const rect = bar.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    return Math.round(fraction * (total - 1))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    setDragIndex(indexFromClientY(e.clientY))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragIndex(indexFromClientY(e.clientY))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (dragIndex !== null) onJump(dragIndex)
    setDragIndex(null)
  }

  const displayIndex = dragIndex ?? currentIndex
  const fraction = total > 1 ? displayIndex / (total - 1) : 0
  const tooltipName = nameIndex?.[displayIndex]?.name

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={dragIndex !== null ? handlePointerMove : undefined}
      onPointerUp={handlePointerUp}
      className="relative w-3 shrink-0 cursor-pointer rounded-full bg-muted select-none"
    >
      <div
        className="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
        style={{ top: `${fraction * 100}%` }}
      />
      {dragIndex !== null && (
        <div
          className="absolute right-full mr-2 -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ top: `${fraction * 100}%` }}
        >
          <div className="font-medium">{tooltipName ?? `#${displayIndex + 1}`}</div>
          <div className="text-muted-foreground">
            {displayIndex + 1} / {total}
          </div>
        </div>
      )}
    </div>
  )
}
