import { z } from 'zod'

const actionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  actionType: z.enum(['action', 'bonus', 'reaction', 'mythic']),
  toHitMod: z.number().int().nullable().optional(),
  damage: z.string().nullable().optional(),
})

// Two valid shapes coexist in this column by design, not by accident: a
// plain type string (Open5e's already-split array) or the composite parser
// entry (`{types, nonmagical, bypassedBy}`) the Compendium importer relies
// on for its free-text resistance fields — see importers/shared/resistance.ts.
// Open5e's monster transform hasn't been retrofitted onto the composite
// parser yet (tracked as a known follow-up), so both shapes are real and
// intentional today, not a schema bug.
const compositeResistanceEntrySchema = z.object({
  type: z.string().optional(),
  types: z.array(z.string()).optional(),
  nonmagical: z.boolean().optional(),
  bypassedBy: z.string().nullable().optional(),
})
const resistanceEntrySchema = z.union([z.string(), compositeResistanceEntrySchema])

export const MonsterSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  size: z.string(),
  monsterType: z.string(),
  alignment: z.string(),
  armorClass: z.number().int(),
  hitPoints: z.number().int(),
  hitDice: z.string(),
  speed: z.record(z.string(), z.unknown()),
  abilityScores: z.record(z.string(), z.number()),
  savingThrows: z.record(z.string(), z.number()).nullable().optional(),
  skills: z.record(z.string(), z.number()).nullable().optional(),
  damageResistances: z.array(resistanceEntrySchema).nullable().optional(),
  damageImmunities: z.array(resistanceEntrySchema).nullable().optional(),
  damageVulnerabilities: z.array(resistanceEntrySchema).nullable().optional(),
  conditionImmunities: z.array(resistanceEntrySchema).nullable().optional(),
  senses: z.string().nullable().optional(),
  languages: z.string().nullable().optional(),
  challengeRating: z.string(),
  actions: z.array(actionSchema),
  legendaryActions: z.array(actionSchema).nullable().optional(),
  description: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const MonsterPartialSchema = MonsterSchema.partial()

export type Monster = z.infer<typeof MonsterSchema>
