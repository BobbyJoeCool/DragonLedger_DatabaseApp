import { z } from 'zod'

const actionSchema = z.object({
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
const resistanceEntrySchema = z.object({
  types: z.array(z.string()).min(1),
  nonmagical: z.boolean(),
  bypassedBy: z.string().nullable(),
})

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
  experiencePoints: z.number().int(),
  actions: z.array(actionSchema),
  legendaryActions: z.array(actionSchema).nullable().optional(),
  description: z.string().nullable().optional(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const MonsterPartialSchema = MonsterSchema.partial()

// Correctable subset: parsed/inferred structured data, not raw authored
// text. name, description, alignment, and the raw actions/traits text are
// deliberately excluded — editing those is a rules/flavor change, not a
// parser-error fix. extraData.spellcasting's spell-name matches are also
// correctable in principle, but since extraData is one opaque JSON string,
// per-key correction there is deferred, not built this pass (see
// phase-4-write-api-final-export.md §4).
export const MonsterCorrectableSchema = MonsterSchema.pick({
  savingThrows: true,
  skills: true,
  damageResistances: true,
  damageImmunities: true,
  damageVulnerabilities: true,
  conditionImmunities: true,
}).strict()

export type Monster = z.infer<typeof MonsterSchema>
