import type { Prisma } from '@prisma/client'
import { BackgroundSchema } from '@dragonledger/content-types'
import { toJsonString } from '../utils/json.js'
import { ABILITY_NAME_TO_CODE } from './abilities.js'
import { type ProficiencyGrant, parseProficiencyGrant, splitOptionList } from './proseGrant.js'
import { slugFromKey } from './slug.js'
import type { Open5eBackground, Open5eBenefit } from './types.js'

interface TaggedEntry {
  name: string
  category: 'skill' | 'tool'
}

function taggedGrant(grant: ProficiencyGrant, category: TaggedEntry['category']) {
  return {
    fixed: grant.fixed.map((name): TaggedEntry => ({ name, category })),
    choices: grant.choices.map((c) => ({
      ...c,
      from: c.from ? c.from.map((name): TaggedEntry => ({ name, category })) : null,
    })),
  }
}

// All observed SRD 2024 backgrounds grant exactly 3 named abilities via
// plain prose ("Intelligence, Wisdom, Charisma") with no in-text
// distribution instructions — the +2/+1-or-+1/+1/+1 split is a standard
// 2024 background rule, not per-background data, so it's hardcoded here
// rather than parsed.
function parseAbilityScoreBenefit(desc: string) {
  const abilities = splitOptionList(desc)
    .map((name) => ABILITY_NAME_TO_CODE[name.toLowerCase()])
    .filter((code): code is string => Boolean(code))
  if (abilities.length === 0) {
    return { fixed: {}, choices: [] }
  }
  return {
    fixed: {},
    choices: [{ type: 'distribute' as const, pool: 3, among: abilities, maxPerOption: 2 }],
  }
}

export function transformBackground(
  raw: Open5eBackground,
  sourceId: string,
  edition: string,
): Prisma.ContentBackgroundCreateManyInput {
  const documentKey = raw.document.key

  let abilityBonuses: { fixed: Record<string, number>; choices: unknown[] } = {
    fixed: {},
    choices: [],
  }
  let skillGrant: ProficiencyGrant = { fixed: [], choices: [] }
  let toolGrant: ProficiencyGrant = { fixed: [], choices: [] }
  const feature: { name: string; description: string }[] = []
  const extraData: Record<string, unknown> = {}
  const unrecognizedBenefits: Open5eBenefit[] = []

  for (const benefit of raw.benefits) {
    switch (benefit.type) {
      case 'ability_score':
        abilityBonuses = parseAbilityScoreBenefit(benefit.desc)
        break
      case 'skill_proficiency':
        skillGrant = parseProficiencyGrant(benefit.desc)
        break
      case 'tool_proficiency':
        toolGrant = parseProficiencyGrant(benefit.desc)
        break
      case 'feature':
        feature.push({ name: benefit.name, description: benefit.desc })
        break
      case 'feat':
        // Not in the original design doc's mapping — real 2024 SRD
        // backgrounds grant a fixed starting feat via this benefit type
        // instead of the 2014-style "feature" benefit. No dedicated
        // column exists for it, so it's a clearly-named extraData key
        // rather than falling into the generic unrecognized bucket.
        extraData.grantedFeat = { name: benefit.desc }
        break
      case 'language':
        extraData.languages = benefit.desc
        break
      case 'equipment':
        extraData.equipment = benefit.desc
        break
      case 'adventures_and_advancement':
      case 'connection_and_memento':
        extraData[benefit.type] = benefit.desc
        break
      default:
        unrecognizedBenefits.push(benefit)
    }
  }

  if (unrecognizedBenefits.length > 0) {
    extraData.unrecognizedBenefits = unrecognizedBenefits
  }

  const proficiencies = {
    fixed: [...taggedGrant(skillGrant, 'skill').fixed, ...taggedGrant(toolGrant, 'tool').fixed],
    choices: [
      ...taggedGrant(skillGrant, 'skill').choices,
      ...taggedGrant(toolGrant, 'tool').choices,
    ],
  }

  const logical = BackgroundSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    proficiencies,
    abilityBonuses,
    feature,
    description: raw.desc || '',
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    edition,
    proficiencies: toJsonString(logical.proficiencies) as string,
    abilityBonuses: toJsonString(logical.abilityBonuses) as string,
    feature: toJsonString(logical.feature) as string,
    description: logical.description,
    extraData: toJsonString(logical.extraData),
  }
}
