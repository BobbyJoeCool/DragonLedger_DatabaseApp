import type { Prisma } from '@prisma/client'
import { ClassSchema, SubclassSchema } from '../../schemas/content/class.js'
import { toJsonString } from '../utils/json.js'
import { ABILITY_NAME_TO_CODE } from './abilities.js'
import { parseProficiencyGrant, splitOptionList } from './proseGrant.js'
import { slugFromKey } from './slug.js'
import type { Open5eClass, Open5eFeature } from './types.js'

// Real live data correction: skill/armor/weapon proficiencies and the
// primary-ability rule are NOT scattered across prose-named features as
// originally assumed — they live in one feature typed CORE_TRAITS_TABLE,
// a markdown pipe table keyed by row label (Primary Ability, Hit Point Die,
// Saving Throw Proficiencies, Skill Proficiencies, Weapon Proficiencies,
// Armor Training, Starting Equipment). See DevTools/Claude/phase-2.md.
function parseCoreTraitsTable(features: Open5eFeature[]): Record<string, string> {
  const feature = features.find((f) => f.feature_type === 'CORE_TRAITS_TABLE')
  if (!feature) return {}

  const rows = feature.desc
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^-*$/.test(cell)))

  const table: Record<string, string> = {}
  for (const [label, value] of rows) {
    if (label) table[label] = value ?? ''
  }
  return table
}

const AND_LOGIC_CLASSES = new Set(['Paladin', 'Monk', 'Ranger'])

// Hardcoded fallback only — the CORE_TRAITS_TABLE "Primary Ability" row
// text already says "and"/"or" directly and is preferred when parseable.
function lookupMulticlassLogic(className: string): 'AND' | 'OR' {
  return AND_LOGIC_CLASSES.has(className) ? 'AND' : 'OR'
}

function parsePrimaryAbility(value: string | undefined): {
  abilities: string[]
  logic: 'AND' | 'OR'
} {
  if (!value) return { abilities: [], logic: 'OR' }
  const logic: 'AND' | 'OR' = /\band\b/i.test(value) ? 'AND' : 'OR'
  const abilities = splitOptionList(value)
    .map((name) => ABILITY_NAME_TO_CODE[name.toLowerCase()])
    .filter((code): code is string => Boolean(code))
  return { abilities, logic: abilities.length > 1 ? logic : 'OR' }
}

const SPELLCASTING_ABILITY_BY_CLASS: Record<string, string> = {
  Wizard: 'INT',
  Cleric: 'WIS',
  Druid: 'WIS',
  Ranger: 'WIS',
  Bard: 'CHA',
  Sorcerer: 'CHA',
  Warlock: 'CHA',
  Paladin: 'CHA',
}

function lookupSpellcastingAbility(className: string, casterType: string): string | null {
  if (casterType === 'NONE') return null
  return SPELLCASTING_ABILITY_BY_CLASS[className] ?? null
}

const HIT_DIE_FALLBACK: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10,
  Paladin: 10,
  Ranger: 10,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Monk: 8,
  Rogue: 8,
  Warlock: 8,
  Sorcerer: 6,
  Wizard: 6,
}

function scanHitDieFeature(features: Open5eFeature[]): number | null {
  const feature = features.find((f) => /hit dice|hit points/i.test(f.name))
  if (!feature) return null
  const match = feature.desc.match(/d(\d+)/i)
  return match ? Number(match[1]) : null
}

// Priority: nested hit_points.hit_dice > CORE_TRAITS_TABLE's "Hit Point Die"
// row > top-level hit_dice string > a "Hit Dice"-named feature scan >
// hardcoded SRD table, in that order.
function inferHitDie(raw: Open5eClass, coreTraits: Record<string, string>): number {
  const fromHitPoints = raw.hit_points?.hit_dice.match(/d(\d+)/i)
  if (fromHitPoints) return Number(fromHitPoints[1])

  const fromCoreTable = coreTraits['Hit Point Die']?.match(/d(\d+)/i)
  if (fromCoreTable) return Number(fromCoreTable[1])

  const fromTopLevel = raw.hit_dice?.match(/d(\d+)/i)
  if (fromTopLevel) return Number(fromTopLevel[1])

  const fromFeatureScan = scanHitDieFeature(raw.features)
  if (fromFeatureScan) return fromFeatureScan

  return HIT_DIE_FALLBACK[raw.name] ?? 8
}

function extraFeatures(features: Open5eFeature[]) {
  return features
    .filter((f) => f.feature_type !== 'CORE_TRAITS_TABLE')
    .map((f) => ({
      name: f.name,
      description: f.desc,
      type: f.feature_type,
      levels: f.gained_at.map((g) => g.level),
    }))
}

export function transformClass(
  raw: Open5eClass,
  sourceId: string,
): Prisma.ContentClassCreateManyInput {
  const documentKey = raw.document.key
  const coreTraits = parseCoreTraitsTable(raw.features)

  let primaryAbility = parsePrimaryAbility(coreTraits['Primary Ability'])
  if (primaryAbility.abilities.length === 0 && raw.primary_abilities.length > 0) {
    const abilities = raw.primary_abilities
      .map((a) => ABILITY_NAME_TO_CODE[a.name.toLowerCase()])
      .filter((code): code is string => Boolean(code))
    if (abilities.length > 0) {
      primaryAbility = { abilities, logic: lookupMulticlassLogic(raw.name) }
    }
  }

  const skillChoicesText = coreTraits['Skill Proficiencies']
  const skillChoices = skillChoicesText
    ? parseProficiencyGrant(skillChoicesText)
    : { fixed: [], choices: [] }

  const weaponProfsText = coreTraits['Weapon Proficiencies']
  const weaponProfs =
    !weaponProfsText || weaponProfsText.toLowerCase() === 'none' ? [] : [weaponProfsText]

  const armorProfsText = coreTraits['Armor Training']
  const armorProfs =
    !armorProfsText || armorProfsText.toLowerCase() === 'none' ? [] : [armorProfsText]

  const logical = ClassSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    hitDie: inferHitDie(raw, coreTraits),
    primaryAbility,
    savingThrows: raw.saving_throws.map((s) => s.name),
    armorProfs,
    weaponProfs,
    skillChoices,
    spellcastingAbility: lookupSpellcastingAbility(raw.name, raw.caster_type),
    description: raw.desc || '',
    extraData: { casterType: raw.caster_type, features: extraFeatures(raw.features) },
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    hitDie: logical.hitDie,
    primaryAbility: toJsonString(logical.primaryAbility) as string,
    savingThrows: toJsonString(logical.savingThrows) as string,
    armorProfs: toJsonString(logical.armorProfs) as string,
    weaponProfs: toJsonString(logical.weaponProfs) as string,
    skillChoices: toJsonString(logical.skillChoices) as string,
    spellcastingAbility: logical.spellcastingAbility ?? null,
    description: logical.description,
    extraData: toJsonString(logical.extraData),
  }
}

export function transformSubclass(
  raw: Open5eClass,
  classId: string | null,
  sourceId: string,
): Prisma.ContentSubclassCreateManyInput {
  const documentKey = raw.document.key

  const logical = SubclassSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    classId,
    name: raw.name,
    description: raw.desc || '',
    extraData: { features: extraFeatures(raw.features) },
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    classId: logical.classId ?? null,
    name: logical.name,
    description: logical.description,
    extraData: toJsonString(logical.extraData),
  }
}
