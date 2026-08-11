import type { Background } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, cardStyles, grantShapeToText } from '@/components/cards/shared'

interface BackgroundExtraData {
  grantedFeat?: { name: string }
  equipment?: string
  unrecognizedTraits?: { name: string; description: string }[]
}

interface BackgroundCardProps {
  background: Background
}

export function BackgroundCard({ background }: BackgroundCardProps) {
  const extra = (background.extraData ?? {}) as BackgroundExtraData

  return (
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{background.name}</h2>
        <div className="mt-2">
          <SourceBadge sourceId={background.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      <dl className={cardStyles.detailGrid}>
        <div className={cardStyles.detailRow}>
          <dt className={cardStyles.detailLabel}>Proficiencies</dt>
          <dd>{grantShapeToText(background.proficiencies) || '—'}</dd>
        </div>
        <div className={cardStyles.detailRow}>
          <dt className={cardStyles.detailLabel}>Ability Bonuses</dt>
          <dd>{grantShapeToText(background.abilityBonuses) || '—'}</dd>
        </div>
        {extra.grantedFeat && (
          <div className={cardStyles.detailRow}>
            <dt className={cardStyles.detailLabel}>Feat</dt>
            <dd>{extra.grantedFeat.name} (see Feat entry)</dd>
          </div>
        )}
        {extra.equipment && (
          <div className={cardStyles.detailRow}>
            <dt className={cardStyles.detailLabel}>Equipment</dt>
            <dd>{extra.equipment}</dd>
          </div>
        )}
      </dl>

      {background.feature.length > 0 && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.proseSection}>
            <p className={cardStyles.sectionLabel}>Feature</p>
            {background.feature.map((f, i) => (
              <p key={i}>
                <span className={cardStyles.entryName}>{f.name}.</span> {f.description}
              </p>
            ))}
          </div>
        </>
      )}

      <Divider variant="minor" />
      <div className={cardStyles.proseSection}>
        {background.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {extra.unrecognizedTraits && extra.unrecognizedTraits.length > 0 && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.additionalDetailsWrap}>
            <p className={cardStyles.sectionLabel}>Additional Details</p>
            {extra.unrecognizedTraits.map((t, i) => (
              <p key={i} className="whitespace-pre-line">
                <span className={cardStyles.entryName}>{t.name}.</span> {t.description}
              </p>
            ))}
          </div>
        </>
      )}
    </Shell>
  )
}
