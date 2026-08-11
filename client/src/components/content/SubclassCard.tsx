import { Link } from 'react-router'
import type { Subclass } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import {
  Divider,
  OrphanedParentMeta,
  Shell,
  cardStyles,
  groupFeatures,
  type ClassFeatureRow,
} from '@/components/cards/shared'

interface SubclassExtraData {
  unresolvedClassName?: string
}

interface SubclassCardProps {
  subclass: Subclass & { features?: ClassFeatureRow[] }
}

// Orphaned-parent fallback (classId null) uses the one shared pattern
// (OrphanedParentMeta, §2) — same convention as Subrace, not a separate
// implementation.
export function SubclassCard({ subclass }: SubclassCardProps) {
  const extra = (subclass.extraData ?? {}) as SubclassExtraData
  const groupedFeatures = groupFeatures(subclass.features ?? [])

  return (
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{subclass.name}</h2>
        {subclass.classId ? (
          <p className={'text-sm ' + cardStyles.detailLabel}>
            Subclass of{' '}
            <Link to={`/browse/classes/${subclass.classId}`} className="text-primary hover:underline">
              parent class
            </Link>
          </p>
        ) : (
          <p className="text-sm">
            <OrphanedParentMeta parentKind="class" unresolvedName={extra.unresolvedClassName} />
          </p>
        )}
        <div className="mt-2">
          <SourceBadge sourceId={subclass.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      <div className={cardStyles.proseSection}>
        {subclass.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {groupedFeatures.length > 0 && (
        <>
          <Divider variant="minor" />
          <div className="space-y-2 text-sm">
            <p className={cardStyles.sectionLabel}>Features</p>
            {groupedFeatures.map((f, i) => (
              <div key={i}>
                <p className={cardStyles.entryName}>
                  {f.name}{' '}
                  <span className="font-normal dl-muted">
                    (level{f.levels.length > 1 ? 's' : ''} {f.levels.join(', ')})
                  </span>
                </p>
                <p className="leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  )
}
