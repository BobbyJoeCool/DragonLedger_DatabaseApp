import type { Prisma } from '@prisma/client'
import { MonsterSchema } from '@dragonledger/content-types'
import { slugify } from '../../utils/slugify.js'
import { parseCompositeResistanceList } from '../shared/resistance.js'
import { extractTelepathyRange } from '../shared/telepathy.js'
import { xpFromChallengeRating } from '../shared/experiencePoints.js'
import { inferProficiencyBonus, parseChallengeRatingToNumber } from '../open5e/monsters.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { parseNameTags } from './nameTags.js'
import { resolveCompendiumSource } from './sourceBooks.js'
import type { CompendiumAction, CompendiumMonster } from './types.js'
import type { TransformedRecord } from './feats.js'

const ABILITY_ABBR: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
}

function parseHp(hpRaw: string | number): { hitPoints: number; hitDice: string } {
  const hp = String(hpRaw)
  const match = hp.match(/^(\d+)\s*\(([^)]+)\)/)
  if (match) return { hitPoints: Number(match[1]), hitDice: match[2].trim() }
  return { hitPoints: Number(hp) || 0, hitDice: hp }
}

function parseSpeed(speedRaw: string | number): Record<string, number> {
  const speed = String(speedRaw)
  const result: Record<string, number> = {}
  for (const match of speed.matchAll(/(\w+)\s+(\d+)\s*ft/gi)) {
    result[match[1].toLowerCase()] = Number(match[2])
  }
  if (Object.keys(result).length === 0) result.walk = 30
  return result
}

