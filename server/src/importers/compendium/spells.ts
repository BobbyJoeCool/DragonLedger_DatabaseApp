import type { Prisma } from '@prisma/client'
import { ClassOptionSchema } from '../../schemas/content/classOption.js'
import { SpellSchema } from '../../schemas/content/spell.js'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { parseNameTags } from './nameTags.js'
import { resolveCompendiumSource, type ResolvedCompendiumSource } from './sourceBooks.js'
import type { CompendiumSpell } from './types.js'

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
  if (tags.edition) extraData.edition = tags.edition
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
        description: logical.description,
        prerequisite: null,
        extraData: toJsonString(logical.extraData),
      },
      source,
    }
  }

  const roll = raw.roll ?? []
  if (roll.length > 0) {
    extraData.scalingDice = roll.map((r) => ({
      dice: typeof r === 'string' ? r : (r['#text'] ?? null),
      description: typeof r === 'string' ? null : (r['@_description'] ?? null),
      level: typeof r === 'string' ? null : (r['@_level'] ?? null),
    }))
  }

  const logical = SpellSchema.parse({
    slug: slugify(tags.name),
    sourceId: source.sourceId,
    name: tags.name,
    level: Number(raw.level) || 0,
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
