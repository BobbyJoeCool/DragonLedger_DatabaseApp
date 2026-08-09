import type { Condition } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

interface ConditionExtraData {
  descriptionSource?: string
  requestedSource?: string
  icon?: string
}

interface ConditionCardProps {
  condition: Condition
}

export function ConditionCard({ condition }: ConditionCardProps) {
  const extra = (condition.extraData ?? {}) as ConditionExtraData
  const hasAdvanced = extra.descriptionSource || extra.requestedSource || extra.icon

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{condition.name}</h2>
        <div className="mt-2">
          <SourceBadge sourceId={condition.sourceId} />
        </div>
      </div>

      <div className="space-y-2 text-sm leading-relaxed">
        {condition.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {condition.effects && (
        <div className="text-sm leading-relaxed">
          <p className="font-medium">Effects</p>
          <p>{condition.effects}</p>
        </div>
      )}

      {hasAdvanced && (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {extra.icon && (
              <div className="contents">
                <dt className="text-muted-foreground">Icon</dt>
                <dd>{extra.icon}</dd>
              </div>
            )}
            {extra.descriptionSource && (
              <div className="contents">
                <dt className="text-muted-foreground">Description Source</dt>
                <dd>{extra.descriptionSource}</dd>
              </div>
            )}
            {extra.requestedSource && (
              <div className="contents">
                <dt className="text-muted-foreground">Requested Source</dt>
                <dd>{extra.requestedSource}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
