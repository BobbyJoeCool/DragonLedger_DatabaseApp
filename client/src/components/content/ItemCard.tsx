import type { Item } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'
import { Divider, Shell, cardStyles } from '@/components/cards/shared'

// Weapon fields vs. wondrous-item fields populate almost disjoint sets —
// every stat row below hides when empty rather than reserving fixed space.
interface ItemExtraData {
  size?: string
  range?: string
  isSimple?: boolean
  isMartial?: boolean
  isImprovised?: boolean
  stealthDisadvantage?: boolean
  maxDexBonus?: number
  addDexMod?: boolean
  strRequired?: number
  acDisplay?: string
  attunementDetail?: string
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cardStyles.detailRow}>
      <dt className={cardStyles.detailLabel}>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

interface ItemCardProps {
  item: Item
}

export function ItemCard({ item }: ItemCardProps) {
  const extra = (item.extraData ?? {}) as ItemExtraData
  const hasAdvanced =
    extra.size ||
    extra.range ||
    extra.strRequired !== undefined ||
    extra.maxDexBonus !== undefined ||
    extra.acDisplay ||
    extra.attunementDetail

  return (
    <Shell mode="page" frameClassName="space-y-3">
      <div>
        <h2 className={cardStyles.cardHeading}>{item.name}</h2>
        <p className={cardStyles.subheading}>
          {item.itemType}
          {item.rarity ? `, ${item.rarity}` : ''}
          {item.requiresAttunement ? ' (requires attunement)' : ''}
        </p>
        <div className="mt-2">
          <SourceBadge sourceId={item.sourceId} />
        </div>
      </div>

      <Divider variant="major" />

      <dl className={cardStyles.detailGrid}>
        {item.cost && <DetailRow label="Cost" value={item.cost} />}
        {item.weight && <DetailRow label="Weight" value={item.weight} />}
        {item.damage && <DetailRow label="Damage" value={item.damage} />}
        {item.armorClass && <DetailRow label="Armor Class" value={item.armorClass} />}
        {item.properties && item.properties.length > 0 && (
          <DetailRow
            label="Properties"
            value={item.properties.map((p) => (p.detail ? `${p.name} (${p.detail})` : p.name)).join(', ')}
          />
        )}
      </dl>

      <Divider variant="minor" />

      <div className={cardStyles.proseSection}>
        {item.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {hasAdvanced && (
        <>
          <Divider variant="minor" />
          <div className={cardStyles.additionalDetailsWrap}>
            <p className={cardStyles.sectionLabel}>Additional Details</p>
            <dl className={cardStyles.detailGrid}>
              {extra.size && <DetailRow label="Size" value={extra.size} />}
              {extra.range && <DetailRow label="Range" value={extra.range} />}
              {extra.strRequired !== undefined && (
                <DetailRow label="Strength Required" value={String(extra.strRequired)} />
              )}
              {extra.maxDexBonus !== undefined && (
                <DetailRow label="Max Dex Bonus" value={String(extra.maxDexBonus)} />
              )}
              {extra.acDisplay && <DetailRow label="AC" value={extra.acDisplay} />}
              {extra.attunementDetail && <DetailRow label="Attunement" value={extra.attunementDetail} />}
              {extra.stealthDisadvantage && <DetailRow label="Stealth Disadvantage" value="Yes" />}
              {extra.isSimple && <DetailRow label="Weapon Category" value="Simple" />}
              {extra.isMartial && <DetailRow label="Weapon Category" value="Martial" />}
              {extra.isImprovised && <DetailRow label="Improvised" value="Yes" />}
            </dl>
          </div>
        </>
      )}
    </Shell>
  )
}
