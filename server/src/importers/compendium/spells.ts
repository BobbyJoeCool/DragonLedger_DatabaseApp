import type { Prisma } from '@prisma/client'
import { ClassOptionSchema, SpellSchema } from '@dragonledger/content-types'
import { scalingTriggerForSpellLevel, type SpellScalingEntry } from '../shared/spellScaling.js'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { editionFromTag, parseNameTags } from './nameTags.js'
import { resolveCompendiumSource, type ResolvedCompendiumSource } from './sourceBooks.js'
import type { CompendiumSpell } from './types.js'

// Phase 2.6 — new prose-parsers against Compendium's real 2024 stat-block
// text (Compendium's XML has no structured equivalent of Open5e's API
// fields for these, unlike the mostly-passthrough fields elsewhere in this
// file). Best-effort, same caveat as every other prose-parsed field in this
// pipeline: validated against a real sample (see phase-2.6 dev log), not
// guaranteed exhaustive — a parse miss never loses data since the raw text
// is always preserved verbatim in `description`/`components`.
const ABILITY_WORD_RE =
  /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i

export function extractSavingThrow(text: string): string | null {
  const m = text.match(ABILITY_WORD_RE)
  return m ? m[1].toLowerCase() : null
}

// Matches both dice ("2d6", "5d10 + 2") and the rarer flat-number case
// ("5 Cold damage" — Armor of Agathys). Grabs only the first occurrence in
// the description (usually the spell's base/1st-level damage; a spell's
// upcast damage is already captured separately via extraData.scaling).
const DAMAGE_RE = /(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+(\w+)\s+damage/i

export function extractDamage(text: string): { damageRoll: string | null; damageTypes: string[] } {
  const m = text.match(DAMAGE_RE)
  if (!m) return { damageRoll: null, damageTypes: [] }
  return { damageRoll: m[1].replace(/\s+/g, ''), damageTypes: [m[2].toLowerCase()] }
}

export function extractAttackRoll(text: string): boolean {
  return /spell attack/i.test(text)
}

// The consumption clause lives in the material-component parenthetical
// inside <components> ("a diamond worth 300+ GP, which the spell
// consumes"), not in the description body.
export function extractMaterialConsumed(components: string): boolean {
  return /consum(e|ed)/i.test(components)
}

const SCHOOL_CODES: Record<string, string> = {
  A: 'abjuration',
  C: 'conjuration',
  D: 'divination',
  EN: 'enchantment',
  EV: 'evocation',
  I: 'illusion',
  N: 'necromancy',
  T: 'transmutation',
}

export type SpellOrManeuver =
  | { kind: 'spell'; row: Prisma.ContentSpellCreateManyInput; source: ResolvedCompendiumSource }
  | {
      kind: 'classOption'
      row: Prisma.ContentClassOptionCreateManyInput
      source: ResolvedCompendiumSource
    }

// Real, unanticipated finding: Maneuvers, Metamagic, and — beyond what the
// design doc anticipated — several other class-gated option pools
// ("Arcane Shot Options", "Channeling Options", "Psionic Discipline
// Options") all hijack the <spell> schema the same way and aren't spells
// at all. Real <classes> shapes seen: a bare "<Pool> Options [5.5e]", and
// a class-scoped "Fighter (Arcane Archer (UA)): Arcane Shot Options" —
// the pool name is whatever precedes a trailing " Options", after the
// last colon if one is present. Eldritch Invocations are the one exception
// to the "Options" suffix convention — real data reads
// "Eldritch Invocations [5.5e]" with no "Options" at all.
function detectClassOptionPool(rawClasses: string | undefined): string | null {
  const stripped = parseNameTags((rawClasses ?? '').trim()).name
  const afterColon = stripped.includes(':')
    ? stripped.slice(stripped.lastIndexOf(':') + 1)
    : stripped
  if (/^eldritch invocations?\s*$/i.test(afterColon.trim())) return 'Eldritch Invocation'
  const match = afterColon.match(/^\s*(.+?)\s+Options\s*$/i)
  return match ? match[1].trim() : null
}

export function transformSpellOrManeuver(raw: CompendiumSpell): SpellOrManeuver {
  const tags = parseNameTags(raw.name)
  const citation = extractCitation(raw.text)
  const source = resolveCompendiumSource(citation.book)

  const extraData: Record<string, unknown> = {}
  const edition = editionFromTag(tags.edition)
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (citation.page) extraData.page = citation.page
  if (citation.additionalCitations.length > 0)
    extraData.additionalCitations = citation.additionalCitations

  const pool = detectClassOptionPool(raw.classes)
  if (pool) {
    // Real names are prefixed with their own pool ("Maneuver: Ambush",
    // "Metamagic: Careful Spell") — redundant once `pool` itself carries
    // that, so it's stripped from the stored name.
    const optionName = tags.name.replace(/^.*?:\s*/, '')
    const logical = ClassOptionSchema.parse({
      slug: slugify(optionName),
      sourceId: source.sourceId,
      classId: null,
      pool,
      name: optionName,
      description: citation.cleanedText,
      prerequisite: null,
      extraData: Object.keys(extraData).length > 0 ? extraData : null,
    })
    return {
      kind: 'classOption',
      row: {
        slug: logical.slug,
        sourceId: logical.sourceId,
        classId: null,
        pool: logical.pool,
        name: logical.name,
        edition,
        description: logical.description,
        prerequisite: null,
        extraData: toJsonString(logical.extraData),
      },
      source,
    }
  }

  const spellLevel = Number(raw.level) || 0
  const roll = raw.roll ?? []
  if (roll.length > 0) {
    const trigger = scalingTriggerForSpellLevel(spellLevel)
    const scaling = roll
      .map((r): SpellScalingEntry | null => {
        const dice = typeof r === 'string' ? r : r['#text']
        if (!dice) return null
        const rawLevel = typeof r === 'string' ? null : (r['@_level'] ?? null)
        return {
          trigger,
          triggerValue: rawLevel !== null && rawLevel !== '' ? Number(rawLevel) : null,
          dice,
          description: typeof r === 'string' ? null : (r['@_description'] ?? null),
        }
      })
      .filter((e): e is SpellScalingEntry => e !== null)
    if (scaling.length > 0) extraData.scaling = scaling
  }

  const savingThrow = extractSavingThrow(citation.cleanedText)
  if (savingThrow) extraData.savingThrow = savingThrow
  const { damageRoll, damageTypes } = extractDamage(citation.cleanedText)
  if (damageRoll) extraData.damageRoll = damageRoll
  if (damageTypes.length > 0) extraData.damageTypes = damageTypes
  if (extractAttackRoll(citation.cleanedText)) extraData.attackRoll = true
  if (extractMaterialConsumed(raw.components ?? '')) extraData.materialConsumed = true

  const logical = SpellSchema.parse({
    slug: slugify(tags.name),
    sourceId: source.sourceId,
    name: tags.name,
    level: spellLevel,
    school: SCHOOL_CODES[raw.school] ?? (raw.school ?? '').toLowerCase(),
    castingTime: raw.time,
    range: raw.range,
    components: raw.components,
    material: null,
    duration: raw.duration,
    concentration: /concentration/i.test(raw.duration ?? ''),
    ritual: raw.ritual !== undefined,
    classes: (raw.classes ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    description: citation.cleanedText,
    higherLevels: null,
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    kind: 'spell',
    row: {
      slug: logical.slug,
      sourceId: logical.sourceId,
      name: logical.name,
      edition,
      level: logical.level,
      school: logical.school,
      castingTime: logical.castingTime,
      range: logical.range,
      components: logical.components,
      material: logical.material ?? null,
      duration: logical.duration,
      concentration: logical.concentration,
      ritual: logical.ritual,
      classes: toJsonString(logical.classes) as string,
      description: logical.description,
      higherLevels: logical.higherLevels ?? null,
      extraData: toJsonString(logical.extraData),
    },
    source,
  }
}
