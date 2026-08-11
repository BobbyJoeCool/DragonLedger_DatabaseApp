import type { Item, Spell } from '@dragonledger/content-types'
import { spellLevelSchoolLine } from '@/components/cards/shared'
import { ItemFooter, SpellFooter } from './footers'
import type { CardSource } from './buildTradingCards'

export function spellToCardSource(spell: Spell & { id: string }): CardSource {
  return {
    id: spell.id,
    title: spell.name,
    meta: spellLevelSchoolLine(spell.level, spell.school),
    description: spell.description,
    higherLevels: spell.higherLevels ?? undefined,
    footer: <SpellFooter spell={spell} />,
  }
}

export function itemToCardSource(item: Item & { id: string }): CardSource {
  const metaParts = [item.itemType, item.rarity, item.requiresAttunement ? 'attunement' : null].filter(Boolean)
  return {
    id: item.id,
    title: item.name,
    meta: metaParts.join(', '),
    description: item.description,
    footer: <ItemFooter item={item} />,
  }
}
