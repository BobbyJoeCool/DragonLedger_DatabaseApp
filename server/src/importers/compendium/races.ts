import type { Prisma } from '@prisma/client'
import { RaceSchema, SubraceSchema, type RaceTrait } from '@dragonledger/content-types'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { parseNameTags } from './nameTags.js'
import { resolveCompendiumSource, type ResolvedCompendiumSource } from './sourceBooks.js'
import type { CompendiumRace, CompendiumRaceTrait } from './types.js'

// Real, unanticipated finding: <ancestry> doesn't appear in the file at
// all despite being documented, and roughly as many races use a
// parenthetical campaign-setting qualifier ("Human (Zendikar)", "Orc
// (Eberron)" — note the comma *inside* the parens in some, e.g. "Human
// (Innistrad, Kessig)", which would break a naive comma-split) as use the
// documented "ParentRace, SubraceName" comma convention. Per a deliberate
// scope decision, only the literal outside-parens comma pattern creates a
// parent link; everything else imports as its own independent race — see
// DevTools/Claude/phase-2.5.md.
function splitParentSubraceName(name: string): { parentName: string; subraceName: string } | null {
  let depth = 0
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      return { parentName: name.slice(0, i).trim(), subraceName: name.slice(i + 1).trim() }
    }
  }
  return null
}

const UNCOLUMNED_FIELD_LABELS: Record<string, string> = {
  ability: 'Ability Score Increase',
  resist: 'Damage Resistance',
  vulnerable: 'Damage Vulnerability',
  conditionResist: 'Condition Resistance',
  conditionImmune: 'Condition Immunity',
  proficiency: 'Proficiencies',
  weapons: 'Weapon Proficiencies',
  tools: 'Tool Proficiencies',
  languages: 'Languages',
}

// Resolved per outline.md: synthesize into traits[] (kept as the one
// canonical place a race's mechanical grants live, consistent with how
// Open5e represents everything as trait prose) *and* keep the raw value in
// extraData as a backup/cross-check.
function uncolumnedFieldsToTraits(
  raw: CompendiumRace,
  extraData: Record<string, unknown>,
): RaceTrait[] {
  const traits: RaceTrait[] = []
  for (const [field, label] of Object.entries(UNCOLUMNED_FIELD_LABELS)) {
    const value = (raw as unknown as Record<string, string | undefined>)[field]
    if (value && value.trim()) {
      traits.push({ name: label, description: value.trim(), level: 1 })
      extraData[`raw${field[0].toUpperCase()}${field.slice(1)}`] = value.trim()
    }
  }
  return traits
}

function parseSpeed(raw: CompendiumRace): {
  walk: number
  fly?: number
  swim?: number
  climb?: number
} {
  const walk = Number(raw.speed) || 30
  const result: { walk: number; fly?: number; swim?: number; climb?: number } = { walk }
  if (raw.speedOther) {
    for (const m of raw.speedOther.matchAll(/(\w+)\s+(\d+)\s*ft/gi)) {
      const key = m[1].toLowerCase()
      if (key === 'fly' || key === 'swim' || key === 'climb') result[key] = Number(m[2])
    }
  }
  return result
}

function parseSize(sizeCode: string | undefined): string[] {
  const map: Record<string, string> = {
    T: 'tiny',
    S: 'small',
    M: 'medium',
    L: 'large',
    H: 'huge',
    G: 'gargantuan',
  }
  if (!sizeCode) return ['medium']
  return sizeCode
    .split(/[,/]/)
    .map((c) => map[c.trim().toUpperCase()] ?? c.trim().toLowerCase())
    .filter(Boolean)
}

interface CommonFields {
  tags: ReturnType<typeof parseNameTags>
  citation: ReturnType<typeof extractCitation>
  source: ResolvedCompendiumSource
  traits: RaceTrait[]
  extraData: Record<string, unknown>
  size: string[]
  speed: { walk: number; fly?: number; swim?: number; climb?: number }
}

function buildCommonFields(raw: CompendiumRace): CommonFields {
  const tags = parseNameTags(raw.name)
  const traitList = raw.trait ?? []
  const descriptionTrait = traitList.find((t) => /^description/i.test(t.name))
  const creatureTypeTrait = traitList.find((t) => /^creature type/i.test(t.name))
  const citation = extractCitation(descriptionTrait?.text ?? '')
  const source = resolveCompendiumSource(citation.book)

  const extraData: Record<string, unknown> = {}
  if (tags.edition) extraData.edition = tags.edition
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (creatureTypeTrait) extraData.creatureType = creatureTypeTrait.text
  if (citation.page) extraData.page = citation.page

  const traits: RaceTrait[] = [
    ...uncolumnedFieldsToTraits(raw, extraData),
    ...traitList
      .filter((t) => t !== descriptionTrait && t !== creatureTypeTrait)
      .map((t): RaceTrait => {
        const stripped = parseNameTags(t.name)
        const cite = extractCitation(t.text)
        return { name: stripped.name, description: cite.cleanedText, level: 1 }
      }),
  ]

  return {
    tags,
    citation,
    source,
    traits,
    extraData,
    size: parseSize(raw.size),
    speed: parseSpeed(raw),
  }
}

