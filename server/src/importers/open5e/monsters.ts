import type { Prisma } from '@prisma/client'
import { MonsterSchema } from '@dragonledger/content-types'
import {
  parseCompositeResistanceList,
  type CompositeResistanceEntry,
} from '../shared/resistance.js'
import { xpFromChallengeRating } from '../shared/experiencePoints.js'
import { toJsonString } from '../utils/json.js'
import { slugFromKey } from './slug.js'
import type {
  Open5eAttack,
  Open5eCreature,
  Open5eCreatureAction,
  Open5eCreatureTrait,
  Open5eKeyName,
} from './types.js'

// Real live data correction: challenge_rating is a raw float (0.25, 12.0),
// not a pre-formatted fraction string as the original design doc assumed.
export function formatChallengeRating(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

// Inverse of formatChallengeRating — Compendium's <cr> is already a
// fraction-formatted string/number (unlike Open5e's raw float), and
// inferProficiencyBonus() below needs a real number to threshold against.
// Exported for reuse by the Compendium monster transform (Phase 2.6).
export function parseChallengeRatingToNumber(cr: string): number {
  if (cr === '1/8') return 0.125
  if (cr === '1/4') return 0.25
  if (cr === '1/2') return 0.5
  return Number(cr) || 0
}

// CR-to-proficiency-bonus lookup — proficiency_bonus was null on every live
// sample checked, so this fallback is the effective primary source, not a
// rare edge case.
export function inferProficiencyBonus(cr: number): number {
  if (cr <= 4) return 2
  if (cr <= 8) return 3
  if (cr <= 12) return 4
  if (cr <= 16) return 5
  if (cr <= 20) return 6
  if (cr <= 24) return 7
  if (cr <= 28) return 8
  return 9
}

// Phase 2.6: parses the API's `_display` prose through the same composite
// parser Compendium uses, rather than the flat key array (which silently
// discards qualifiers like "nonmagical"/"unless silvered" — verified live
// that no real SRD-2024 monster's `_display` text actually uses those
// templates today, so this mainly future-proofs the shape rather than
// changing today's values, but it's the source both sources should read
// from per the unified-column decision). Falls back to reconstructing a
// comma-joined string from the flat array on the off chance `_display` is
// ever empty while the array isn't — never verified live, defensive only.
function parseResistanceField(
  display: string,
  fallbackList: Open5eKeyName[],
): CompositeResistanceEntry[] | null {
  const text = display || fallbackList.map((k) => k.key).join(', ')
  const parsed = parseCompositeResistanceList(text)
  return parsed.length > 0 ? parsed : null
}

function nonEmptyRecord(
  rec: Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (!rec) return null
  return Object.keys(rec).length > 0 ? rec : null
}

function composeSenses(raw: Open5eCreature): string | null {
  const parts: string[] = []
  if (raw.darkvision_range) parts.push(`darkvision ${raw.darkvision_range} ft.`)
  if (raw.blindsight_range) parts.push(`blindsight ${raw.blindsight_range} ft.`)
  if (raw.tremorsense_range) parts.push(`tremorsense ${raw.tremorsense_range} ft.`)
  if (raw.truesight_range) parts.push(`truesight ${raw.truesight_range} ft.`)
  if (raw.passive_perception !== null) parts.push(`passive Perception ${raw.passive_perception}`)
  return parts.length > 0 ? parts.join(', ') : null
}

// `${damage_die_count}d${damage_die_type}+${damage_bonus}`, composed rather
// than copied — the real API splits these across three separate fields,
// not one combined dice string. Attack bonus/damage type read from
// `to_hit_mod`/`extra_damage_type` (verified live — not `attack_bonus`/
// `damage_type`, which the design doc's Heroes-derived notes assumed).
export function composeAttackDice(attack: Open5eAttack): string | null {
  if (attack.damage_die_count === null || attack.damage_die_type === null) return null
  const dieSize = attack.damage_die_type.replace(/^d/i, '')
  let dice = `${attack.damage_die_count}d${dieSize}`
  if (attack.damage_bonus) {
    dice += attack.damage_bonus >= 0 ? `+${attack.damage_bonus}` : `${attack.damage_bonus}`
  }
  if (attack.extra_damage_type) {
    dice += ` ${attack.extra_damage_type.key}`
  }
  return dice
}

const ACTION_TYPE_MAP: Record<string, 'action' | 'bonus' | 'reaction' | 'mythic'> = {
  ACTION: 'action',
  BONUS_ACTION: 'bonus',
  REACTION: 'reaction',
  MYTHIC_ACTION: 'mythic',
}

function mapAction(a: Open5eCreatureAction) {
  const damageParts = a.attacks.map(composeAttackDice).filter((d): d is string => Boolean(d))
  return {
    name: a.name,
    description: a.desc,
    actionType: ACTION_TYPE_MAP[a.action_type] ?? 'action',
    toHitMod: a.attacks[0]?.to_hit_mod ?? null,
    damage: damageParts.length > 0 ? damageParts.join(' plus ') : null,
  }
}

interface SpellcastingBlock {
  ability?: string
  saveDC?: number
  atWill?: string[]
  limitedUse?: { frequency: string; spells: string[] }[]
  slots?: Record<string, string[]>
  cantrips?: string[]
}

function parseSpellList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.replace(/\*/g, '').trim())
    .filter(Boolean)
}

