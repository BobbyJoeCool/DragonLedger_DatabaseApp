import { BackgroundFilterBar } from '@/components/filters/BackgroundFilterBar'
import { ClassFilterBar } from '@/components/filters/ClassFilterBar'
import { ConditionFilterBar } from '@/components/filters/ConditionFilterBar'
import { FeatFilterBar } from '@/components/filters/FeatFilterBar'
import { ItemFilterBar } from '@/components/filters/ItemFilterBar'
import { MonsterFilterBar } from '@/components/filters/MonsterFilterBar'
import { RaceFilterBar } from '@/components/filters/RaceFilterBar'
import { SpellFilterBar } from '@/components/filters/SpellFilterBar'
import type { ContentFilters } from '@/lib/contentQuery'
import type { ContentType } from '@/lib/contentTypes'

export interface FilterBarProps {
  filters: ContentFilters
  onChange: (filters: ContentFilters) => void
}

export const FILTER_BARS: Record<ContentType, (props: FilterBarProps) => React.JSX.Element> = {
  spells: SpellFilterBar,
  classes: ClassFilterBar,
  races: RaceFilterBar,
  backgrounds: BackgroundFilterBar,
  conditions: ConditionFilterBar,
  items: ItemFilterBar,
  monsters: MonsterFilterBar,
  feats: FeatFilterBar,
}
