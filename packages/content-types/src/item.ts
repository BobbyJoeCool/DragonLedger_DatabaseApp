import { z } from 'zod'

// Exported so PropertyListWidget (client) can type its rows against the
// same shape the schema enforces.
export const propertySchema = z.object({
  name: z.string().min(1),
  detail: z.string().nullable().optional(),
})

export const ItemSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  edition: z.enum(["5e", "5.5e"]).optional(),
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

// Correctable subset: source-type-based (see phase-4-write-api-final-export.md
// §4). Every field is correctable except the fixed lock list (name/slug/
// sourceId).
export const ItemCorrectableSchema = ItemSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export type Item = z.infer<typeof ItemSchema>
export type ItemProperty = z.infer<typeof propertySchema>
