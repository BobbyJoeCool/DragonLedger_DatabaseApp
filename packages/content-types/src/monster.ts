import { z } from 'zod'

// Exported so ActionListWidget (client) can type its rows against the same
// shape the schema enforces.
export const actionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  actionType: z.enum(['action', 'bonus', 'reaction', 'mythic']),
  toHitMod: z.number().int().nullable().optional(),
  damage: z.string().nullable().optional(),
})

// Phase 2.6: unified shape, both sources write this — see
// importers/shared/resistance.ts and schema-expansion-design-handoff.md §1.1.
// All three fields always present (never optional, never a bare string) so
// a downstream consumer never has to branch on which source wrote the row.
// Exported for ResistanceListWidget (client).
export const resistanceEntrySchema = z.object({
  types: z.array(z.string()).min(1),
  nonmagical: z.boolean(),
  bypassedBy: z.string().nullable(),
})

export const MonsterSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  edition: z.enum(["5e", "5.5e"]).optional(),
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
  experiencePoints: z.number().int(),
  actions: z.array(actionSchema),
  legendaryActions: z.array(actionSchema).nullable().optional(),
  description: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const MonsterPartialSchema = MonsterSchema.partial()

// Correctable subset: source-type-based, not a per-field curated list (see
// phase-4-write-api-final-export.md §4) — this was the one type that ever
// got a curated list under the old rule; that list is now superseded.
// Every field is correctable except the fixed lock list (name/slug/
// sourceId).
export const MonsterCorrectableSchema = MonsterSchema.omit({
  name: true,
  slug: true,
  sourceId: true,
}).partial().strict()

export type Monster = z.infer<typeof MonsterSchema>
export type MonsterAction = z.infer<typeof actionSchema>
export type ResistanceEntry = z.infer<typeof resistanceEntrySchema>
