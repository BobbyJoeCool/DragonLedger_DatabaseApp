import type { Item, Spell } from '@dragonledger/content-types'
import { spellFooterFromExtraData } from '@/components/cards/shared'

/** Spell footer — same three-line Damage/Save/Area shape as the doc's
 * §4 dependency note describes, built from the one shared utility.
 * Split into its own file (rather than living in adapters.ts alongside
 * spellToCardSource/itemToCardSource) so that file can stay
 * component-free — co-locating a component with non-component exports
 * trips this project's react-refresh/only-export-components lint rule. */
export function SpellFooter({ spell }: { spell: Spell }) {
  const footer = spellFooterFromExtraData(spell.extraData)
  if (!footer.damage && !footer.save && !footer.area) return null
  return (
    <>
      {footer.damage && (
        <p>
          <strong>Damage.</strong> {footer.damage.roll} {footer.damage.types.join('/')}
        </p>
      )}
      {footer.save && (
        <p>
          <strong>Save.</strong> {footer.save}
        </p>
      )}
      {footer.area && (
        <p>
          <strong>Area.</strong> {footer.area.shapeSize} {footer.area.shapeSizeUnit ?? ''} {footer.area.shapeType}
        </p>
      )}
    </>
  )
}

export function ItemFooter({ item }: { item: Item }) {
  const lines = [
    item.cost && `Cost: ${item.cost}`,
    item.weight && `Weight: ${item.weight}`,
    item.damage && `Damage: ${item.damage}`,
    item.armorClass && `AC: ${item.armorClass}`,
  ].filter(Boolean) as string[]
  if (lines.length === 0) return null
  return (
    <>
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </>
  )
}
