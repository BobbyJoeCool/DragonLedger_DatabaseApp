import type { Background, Class, Condition, Feat, Item, Monster, Race, Spell } from '@dragonledger/content-types'
import { SpellCard } from '@/components/content/SpellCard'
import { ConditionCard } from '@/components/content/ConditionCard'
import { FeatCard } from '@/components/content/FeatCard'
import { BackgroundCard } from '@/components/content/BackgroundCard'
import { ItemCard } from '@/components/content/ItemCard'
import { RaceCard } from '@/components/content/RaceCard'
import { ClassCard } from '@/components/content/ClassCard'
import { MonsterCard } from '@/components/content/MonsterCard'
import type { ContentType } from '@/lib/contentTypes'

export interface TypeCardProps {
  entry: Record<string, unknown>
}

// Registry mirroring lib/filterBarRegistry.ts's pattern. Every card
// component's real props are typed to its own content shape (e.g.
// `SpellCard`'s `spell: Spell`) — this registry's uniform `entry` prop
// exists only so DetailScreen can dispatch generically; each entry below
// is a thin adapter that does the cast.
export const CARD_COMPONENTS: Partial<Record<ContentType, (props: TypeCardProps) => React.JSX.Element>> = {
  spells: ({ entry }) => <SpellCard spell={entry as unknown as Spell} />,
  conditions: ({ entry }) => <ConditionCard condition={entry as unknown as Condition} />,
  feats: ({ entry }) => <FeatCard feat={entry as unknown as Feat} />,
  backgrounds: ({ entry }) => <BackgroundCard background={entry as unknown as Background} />,
  items: ({ entry }) => <ItemCard item={entry as unknown as Item} />,
  races: ({ entry }) => <RaceCard race={entry as unknown as Race} id={entry.id as string} />,
  classes: ({ entry }) => <ClassCard cls={entry as unknown as Class} id={entry.id as string} />,
  monsters: ({ entry }) => <MonsterCard monster={entry as unknown as Monster} />,
}
