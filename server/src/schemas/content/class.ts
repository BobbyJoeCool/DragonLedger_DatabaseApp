import { z } from 'zod'
import { nameOnlyGrantSchema } from './shared.js'

const primaryAbilitySchema = z.object({
  abilities: z.array(z.string()),
  logic: z.enum(['AND', 'OR']),
})

export const ClassSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  name: z.string().min(1),
  hitDie: z.number().int().positive(),
  primaryAbility: primaryAbilitySchema,
  savingThrows: z.array(z.string()),
  armorProfs: z.array(z.string()),
  weaponProfs: z.array(z.string()),
  skillChoices: nameOnlyGrantSchema,
  spellcastingAbility: z.string().nullable().optional(),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const ClassPartialSchema = ClassSchema.partial()

// Correctable subset: every field here is inferred by the import parser from
// a shared markdown feature table (CORE_TRAITS_TABLE) or a fallback chain
// (hitDie: nested hit_points.hit_dice > table row > feature scan > hardcoded
// SRD table), not copied directly from a single unambiguous source field —
// real parser mistakes were found and fixed here during Phase 2. `name` and
// `description` are excluded as raw authored text.
export const ClassCorrectableSchema = ClassSchema.pick({
  hitDie: true,
  primaryAbility: true,
  savingThrows: true,
  armorProfs: true,
  weaponProfs: true,
  skillChoices: true,
  spellcastingAbility: true,
}).strict()

export const SubclassSchema = z.object({
  slug: z.string().min(1),
  sourceId: z.string().min(1),
  classId: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string(),
  extraData: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const SubclassPartialSchema = SubclassSchema.partial()

// Correctable subset: classId is resolved by the importer's cross-source
// parent-matching logic (prefer Open5e match → Compendium match → null +
// extraData.unresolvedClassName) — a genuine parser inference the user may
// need to fix without it counting as a rules/flavor edit. name/description
// are raw authored text.
export const SubclassCorrectableSchema = SubclassSchema.pick({
  classId: true,
}).strict()

export type Class = z.infer<typeof ClassSchema>
export type Subclass = z.infer<typeof SubclassSchema>
