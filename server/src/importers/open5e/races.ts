import type { Prisma } from '@prisma/client'
import { RaceSchema, SubraceSchema, type RaceTrait } from '../../schemas/content/race.js'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { slugFromKey } from './slug.js'
import type { Open5eSpecies, Open5eTrait } from './types.js'

// Only these five SRD 2024 races have a lineage-style trait embedding a
// choice of sub-options directly in the base race record (2024's
// replacement for 2014's separate is_subspecies:true records). Each has a
// genuinely different table/prose shape — verified live, not assumed — so
// each gets its own parser rather than one generic one.
const LINEAGE_TRAIT_BY_RACE: Record<string, string> = {
  Elf: 'Elven Lineage',
  Dragonborn: 'Draconic Ancestry',
  Gnome: 'Gnomish Lineage',
  Goliath: 'Giant Ancestry',
  Tiefling: 'Fiendish Legacy',
}

interface LineageOption {
  nameSuffix: string
  traits: RaceTrait[]
}

type LineageParser = (trait: Open5eTrait) => LineageOption[]

function findTrait(traits: Open5eTrait[], name: string): Open5eTrait | undefined {
  return traits.find((t) => t.name.toLowerCase() === name.toLowerCase())
}

const SIZE_WORDS = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']

function parseSize(desc: string): string[] {
  const lower = desc.toLowerCase()
  const found = SIZE_WORDS.filter((s) => lower.includes(s))
  return found.length > 0 ? found : ['medium']
}

function parseSpeed(desc: string): { walk: number } {
  const match = desc.match(/(\d+)\s*feet/)
  return { walk: match ? Number(match[1]) : 30 }
}

function extractSize(traits: Open5eTrait[]): string[] {
  const t = findTrait(traits, 'Size')
  return t ? parseSize(t.desc) : ['medium']
}

function extractSpeed(traits: Open5eTrait[]): { walk: number } {
  const t = findTrait(traits, 'Speed')
  return t ? parseSpeed(t.desc) : { walk: 30 }
}

function baseTraits(traits: Open5eTrait[], excludeNames: string[]): RaceTrait[] {
  const excluded = new Set(['size', 'speed', ...excludeNames.map((n) => n.toLowerCase())])
  return traits
    .filter((t) => !excluded.has(t.name.toLowerCase()))
    .map((t) => ({ name: t.name, description: t.desc, level: 1 }))
}

// Parses a markdown pipe table into rows of cells, header row first,
// dash-separator row dropped. Shared by the two lineage traits that happen
// to use the same table shape (Elf, Tiefling) — the shape match is
// coincidental, not an assumption; Dragonborn's table is a different
// (2-column) shape and gets its own row handling below.
function parseMarkdownTable(text: string): string[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)))
}

function fourColumnLineageOptions(trait: Open5eTrait): LineageOption[] {
  const rows = parseMarkdownTable(trait.desc)
  if (rows.length < 2) return []
  const [, ...dataRows] = rows
  return dataRows
    .filter((row) => row.length >= 4 && row[0].length > 0)
    .map(([name, level1, level3, level5]) => ({
      nameSuffix: name,
      traits: [
        { name: 'Level 1 Benefit', description: level1, level: 1 },
        { name: 'Level 3 Benefit', description: level3, level: 3 },
        { name: 'Level 5 Benefit', description: level5, level: 5 },
      ],
    }))
}

const parseElfLineage: LineageParser = fourColumnLineageOptions
const parseTieflingLegacy: LineageParser = fourColumnLineageOptions

const parseDragonbornAncestry: LineageParser = (trait) => {
  const rows = parseMarkdownTable(trait.desc)
  if (rows.length < 2) return []
  const [, ...dataRows] = rows
  return dataRows
    .filter((row) => row.length >= 2 && row[0].length > 0)
    .map(([dragonType, damageType]) => ({
      nameSuffix: dragonType,
      traits: [
        {
          name: 'Draconic Ancestry',
          description: `Your draconic ancestor is the ${dragonType} dragon. Your Breath Weapon and Damage Resistance traits deal ${damageType} damage.`,
          level: 1,
        },
      ],
    }))
}

