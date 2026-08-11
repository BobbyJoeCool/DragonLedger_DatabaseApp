import type { Feat } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, cardStyles, parseFeatDescription } from '@/components/cards/shared'

// Real Compendium-sourced Feat rows (the dominant source) fold each named
// sub-benefit into `description` as a tab-prefixed line rather than a
// structured array — parseFeatDescription (§2) splits that back into
// {intro[], benefits:[{name,text}]} so each benefit renders as its own
// bolded, accent-colored line instead of one undifferentiated prose block.
interface FeatExtraData {
  edition?: string
  page?: string
  rawCategory?: string
  special?: string
  otherTags?: string[]
  thirdParty?: boolean
  unearthedArcana?: boolean
  homebrew?: boolean
}

interface FeatCardProps {
  feat: Feat
}

export function FeatCard({ feat }: FeatCardProps) {
  const extra = (feat.extraData ?? {}) as FeatExtraData
  const hasAdvanced =
    extra.edition || extra.page || extra.rawCategory || extra.special || (extra.otherTags && extra.otherTags.length > 0)
  const { intro, benefits } = parseFeatDescription(feat.description)

  return (
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{feat.name}</h2>
        <p className={cardStyles.subheading}>{feat.category}</p>
        <div className="mt-2">
          <SourceBadge sourceId={feat.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      {feat.prerequisite && (
        <p className="text-sm">
          <span className={cardStyles.sectionLabel}>Prerequisite: </span>
          {feat.prerequisite}
        </p>
      )}

      <div className={cardStyles.proseSection}>
        {intro.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
        {benefits.map((benefit, i) => (
          <p key={i}>
            <span className={cardStyles.entryName}>{benefit.name}.</span> {benefit.text}
          </p>
        ))}
      </div>

      {hasAdvanced && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.additionalDetailsWrap}>
            <p className={cardStyles.sectionLabel}>Additional Details</p>
            <dl className={cardStyles.detailGrid}>
              {extra.rawCategory && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Raw Category</dt>
                  <dd>{extra.rawCategory}</dd>
                </div>
              )}
              {extra.special && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Special</dt>
                  <dd>{extra.special}</dd>
                </div>
              )}
              {extra.edition && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Edition</dt>
                  <dd>{extra.edition}</dd>
                </div>
              )}
              {extra.page && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Page</dt>
                  <dd>{extra.page}</dd>
                </div>
              )}
              {extra.otherTags && extra.otherTags.length > 0 && (
                <div className={cardStyles.detailRow}>
                  <dt className={cardStyles.detailLabel}>Tags</dt>
                  <dd>{extra.otherTags.join(', ')}</dd>
                </div>
              )}
            </dl>
          </div>
        </>
      )}
    </Shell>
  )
}
