import type { Condition } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, cardStyles } from '@/components/cards/shared'

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
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{condition.name}</h2>
        <div className="mt-2">
          <SourceBadge sourceId={condition.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      <div className={cardStyles.proseSection}>
        {condition.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {condition.effects && (
        <>
          <Divider variant="minor" />
          <div className="text-sm leading-relaxed">
            <p className={cardStyles.sectionLabel}>Effects</p>
            <p>{condition.effects}</p>
          </div>
        </>
      )}

      {hasAdvanced && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.additionalDetailsWrap}>
            <p className={cardStyles.sectionLabel}>Additional Details</p>
            <dl className={cardStyles.detailGrid}>
              {extra.icon && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Icon</dt>
                  <dd>{extra.icon}</dd>
                </div>
              )}
              {extra.descriptionSource && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Description Source</dt>
                  <dd>{extra.descriptionSource}</dd>
                </div>
              )}
              {extra.requestedSource && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Requested Source</dt>
                  <dd>{extra.requestedSource}</dd>
                </div>
              )}
            </dl>
          </div>
        </>
      )}
    </Shell>
  )
}
