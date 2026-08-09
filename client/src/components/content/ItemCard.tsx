import type { Item } from '@dragonledger/content-types'
import { SourceBadge } from '@/components/browse/SourceBadge'

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
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
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
    <div className="space-y-4 rounded-md border p-6 print:border-none">
      <div>
        <h2 className="text-2xl font-semibold">{item.name}</h2>
        <p className="italic text-muted-foreground">
          {item.itemType}
          {item.rarity ? `, ${item.rarity}` : ''}
          {item.requiresAttunement ? ' (requires attunement)' : ''}
        </p>
        <div className="mt-2">
          <SourceBadge sourceId={item.sourceId} />
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
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

      <div className="space-y-2 text-sm leading-relaxed">
        {item.description.split('\n').map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {hasAdvanced && (
        <div className="space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Additional Details</p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            {extra.size && <DetailRow label="Size" value={extra.size} />}
            {extra.range && <DetailRow label="Range" value={extra.range} />}
            {extra.strRequired !== undefined && <DetailRow label="Strength Required" value={String(extra.strRequired)} />}
            {extra.maxDexBonus !== undefined && <DetailRow label="Max Dex Bonus" value={String(extra.maxDexBonus)} />}
            {extra.acDisplay && <DetailRow label="AC" value={extra.acDisplay} />}
            {extra.attunementDetail && <DetailRow label="Attunement" value={extra.attunementDetail} />}
            {extra.stealthDisadvantage && <DetailRow label="Stealth Disadvantage" value="Yes" />}
            {extra.isSimple && <DetailRow label="Weapon Category" value="Simple" />}
            {extra.isMartial && <DetailRow label="Weapon Category" value="Martial" />}
            {extra.isImprovised && <DetailRow label="Improvised" value="Yes" />}
          </dl>
        </div>
      )}
    </div>
  )
}
