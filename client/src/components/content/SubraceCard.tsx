import { Link } from 'react-router'
import type { Subrace } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

interface SubraceExtraData {
  unresolvedRaceName?: string
}

interface SubraceCardProps {
  subrace: Subrace
}

// Orphaned-parent fallback (raceId null): standalone card, no parent-context
// link, shows the unresolved name as plain italic text instead of a link —
// same convention Subclass uses for an unresolved classId.
export function SubraceCard({ subrace }: SubraceCardProps) {
  const extra = (subrace.extraData ?? {}) as SubraceExtraData

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{subrace.name}</h2>
        {subrace.raceId ? (
          <p className="text-sm text-muted-foreground">
            Subrace of{' '}
            <Link to={`/browse/races/${subrace.raceId}`} className="text-primary hover:underline">
              parent race
            </Link>
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            {extra.unresolvedRaceName
              ? `${extra.unresolvedRaceName} (unresolved — not linked to a race record)`
              : 'No parent race linked'}
          </p>
        )}
        <div className="mt-2">
          <SourceBadge sourceId={subrace.sourceId} />
        </div>
      </div>

      {(subrace.size || subrace.speed) && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {subrace.size && (
            <div className="contents">
              <dt className="text-muted-foreground">Size (override)</dt>
              <dd>{subrace.size.join(', ')}</dd>
            </div>
          )}
          {subrace.speed && (
            <div className="contents">
              <dt className="text-muted-foreground">Speed (override)</dt>
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
        <div className="space-y-2 text-sm">
          <p className="font-medium">Traits</p>
          {subrace.traits.map((t, i) => (
            <div key={i}>
              <p className="font-medium">
                {t.name} <span className="font-normal text-muted-foreground">(level {t.level})</span>
              </p>
              <p className="leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>
      )}

      {subrace.description && (
        <div className="space-y-2 text-sm leading-relaxed">
          {subrace.description.split('\n').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  )
}
