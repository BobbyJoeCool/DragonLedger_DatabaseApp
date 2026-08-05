import type { Prisma } from '@prisma/client'
import { ClassSchema, SubclassSchema } from '../../schemas/content/class.js'
import { ABILITY_NAME_TO_CODE } from '../open5e/abilities.js'
import { splitOptionList } from '../open5e/proseGrant.js'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { parseNameTags } from './nameTags.js'
import { resolveCompendiumSource, type ResolvedCompendiumSource } from './sourceBooks.js'
import type { CompendiumAutolevelFeature, CompendiumClass } from './types.js'
import type { TransformedRecord } from './feats.js'

const ABILITY_NAMES = new Set(Object.keys(ABILITY_NAME_TO_CODE))

// No Compendium field exists for primary/multiclassing ability at all
// (<spellAbility> is casting ability, a different concept) — same
// hardcoded table Open5e needed, reused here for the same reason.
const PRIMARY_ABILITY_BY_CLASS: Record<string, { abilities: string[]; logic: 'AND' | 'OR' }> = {
  Barbarian: { abilities: ['STR'], logic: 'OR' },
  Bard: { abilities: ['CHA'], logic: 'OR' },
  Cleric: { abilities: ['WIS'], logic: 'OR' },
  Druid: { abilities: ['WIS'], logic: 'OR' },
  Fighter: { abilities: ['STR', 'DEX'], logic: 'OR' },
  Monk: { abilities: ['DEX', 'WIS'], logic: 'AND' },
  Paladin: { abilities: ['STR', 'CHA'], logic: 'AND' },
  Ranger: { abilities: ['DEX', 'WIS'], logic: 'AND' },
  Rogue: { abilities: ['DEX'], logic: 'OR' },
  Sorcerer: { abilities: ['CHA'], logic: 'OR' },
  Warlock: { abilities: ['CHA'], logic: 'OR' },
  Wizard: { abilities: ['INT'], logic: 'OR' },
}

function parseProficiencyField(proficiency: string | undefined, numSkills: number) {
  const parts = splitOptionList(proficiency ?? '')
  const savingThrows: string[] = []
  const skillPool: string[] = []
  for (const part of parts) {
    if (ABILITY_NAMES.has(part.toLowerCase())) savingThrows.push(part)
    else skillPool.push(part)
  }
  const skillChoices =
    skillPool.length > 0
      ? {
          fixed: [],
          choices: [
            { type: 'select' as const, count: numSkills || 1, from: skillPool, amount: null },
          ],
        }
      : { fixed: [], choices: [] }
  return { savingThrows, skillChoices }
}

interface FlatFeature {
  raw: CompendiumAutolevelFeature
  level: number
}

function flattenFeatures(cls: CompendiumClass): FlatFeature[] {
  const out: FlatFeature[] = []
  for (const al of cls.autolevel ?? []) {
    const level = Number(al['@_level']) || 1
    for (const f of al.feature ?? []) out.push({ raw: f, level })
  }
  return out
}

interface SubclassGroup {
  marker: FlatFeature
  rawSuffix: string
  children: FlatFeature[]
}

// Real finding, overturning the design doc's guessed rule (parenthetical
// suffix + optional trailing year on every feature — that produces false
// positives, e.g. a lore-only feature "Veilmark Information (Zamanora)"
// isn't a subclass at all). The reliable signal is a dedicated marker
// feature literally named "<Class> Subclass: <Name>"; every subsequent
// feature whose name ends in "(<the marker's raw, untrimmed suffix>)"
// belongs to that subclass. Matching against the *raw* (tag-unstripped)
// suffix — not the cleaned display name — is required to correctly tell
// apart same-named variants cited from different books (e.g. "Knowledge
// Domain (Legacy)" vs "Knowledge Domain (UA)" both exist under Cleric).
function groupIntoSubclasses(features: FlatFeature[]): {
  groups: SubclassGroup[]
  baseFeatures: FlatFeature[]
} {
  const groups: SubclassGroup[] = []
  const markerSet = new Set<FlatFeature>()

  for (const f of features) {
    const match = f.raw.name.match(/^.+ Subclass:\s*(.+)$/)
    if (match) {
      groups.push({ marker: f, rawSuffix: match[1].trim(), children: [] })
      markerSet.add(f)
    }
  }

  const baseFeatures: FlatFeature[] = []
  for (const f of features) {
    if (markerSet.has(f)) continue
    const group = groups.find((g) => f.raw.name.endsWith(`(${g.rawSuffix})`))
    if (group) group.children.push(f)
    else baseFeatures.push(f)
  }

  return { groups, baseFeatures }
}

