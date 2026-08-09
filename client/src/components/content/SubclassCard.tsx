import { Link } from 'react-router'
import type { Subclass } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

interface ClassFeatureRow {
  id: string
  level: number
  name: string
  description: string
}

function groupFeaturesSimple(rows: ClassFeatureRow[]) {
  const groups = new Map<string, { name: string; description: string; levels: number[] }>()
  for (const row of rows) {
    const key = `${row.name} ${row.description}`
    const existing = groups.get(key)
    if (existing) existing.levels.push(row.level)
    else groups.set(key, { name: row.name, description: row.description, levels: [row.level] })
  }
  return [...groups.values()]
}

interface SubclassExtraData {
  unresolvedClassName?: string
}

interface SubclassCardProps {
  subclass: Subclass & { features?: ClassFeatureRow[] }
}

// Orphaned-parent fallback (classId null), same convention as Subrace.
export function SubclassCard({ subclass }: SubclassCardProps) {
  const extra = (subclass.extraData ?? {}) as SubclassExtraData
  const groupedFeatures = groupFeaturesSimple(subclass.features ?? [])

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{subclass.name}</h2>
        {subclass.classId ? (
          <p className="text-sm text-muted-foreground">
            Subclass of{' '}
            <Link to={`/browse/classes/${subclass.classId}`} className="text-primary hover:underline">
              parent class
            </Link>
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {extra.unresolvedClassName
              ? `${extra.unresolvedClassName} (unresolved — not linked to a class record)`
              : 'No parent class linked'}
          </p>
        )}
        <div className="mt-2">
          <SourceBadge sourceId={subclass.sourceId} />
        </div>
      </div>

      <div className="space-y-2 text-sm leading-relaxed">
        {subclass.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {groupedFeatures.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Features</p>
          {groupedFeatures.map((f, i) => (
            <div key={i}>
              <p className="font-medium">
                {f.name}{' '}
                <span className="font-normal text-muted-foreground">
                  (level{f.levels.length > 1 ? 's' : ''} {f.levels.join(', ')})
                </span>
              </p>
              <p className="leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
