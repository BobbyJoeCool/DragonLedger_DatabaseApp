import type { ComponentType } from 'react'
import { SpellForm } from '@/components/content/SpellForm'
import { ConditionForm } from '@/components/content/ConditionForm'
import { FeatForm } from '@/components/content/FeatForm'
import { BackgroundForm } from '@/components/content/BackgroundForm'
import { ItemForm } from '@/components/content/ItemForm'
import { RaceForm } from '@/components/content/RaceForm'
import { ClassForm } from '@/components/content/ClassForm'
import { MonsterForm } from '@/components/content/MonsterForm'
import type { ContentType } from '@/lib/contentTypes'

export interface TypeFormProps {
  mode: 'create' | 'edit'
  id?: string
}

// Registry mirroring lib/filterBarRegistry.ts's pattern — CreateScreen/
// EditScreen dispatch through this instead of an ever-growing if/else
// chain. Partial: a type with no entry yet falls through to the "not
// built yet" placeholder in those screens.
export const FORM_COMPONENTS: Partial<Record<ContentType, ComponentType<TypeFormProps>>> = {
  spells: SpellForm,
  conditions: ConditionForm,
  feats: FeatForm,
  backgrounds: BackgroundForm,
  items: ItemForm,
  races: RaceForm,
  classes: ClassForm,
  monsters: MonsterForm,
}
