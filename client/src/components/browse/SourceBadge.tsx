import { Link } from 'react-router'
import { useSources } from '@/hooks/useSources'

interface SourceBadgeProps {
  sourceId: string
}

// Some Compendium-imported source ids/names run 200+ characters (garbled
// auto-generated metadata) — truncate with a title tooltip rather than
// assuming a normal-length name (card-design-data-examples.md's "source
// badge" gotcha).
export function SourceBadge({ sourceId }: SourceBadgeProps) {
  const { data: sources } = useSources()
  const source = sources?.find((s) => s.id === sourceId)
  const label = source?.name ?? sourceId

  return (
    <Link
      to={`/sources`}
      title={label}
      className="inline-block max-w-xs truncate rounded-full border bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground hover:underline"
    >
      {label}
    </Link>
  )
}
