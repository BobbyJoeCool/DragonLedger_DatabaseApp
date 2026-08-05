import { z } from 'zod'

// Fixed/Choice Grant Shape — see Documentation/phase-2-import-final-export.md §4.1.
// Applies wherever official content mixes a fixed grant with a player choice.

const gradeEntry = z.union([z.string(), z.object({ name: z.string(), category: z.string() })])

const selectChoice = z.object({
  type: z.literal('select'),
  count: z.number().int().positive(),
  from: z.array(gradeEntry).nullable(),
  amount: z.number().int().nullable().optional(),
})

const distributeChoice = z.object({
  type: z.literal('distribute'),
  pool: z.number().int().positive(),
  among: z.array(gradeEntry),
  maxPerOption: z.number().int().positive(),
})

export const grantChoiceSchema = z.union([selectChoice, distributeChoice])

export function fixedChoiceGrantSchema<T extends z.ZodTypeAny>(fixedSchema: T) {
  return z.object({
    fixed: fixedSchema,
    choices: z.array(grantChoiceSchema),
  })
}

export const nameOnlyGrantSchema = fixedChoiceGrantSchema(z.array(gradeEntry))
export const abilityBonusGrantSchema = fixedChoiceGrantSchema(z.record(z.string(), z.number()))

export type FixedChoiceGrant<F> = { fixed: F; choices: z.infer<typeof grantChoiceSchema>[] }
