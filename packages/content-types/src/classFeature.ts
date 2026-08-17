import { z } from 'zod'

export const ClassFeatureSchema = z.object({
  classId: z.string().min(1).nullable().optional(),
  subclassId: z.string().min(1).nullable().optional(),
  level: z.number().int().min(1).max(20),
  name: z.string().min(1),
  description: z.string(),
  type: z.string().nullable().optional(),
})

export const ClassFeaturePartialSchema = ClassFeatureSchema.partial()

export type ClassFeature = z.infer<typeof ClassFeatureSchema>