// Subraces open with the parent's lore verbatim before their own content.
// Mandatory safeguard: strip nothing if no parent description is available
// or no confident paragraph-level match is found — never guess and risk
// cutting real subrace-specific content, and never strip to empty.
export function stripDuplicatedParentDescription(
  subraceDescription: string,
  parentDescription: string | null,
): { description: string; skipped: boolean } {
  if (!parentDescription) return { description: subraceDescription, skipped: true }

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const subParas = subraceDescription.split(/\n\n+/)
  const parentParas = parentDescription.split(/\n\n+/).map(normalize)

  let matchCount = 0
  for (let i = 0; i < subParas.length && i < parentParas.length; i++) {
    if (normalize(subParas[i]) === parentParas[i]) matchCount++
    else break
  }

  if (matchCount === 0 || matchCount >= subParas.length) {
    return { description: subraceDescription, skipped: true }
  }

  return { description: subParas.slice(matchCount).join('\n\n').trim(), skipped: false }
}

export type CompendiumRaceResult =
  | { kind: 'race'; row: Prisma.ContentRaceCreateManyInput; source: ResolvedCompendiumSource }
  | {
      kind: 'subrace'
      parentName: string
      source: ResolvedCompendiumSource
      buildRow: (
        parentId: string | null,
        parentDescription: string | null,
      ) => Prisma.ContentSubraceCreateManyInput
    }

export function transformCompendiumRace(raw: CompendiumRace): CompendiumRaceResult {
  const split = splitParentSubraceName(raw.name)

  if (!split) {
    const common = buildCommonFields(raw)
    const logical = RaceSchema.parse({
      slug: slugify(common.tags.name),
      sourceId: common.source.sourceId,
      name: common.tags.name,
      size: common.size,
      speed: common.speed,
      traits: common.traits,
      description: '',
      extraData: Object.keys(common.extraData).length > 0 ? common.extraData : null,
      parentRaceId: null,
    })
    return {
      kind: 'race',
      row: {
        slug: logical.slug,
        sourceId: logical.sourceId,
        name: logical.name,
        size: toJsonString(logical.size) as string,
        speed: toJsonString(logical.speed) as string,
        traits: toJsonString(logical.traits) as string,
        description: logical.description,
        extraData: toJsonString(logical.extraData),
        parentRaceId: null,
      },
      source: common.source,
    }
  }

  // Subrace path — real finding: unlike Open5e's 2024 lineage-choice
  // shape, a Compendium subrace file is a complete, standalone record with
  // its own full trait list (Darkvision, Fey Ancestry, etc. all repeated,
  // not just the subrace-specific delta) — no lineage-table synthesis is
  // needed here at all.
  const { parentName, subraceName } = split
  const rawWithSubraceName = { ...raw, name: subraceName }
  const common = buildCommonFields(rawWithSubraceName)
  const parentTags = parseNameTags(parentName)

  return {
    kind: 'subrace',
    parentName: parentTags.name,
    source: common.source,
    buildRow: (parentId, parentDescription) => {
      const descriptionTrait = (raw.trait ?? []).find((t: CompendiumRaceTrait) =>
        /^description/i.test(t.name),
      )
      const rawDescription = descriptionTrait
        ? extractCitation(descriptionTrait.text).cleanedText
        : ''
      const { description, skipped } = stripDuplicatedParentDescription(
        rawDescription,
        parentDescription,
      )
      if (skipped) common.extraData.descriptionStrippingSkipped = true
      if (!parentId) common.extraData.unresolvedRaceName = parentTags.name

      const logical = SubraceSchema.parse({
        slug: `${slugify(parentTags.name)}-${slugify(common.tags.name)}`,
        sourceId: common.source.sourceId,
        raceId: parentId,
        name: common.tags.name,
        description: description || null,
        size: common.size,
        speed: common.speed,
        traits: common.traits,
        extraData: Object.keys(common.extraData).length > 0 ? common.extraData : null,
      })

      return {
        slug: logical.slug,
        sourceId: logical.sourceId,
        raceId: logical.raceId ?? null,
        name: logical.name,
        description: logical.description ?? null,
        size: toJsonString(logical.size),
        speed: toJsonString(logical.speed),
        traits: toJsonString(logical.traits) as string,
        extraData: toJsonString(logical.extraData),
      }
    },
  }
}
