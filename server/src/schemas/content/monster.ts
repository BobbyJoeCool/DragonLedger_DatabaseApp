import { z } from 'zod'

const actionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  actionType: z.enum(['action', 'bonus', 'reaction', 'mythic']),
  toHitMod: z.number().int().nullable().optional(),
  damage: z.string().nullable().optional(),
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
  damageResistances: z.array(z.string()).nullable().optional(),
  damageImmunities: z.array(z.string()).nullable().optional(),
  damageVulnerabilities: z.array(z.string()).nullable().optional(),
  conditionImmunities: z.array(z.string()).nullable().optional(),
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
