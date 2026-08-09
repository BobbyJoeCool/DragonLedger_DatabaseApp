import type { Feat } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

// Real Compendium-sourced Feat rows (the dominant source) fold each named
// sub-benefit into `description` as a tab-prefixed line rather than a
// structured array — this card renders `description` as-is (prose), it
// doesn't attempt to re-parse those lines into a benefits list.
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

  return (
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{feat.name}</h2>
        <p className="italic text-muted-foreground">{feat.category}</p>
        <div className="mt-2">
          <SourceBadge sourceId={feat.sourceId} />
        </div>
      </div>

      {feat.prerequisite && (
        <p className="text-sm">
          <span className="font-medium">Prerequisite: </span>
          {feat.prerequisite}
        </p>
      )}

      <div className="space-y-2 text-sm leading-relaxed">
        {feat.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {hasAdvanced && (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {extra.rawCategory && (
              <div className="contents">
                <dt className="text-muted-foreground">Raw Category</dt>
                <dd>{extra.rawCategory}</dd>
              </div>
            )}
            {extra.special && (
              <div className="contents">
                <dt className="text-muted-foreground">Special</dt>
                <dd>{extra.special}</dd>
              </div>
            )}
            {extra.edition && (
              <div className="contents">
                <dt className="text-muted-foreground">Edition</dt>
                <dd>{extra.edition}</dd>
              </div>
            )}
            {extra.page && (
              <div className="contents">
                <dt className="text-muted-foreground">Page</dt>
                <dd>{extra.page}</dd>
              </div>
            )}
            {extra.otherTags && extra.otherTags.length > 0 && (
              <div className="contents">
                <dt className="text-muted-foreground">Tags</dt>
                <dd>{extra.otherTags.join(', ')}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
