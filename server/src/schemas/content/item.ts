import { z } from 'zod'

const propertySchema = z.object({
  name: z.string().min(1),
  detail: z.string().nullable().optional(),
})

export const ItemSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  itemType: z.string(),
  rarity: z.string().nullable().optional(),
  requiresAttunement: z.boolean(),
  cost: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  damage: z.string().nullable().optional(),
  armorClass: z.string().nullable().optional(),
  properties: z.array(propertySchema).nullable().optional(),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const ItemPartialSchema = ItemSchema.partial()

// Correctable subset: rarity/requiresAttunement are parsed from the
// Compendium <detail> tag (confirmed reliable on 98.7% of magic items, not
// 100% — real parser misses possible on the residual). damage is composed
// from dmg1/dmgType. properties is unwrapped from a nested
// properties[].property.name shape (a real correction found in Phase 2) —
// all four are parser output, not a direct source copy. itemType/cost/weight/
// armorClass are excluded as direct copies; description is raw prose.
export const ItemCorrectableSchema = ItemSchema.pick({
  rarity: true,
  requiresAttunement: true,
  damage: true,
  properties: true,
}).strict()

export type Item = z.infer<typeof ItemSchema>