// "**Option Name.** Prose describing the benefit..." — one paragraph per
// option, no table at all.
const parseGnomeLineage: LineageParser = (trait) => {
  const paragraphs = trait.desc
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const options: LineageOption[] = []
  for (const p of paragraphs) {
    const match = p.match(/^\*\*(.+?)\.\*\*/)
    if (match) {
      options.push({
        nameSuffix: match[1].trim(),
        traits: [{ name: trait.name, description: p, level: 1 }],
      })
    }
  }
  return options
}

// "- **Benefit Name (Ancestor Type)**. Prose..." — dash-bulleted, with the
// grouping label in parentheses rather than as the primary label.
const parseGoliathAncestry: LineageParser = (trait) => {
  const lines = trait.desc
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
  const options: LineageOption[] = []
  for (const line of lines) {
    const match = line.match(/^-\s*\*\*(.+?)\s*\(([^)]+)\)\*\*\.?\s*(.*)$/)
    if (match) {
      const [, , shortName] = match
      options.push({
        nameSuffix: shortName.trim(),
        traits: [{ name: trait.name, description: line.replace(/^-\s*/, ''), level: 1 }],
      })
    }
  }
  return options
}

const LINEAGE_PARSERS: Record<string, LineageParser> = {
  Elf: parseElfLineage,
  Dragonborn: parseDragonbornAncestry,
  Gnome: parseGnomeLineage,
  Goliath: parseGoliathAncestry,
  Tiefling: parseTieflingLegacy,
}

export function transformRace(
  raw: Open5eSpecies,
  sourceId: string,
): Prisma.ContentRaceCreateManyInput {
  const documentKey = raw.document.key
  const lineageTraitName = LINEAGE_TRAIT_BY_RACE[raw.name]

  const logical = RaceSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    size: extractSize(raw.traits),
    speed: extractSpeed(raw.traits),
    traits: baseTraits(raw.traits, lineageTraitName ? [lineageTraitName] : []),
    description: raw.desc || '',
    extraData: null,
    parentRaceId: null,
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    size: toJsonString(logical.size) as string,
    speed: toJsonString(logical.speed) as string,
    traits: toJsonString(logical.traits) as string,
    description: logical.description,
    extraData: toJsonString(logical.extraData),
    parentRaceId: null,
  }
}

// 2014/third-party path: a real separate record with is_subspecies: true.
export function transformSubspecies(
  raw: Open5eSpecies,
  parentRaceId: string,
  sourceId: string,
): Prisma.ContentSubraceCreateManyInput {
  const documentKey = raw.document.key
  const sizeTrait = findTrait(raw.traits, 'Size')
  const speedTrait = findTrait(raw.traits, 'Speed')

  const logical = SubraceSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    raceId: parentRaceId,
    name: raw.name,
    description: raw.desc || null,
    size: sizeTrait ? parseSize(sizeTrait.desc) : null,
    speed: speedTrait ? parseSpeed(speedTrait.desc) : null,
    traits: baseTraits(raw.traits, []),
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
    extraData: null,
  }
}

// 2024 path: parses the base race's lineage-choice trait apart into
// synthetic standalone ContentSubrace rows (Wood Elf, Drow, ...). Returns
// [] for races with no lineage trait — most races don't have one.
export function synthesizeSubracesFromLineageTrait(
  raceId: string,
  raw: Open5eSpecies,
  sourceId: string,
): Prisma.ContentSubraceCreateManyInput[] {
  const lineageTraitName = LINEAGE_TRAIT_BY_RACE[raw.name]
  const parser = LINEAGE_PARSERS[raw.name]
  if (!lineageTraitName || !parser) return []

  const lineageTrait = findTrait(raw.traits, lineageTraitName)
  if (!lineageTrait) return []

  const raceSlug = slugFromKey(raw.key, raw.document.key)

  return parser(lineageTrait).map((option) => {
    const logical = SubraceSchema.parse({
      slug: `${raceSlug}-${slugify(option.nameSuffix)}`,
      sourceId,
      raceId,
      name: option.nameSuffix,
      description: null,
      size: null,
      speed: null,
      traits: option.traits,
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
      extraData: null,
    }
  })
}