function parseAbilityBonusList(text: string | undefined): Record<string, number> | null {
  if (!text) return null
  const result: Record<string, number> = {}
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\w+)\s*([+-]\d+)$/)
    if (match) {
      const key = ABILITY_ABBR[match[1].toLowerCase().slice(0, 3)] ?? match[1].toLowerCase()
      result[key] = Number(match[2])
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

function parseSkillList(text: string | undefined): Record<string, number> | null {
  if (!text) return null
  const result: Record<string, number> = {}
  for (const part of text.split(',')) {
    const match = part.trim().match(/^([A-Za-z][\w\s]*?)\s*([+-]\d+)$/)
    if (match) {
      result[match[1].trim().toLowerCase().replace(/\s+/g, '_')] = Number(match[2])
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

// Real finding: action-type isn't a discriminated field like Open5e's
// action_type — bonus actions/reactions are signaled by a parenthetical
// suffix on the action's own name ("Nimble Escape (Bonus Action)"),
// distinct from the also-real "(Recharge 5-6)" suffix, which stays in the
// name as-is (matches how the rest of this app already displays recharge
// info inline rather than as a separate field).
function parseActionName(rawName: string): {
  name: string
  actionType: 'action' | 'bonus' | 'reaction'
} {
  const match = rawName.match(/^(.*?)\s*\((Bonus Action|Reaction)\)\s*$/i)
  if (!match) return { name: rawName, actionType: 'action' }
  return { name: match[1].trim(), actionType: /bonus/i.test(match[2]) ? 'bonus' : 'reaction' }
}

// Real finding: <attack> is a pipe-delimited "Label|ToHitBonus|Dice" string,
// and can repeat when one action deals multiple damage components — the
// first entry is typically a redundant combined summary (e.g.
// "Rend|+14|(1d10+8)+(2d4)") followed by per-type breakdowns
// ("Slashing Damage|+14|1d10+8", "Fire Damage||2d4"); when more than one
// entry is present, the summary is dropped in favor of the real breakdown.
function parseAttack(attack: string | string[] | undefined): {
  toHitMod: number | null
  damage: string | null
} {
  if (!attack) return { toHitMod: null, damage: null }
  const entries = (Array.isArray(attack) ? attack : [attack]).map((e) => {
    const [label, toHit, dice] = e.split('|')
    return { label: (label ?? '').trim(), toHit: (toHit ?? '').trim(), dice: (dice ?? '').trim() }
  })
  const useEntries = entries.length > 1 ? entries.slice(1) : entries
  const toHitRaw = entries.find((e) => e.toHit)?.toHit
  const toHitMod = toHitRaw ? Number(toHitRaw.replace('+', '')) : null
  const damageParts = useEntries
    .filter((e) => e.dice)
    .map((e) => {
      const typeLabel = e.label
        .replace(/damage$/i, '')
        .trim()
        .toLowerCase()
      return typeLabel ? `${e.dice} ${typeLabel}` : e.dice
    })
  return { toHitMod, damage: damageParts.length > 0 ? damageParts.join(' plus ') : null }
}

function mapAction(a: CompendiumAction) {
  const { name, actionType } = parseActionName(a.name)
  const { toHitMod, damage } = parseAttack(a.attack)
  return { name, description: a.text, actionType, toHitMod, damage }
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
    .map((s) => s.replace(/\[.*?\]/g, '').trim())
    .filter(Boolean)
}

// Best-effort, additive — the raw trait/action text is always preserved
// verbatim regardless of whether this parse succeeds.
function parseSpellcastingBlock(text: string): SpellcastingBlock | null {
  const abilityMatch =
    text.match(/spellcasting ability is (\w+)/i) ??
    text.match(/using (\w+) as the spellcasting ability/i)
  const dcMatch = text.match(/spell save DC (\d+)/i)
  const bulletMatches = [...text.matchAll(/[•\-]\s*([^:\n]+):\s*([^\n]+)/g)]

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
    if (/at will/i.test(label)) atWill.push(...spells)
    else if (/cantrip/i.test(label)) cantrips.push(...spells)
    else {
      const levelMatch = label.match(/(\d+)(?:st|nd|rd|th)?\s*level/i)
      if (levelMatch) slots[levelMatch[1]] = spells
      else limitedUse.push({ frequency: label, spells })
    }
  }

  if (atWill.length > 0) block.atWill = atWill
  if (cantrips.length > 0) block.cantrips = cantrips
  if (limitedUse.length > 0) block.limitedUse = limitedUse
  if (Object.keys(slots).length > 0) block.slots = slots

  return Object.keys(block).length > 0 ? block : null
}

function parseLegendaryResistances(name: string): number {
  const match = name.match(/\((\d+)\/Day/i)
  return match ? Number(match[1]) : 0
}

export function transformCompendiumMonster(
  raw: CompendiumMonster,
): TransformedRecord<Prisma.ContentMonsterCreateManyInput> {
  const tags = parseNameTags(raw.name)
  const citation = extractCitation(raw.description)
  const source = resolveCompendiumSource(citation.book)
  const { hitPoints, hitDice } = parseHp(raw.hp)

  const traits = raw.trait ?? []
  const proficiencyBonusTrait = traits.find((t) => t.name === 'Proficiency Bonus')
  const legendaryResistanceTrait = traits.find((t) => /legendary resistance/i.test(t.name))
  const spellcastingTrait = traits.find((t) => /spellcasting/i.test(t.name))
  const otherTraits = traits.filter(
    (t) => t !== proficiencyBonusTrait && t !== legendaryResistanceTrait,
  )

  const mainActions = (raw.action ?? []).map(mapAction)
  const legendaryEntries = raw.legendary ?? []
  const lairActions = legendaryEntries
    .filter((a) => a['@_category'] === 'lair')
    .map((a) => ({ name: a.name, description: a.text }))
  const legendaryActions = legendaryEntries
    .filter((a) => a['@_category'] !== 'lair' && !/^legendary actions?\b/i.test(a.name))
    .map(mapAction)

  const spellcasting = spellcastingTrait
    ? parseSpellcastingBlock(String(spellcastingTrait.text))
    : null
  const telepathyRange = extractTelepathyRange(raw.languages) ?? extractTelepathyRange(raw.senses)
  const challengeRating = typeof raw.cr === 'string' ? raw.cr : String(raw.cr)

  // Phase 2.6 fix: previously defaulted to 0 (never actually correct in 5e
  // rules — minimum is +2) whenever no "Proficiency Bonus" trait existed on
  // the record, which was true for 54.5% of real Compendium monsters. Now
  // falls back to the same CR-inference Open5e's transform already uses.
  const proficiencyBonus = proficiencyBonusTrait
    ? Number(proficiencyBonusTrait.text) || 0
    : inferProficiencyBonus(parseChallengeRatingToNumber(challengeRating))

  const extraData: Record<string, unknown> = {
    traits: otherTraits.map((t) => ({ name: t.name, description: String(t.text) })),
    proficiencyBonus,
    legendaryResistances: legendaryResistanceTrait
      ? parseLegendaryResistances(legendaryResistanceTrait.name)
      : 0,
  }
  if (tags.edition) extraData.edition = tags.edition
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (citation.page) extraData.page = citation.page
  if (citation.additionalCitations.length > 0)
    extraData.additionalCitations = citation.additionalCitations
  if (lairActions.length > 0) extraData.lairActions = lairActions
  if (spellcasting) extraData.spellcasting = spellcasting
  if (telepathyRange !== null) extraData.telepathyRange = telepathyRange
  if (raw.environment) extraData.environment = raw.environment
  if (raw.ancestry) extraData.ancestry = raw.ancestry

  const senses = [raw.senses, raw.passive ? `passive Perception ${raw.passive}` : null]
    .filter(Boolean)
    .join(', ')

  const logical = MonsterSchema.parse({
    slug: slugify(tags.name),
    sourceId: source.sourceId,
    name: tags.name,
    size: raw.size,
    monsterType: raw.type,
    alignment: raw.alignment,
    armorClass: Number(raw.ac) || 0,
    hitPoints,
    hitDice,
    speed: parseSpeed(raw.speed),
    abilityScores: {
      strength: raw.str,
      dexterity: raw.dex,
      constitution: raw.con,
      intelligence: raw.int,
      wisdom: raw.wis,
      charisma: raw.cha,
    },
    savingThrows: parseAbilityBonusList(raw.save),
    skills: parseSkillList(raw.skill),
    damageResistances:
      parseCompositeResistanceList(raw.resist).length > 0
        ? parseCompositeResistanceList(raw.resist)
        : null,
    damageImmunities:
      parseCompositeResistanceList(raw.immune).length > 0
        ? parseCompositeResistanceList(raw.immune)
        : null,
    damageVulnerabilities:
      parseCompositeResistanceList(raw.vulnerable).length > 0
        ? parseCompositeResistanceList(raw.vulnerable)
        : null,
    conditionImmunities:
      parseCompositeResistanceList(raw.conditionImmune).length > 0
        ? parseCompositeResistanceList(raw.conditionImmune)
        : null,
    senses: senses || null,
    languages: raw.languages ?? null,
    challengeRating,
    // Compendium's XML has no XP field at all — computed from CR via the
    // standard 5e table, not a passthrough (Phase 2.6).
    experiencePoints: xpFromChallengeRating(challengeRating),
    actions: mainActions,
    legendaryActions: legendaryActions.length > 0 ? legendaryActions : null,
    description: citation.cleanedText || null,
    extraData,
  })

  return {
    row: {
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
    },
    source,
  }
}