function toFeatureRecord(f: FlatFeature) {
  const citation = extractCitation(f.raw.text)
  return { name: f.raw.name, description: citation.cleanedText, level: f.level }
}

export interface TransformedClassResult {
  classResult: TransformedRecord<Prisma.ContentClassCreateManyInput>
  // parentClassName carries the *base class's* name (e.g. "Cleric"), not
  // the subclass's own — cross-source parent resolution needs to search
  // for a ContentClass matching the parent, and the two names are easy to
  // conflate since both are plain strings floating around the same loop.
  subclasses: {
    row: Omit<Prisma.ContentSubclassCreateManyInput, 'classId'>
    source: ResolvedCompendiumSource
    parentClassName: string
  }[]
}

export function transformCompendiumClass(raw: CompendiumClass): TransformedClassResult {
  const tags = parseNameTags(raw.name)
  const allFeatures = flattenFeatures(raw)
  const { groups, baseFeatures } = groupIntoSubclasses(allFeatures)

  // The class's own citation comes from its first trait (base classes
  // carry a top-level <trait> with the class's own flavor/citation text).
  const classTraitText = (raw.trait ?? []).map((t) => t.text).join('\n\n')
  const citation = extractCitation(classTraitText)
  const source = resolveCompendiumSource(citation.book)

  const { savingThrows, skillChoices } = parseProficiencyField(
    raw.proficiency,
    Number(raw.numSkills) || 0,
  )
  const primaryAbility = PRIMARY_ABILITY_BY_CLASS[tags.name] ?? {
    abilities: raw.spellAbility
      ? [ABILITY_NAME_TO_CODE[raw.spellAbility.toLowerCase()]].filter((v): v is string =>
          Boolean(v),
        )
      : [],
    logic: 'OR' as const,
  }

  const extraData: Record<string, unknown> = {
    features: baseFeatures.map(toFeatureRecord),
  }
  if (tags.edition) extraData.edition = tags.edition
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (raw.tools && raw.tools.toLowerCase() !== 'none') extraData.toolProfs = raw.tools
  if (raw.slotsReset) extraData.slotsReset = raw.slotsReset
  if (citation.page) extraData.page = citation.page

  const hitDie = Number(raw.hd) || 8
  const armorProfs = raw.armor && raw.armor.toLowerCase() !== 'none' ? [raw.armor] : []
  const weaponProfs = raw.weapons && raw.weapons.toLowerCase() !== 'none' ? [raw.weapons] : []

  const logical = ClassSchema.parse({
    slug: slugify(tags.name),
    sourceId: source.sourceId,
    name: tags.name,
    hitDie,
    primaryAbility,
    savingThrows,
    armorProfs,
    weaponProfs,
    skillChoices,
    spellcastingAbility: raw.spellAbility ?? null,
    description: citation.cleanedText || '',
    extraData,
  })

  const classResult: TransformedRecord<Prisma.ContentClassCreateManyInput> = {
    row: {
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
    },
    source,
  }

  // Built per-subclass with its own try/catch — a handful of real marker
  // features in the source file turned out to be genuinely malformed
  // (e.g. "Wizard Subclass:  (Legacy)", blank name after tag-stripping),
  // and one bad subclass shouldn't cost the class's other, valid
  // subclasses (or the base class itself).
  const subclasses: TransformedClassResult['subclasses'] = []
  for (const group of groups) {
    const subTags = parseNameTags(group.rawSuffix)
    if (!subTags.name) continue // no real name survives tag-stripping — nothing usable to store

    const markerCitation = extractCitation(group.marker.raw.text)
    const subSource = resolveCompendiumSource(markerCitation.book)

    const subExtraData: Record<string, unknown> = { features: group.children.map(toFeatureRecord) }
    if (subTags.edition) subExtraData.edition = subTags.edition
    if (subTags.homebrew) subExtraData.homebrew = true
    if (subTags.thirdParty) subExtraData.thirdParty = true
    if (subTags.unearthedArcana) subExtraData.unearthedArcana = true
    if (subTags.otherTags.length > 0) subExtraData.otherTags = subTags.otherTags
    if (markerCitation.page) subExtraData.page = markerCitation.page

    const subLogical = SubclassSchema.parse({
      slug: `${slugify(tags.name)}-${slugify(subTags.name)}`,
      sourceId: subSource.sourceId,
      classId: null,
      name: subTags.name,
      description: markerCitation.cleanedText || '',
      extraData: subExtraData,
    })

    subclasses.push({
      row: {
        slug: subLogical.slug,
        sourceId: subLogical.sourceId,
        name: subLogical.name,
        description: subLogical.description,
        extraData: toJsonString(subLogical.extraData),
      },
      source: subSource,
      parentClassName: tags.name,
    })
  }

  return { classResult, subclasses }
}