// Best-effort — this is prose, not structured data. The raw action text is
// always preserved verbatim in `actions[]` too, so a parse miss here never
// loses information, only convenience structure.
export function parseSpellcastingBlock(desc: string): SpellcastingBlock | null {
  const abilityMatch = desc.match(/using (\w+) as the spellcasting ability/i)
  const dcMatch = desc.match(/spell save DC (\d+)/i)
  const bulletMatches = [...desc.matchAll(/[-*]\s*\*\*(.+?):\*\*\s*(.+)/g)]

  const block: SpellcastingBlock = {}
  if (abilityMatch) block.ability = abilityMatch[1]
  if (dcMatch) block.saveDC = Number(dcMatch[1])

  const atWill: string[] = []
  const cantrips: string[] = []
  const limitedUse: { frequency: string; spells: string[] }[] = []
  const slots: Record<string, string[]> = {}

  for (const m of bulletMatches) {
    const label = m[1].trim()
    const spells = parseSpellList(m[2])
    if (/at will/i.test(label)) {
      atWill.push(...spells)
    } else if (/cantrip/i.test(label)) {
      cantrips.push(...spells)
    } else {
      const levelMatch = label.match(/(\d+)(?:st|nd|rd|th)\s*level/i)
      if (levelMatch) {
        slots[levelMatch[1]] = spells
      } else {
        limitedUse.push({ frequency: label, spells })
      }
    }
  }

  if (atWill.length > 0) block.atWill = atWill
  if (cantrips.length > 0) block.cantrips = cantrips
  if (limitedUse.length > 0) block.limitedUse = limitedUse
  if (Object.keys(slots).length > 0) block.slots = slots

  return Object.keys(block).length > 0 ? block : null
}

function parseLegendaryResistances(traits: Open5eCreatureTrait[]): number {
  const trait = traits.find((t) => /legendary resistance/i.test(t.name))
  if (!trait) return 0
  const match = trait.name.match(/\((\d+)\/Day\)/i) ?? trait.desc.match(/\((\d+)\/Day\)/i)
  return match ? Number(match[1]) : 0
}

export function transformMonster(
  raw: Open5eCreature,
  sourceId: string,
): Prisma.ContentMonsterCreateManyInput {
  const documentKey = raw.document.key

  const mainActions = raw.actions.filter((a) => a.action_type in ACTION_TYPE_MAP).map(mapAction)
  const legendaryActions = raw.actions
    .filter((a) => a.action_type === 'LEGENDARY_ACTION')
    .map(mapAction)
  const lairActions = raw.actions
    .filter((a) => a.action_type === 'LAIR_ACTION')
    .map((a) => ({ name: a.name, description: a.desc }))

  const spellcastingAction = raw.actions.find((a) => /spellcasting/i.test(a.name))
  const spellcasting = spellcastingAction ? parseSpellcastingBlock(spellcastingAction.desc) : null

  const extraData: Record<string, unknown> = {
    traits: raw.traits.map((t) => ({ name: t.name, description: t.desc })),
    proficiencyBonus: raw.proficiency_bonus ?? inferProficiencyBonus(raw.challenge_rating),
    legendaryResistances: parseLegendaryResistances(raw.traits),
  }
  if (raw.armor_detail) extraData.armorClassDetail = raw.armor_detail
  if (lairActions.length > 0) extraData.lairActions = lairActions
  if (spellcasting) extraData.spellcasting = spellcasting
  if (raw.category) extraData.category = raw.category
  if (raw.subcategory) extraData.subcategory = raw.subcategory

  const challengeRating = formatChallengeRating(raw.challenge_rating)
  const ri = raw.resistances_and_immunities

  const logical = MonsterSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    size: raw.size.key,
    monsterType: raw.type.key,
    alignment: raw.alignment,
    armorClass: raw.armor_class,
    hitPoints: raw.hit_points,
    hitDice: raw.hit_dice,
    speed: raw.speed_all,
    abilityScores: raw.ability_scores,
    savingThrows: nonEmptyRecord(raw.saving_throws),
    skills: nonEmptyRecord(raw.skill_bonuses),
    damageResistances: parseResistanceField(ri.damage_resistances_display, ri.damage_resistances),
    damageImmunities: parseResistanceField(ri.damage_immunities_display, ri.damage_immunities),
    damageVulnerabilities: parseResistanceField(
      ri.damage_vulnerabilities_display,
      ri.damage_vulnerabilities,
    ),
    conditionImmunities: parseResistanceField(
      ri.condition_immunities_display,
      ri.condition_immunities,
    ),
    senses: composeSenses(raw),
    languages: raw.languages?.as_string ?? null,
    challengeRating,
    // Passthrough of the API's real per-monster value — relocated out of
    // extraData into its own column (Phase 2.6); CR-table fallback only for
    // the null case, never observed live but the column is NOT NULL.
    experiencePoints: raw.experience_points ?? xpFromChallengeRating(challengeRating),
    actions: mainActions,
    legendaryActions: legendaryActions.length > 0 ? legendaryActions : null,
    description: raw.description ?? null,
    extraData,
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    size: logical.size,
    monsterType: logical.monsterType,
    alignment: logical.alignment,
    armorClass: logical.armorClass,
    hitPoints: logical.hitPoints,
    hitDice: logical.hitDice,
    speed: toJsonString(logical.speed) as string,
    abilityScores: toJsonString(logical.abilityScores) as string,
    savingThrows: toJsonString(logical.savingThrows),
    skills: toJsonString(logical.skills),
    damageResistances: toJsonString(logical.damageResistances),
    damageImmunities: toJsonString(logical.damageImmunities),
    damageVulnerabilities: toJsonString(logical.damageVulnerabilities),
    conditionImmunities: toJsonString(logical.conditionImmunities),
    senses: logical.senses ?? null,
    languages: logical.languages ?? null,
    challengeRating: logical.challengeRating,
    experiencePoints: logical.experiencePoints,
    actions: toJsonString(logical.actions) as string,
    legendaryActions: toJsonString(logical.legendaryActions),
    description: logical.description ?? null,
    extraData: toJsonString(logical.extraData),
  }
}
