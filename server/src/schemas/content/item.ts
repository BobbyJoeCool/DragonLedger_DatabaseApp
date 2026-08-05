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

export type Item = z.infer<typeof ItemSchema>
