import { Link } from 'react-router'
import type { Subrace } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, OrphanedParentMeta, Shell, cardStyles } from '@/components/cards/shared'

interface SubraceExtraData {
  unresolvedRaceName?: string
}

interface SubraceCardProps {
  subrace: Subrace
}

// Orphaned-parent fallback (raceId null) uses the one shared pattern
// (OrphanedParentMeta, §2) — same convention Subclass uses for an
// unresolved classId.
export function SubraceCard({ subrace }: SubraceCardProps) {
  const extra = (subrace.extraData ?? {}) as SubraceExtraData

  return (
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{subrace.name}</h2>
        {subrace.raceId ? (
          <p className={'text-sm ' + cardStyles.detailLabel}>
            Subrace of{' '}
            <Link to={`/browse/races/${subrace.raceId}`} className="text-primary hover:underline">
              parent race
            </Link>
          </p>
        ) : (
          <p className="text-sm">
            <OrphanedParentMeta parentKind="race" unresolvedName={extra.unresolvedRaceName} />
          </p>
        )}
        <div className="mt-2">
          <SourceBadge sourceId={subrace.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      {(subrace.size || subrace.speed) && (
        <dl className={cardStyles.detailGrid}>
          {subrace.size && (
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Size (override)</dt>
              <dd>{subrace.size.join(', ')}</dd>
            </div>
          )}
          {subrace.speed && (
            <div className={cardStyles.detailRow}>
              <dt className={cardStyles.detailLabel}>Speed (override)</dt>
              <dd>
                {[
                  `Walk ${subrace.speed.walk}`,
                  subrace.speed.fly !== undefined ? `Fly ${subrace.speed.fly}` : null,
                  subrace.speed.swim !== undefined ? `Swim ${subrace.speed.swim}` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </dd>
            </div>
          )}
        </dl>
      )}

      {subrace.traits.length > 0 && (
        <>
          <Divider variant="minor" />
          <div className="space-y-2 text-sm">
            <p className={cardStyles.sectionLabel}>Traits</p>
            {subrace.traits.map((t, i) => (
              <div key={i}>
                <p className={cardStyles.entryName}>
                  {t.name} <span className="font-normal dl-muted">(level {t.level})</span>
                </p>
                <p className="leading-relaxed">{t.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {subrace.description && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.proseSection}>
            {subrace.description.split('\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </>
      )}
    </Shell>
  )
}
