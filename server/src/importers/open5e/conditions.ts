import type { Prisma } from '@prisma/client'
import { ConditionSchema } from '../../schemas/content/condition.js'
import { toJsonString } from '../utils/json.js'
import { slugFromKey } from './slug.js'
import type { Open5eCondition } from './types.js'

export function transformCondition(
  raw: Open5eCondition,
  sourceId: string,
): Prisma.ContentConditionCreateManyInput {
  const documentKey = raw.document.key
  const match = raw.descriptions.find((d) => d.document === documentKey)
  const chosen = match ?? raw.descriptions[0]

  const extraData: Record<string, unknown> = {}
  if (raw.icon) extraData.icon = raw.icon
  // The description fallback matters: a future Heroes character sheet could
  // otherwise silently show a DM the wrong ruleset's condition text.
  if (!match && chosen) {
    extraData.descriptionSource = chosen.document
    extraData.requestedSource = documentKey
  }

  const logical = ConditionSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    description: chosen?.desc ?? '',
    effects: null,
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    description: logical.description,
    effects: logical.effects ?? null,
    extraData: toJsonString(logical.extraData),
  }
}
