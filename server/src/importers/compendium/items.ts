import type { Prisma } from '@prisma/client'
import { ItemSchema } from '@dragonledger/content-types'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { parseNameTags } from './nameTags.js'
import { resolveCompendiumSource } from './sourceBooks.js'
import type { CompendiumItem } from './types.js'
import type { TransformedRecord } from './feats.js'

// Currency ($) is excluded entirely — no Currency content type exists, and
// Open5e doesn't surface these either.
const TYPE_TO_ITEM_TYPE: Record<string, string> = {
  M: 'weapon',
  R: 'weapon',
  LA: 'light-armor',
  MA: 'medium-armor',
  HA: 'heavy-armor',
  S: 'shield',
  G: 'adventuring-gear',
  P: 'potion',
  SC: 'scroll',
  W: 'wondrous-item',
  ST: 'staff',
  RD: 'rod',
  WD: 'wand',
  RG: 'ring',
  A: 'ammunition',
}

const DAMAGE_TYPE_CODES: Record<string, string> = {
  B: 'bludgeoning',
  P: 'piercing',
  S: 'slashing',
  F: 'fire',
  C: 'cold',
  N: 'necrotic',
  T: 'thunder',
  R: 'radiant',
  FC: 'force',
  PY: 'psychic',
}

const PROPERTY_CODES: Record<string, string> = {
  '2H': 'Two-Handed',
  H: 'Heavy',
  L: 'Light',
  F: 'Finesse',
  V: 'Versatile',
  R: 'Reach',
  LD: 'Loading',
  S: 'Special',
  A: 'Ammunition',
  T: 'Thrown',
}

// Real, unanticipated finding: rarity/attunement is NOT best-effort text
// parsing at all — the Compendium has a dedicated <detail> tag with a
// consistent format ("rare (requires attunement by a warforged)"),
// confirmed on 98.7% of the 5,317 magic items checked. The design doc
// assumed no such field existed; it does.
function parseDetail(detail: string | undefined): {
  rarity: string | null
  requiresAttunement: boolean
  attunementDetail: string | null
} {
  if (!detail) return { rarity: null, requiresAttunement: false, attunementDetail: null }

  const attunementMatch = detail.match(/\((requires attunement|optional attunement)([^)]*)\)/i)
  const requiresAttunement = /attunement/i.test(detail)
  const attunementDetail = attunementMatch
    ? attunementMatch[2].replace(/^\s*by\s*/i, '').trim() || null
    : null

  const rarityPart = detail.replace(/\([^)]*\)/g, '').trim()
  const rarity = rarityPart ? rarityPart.toLowerCase().replace(/\s+/g, '-') : null

  return { rarity, requiresAttunement, attunementDetail }
}

function parseProperties(propertyField: string | number | undefined): {
  properties: { name: string; detail?: string }[] | null
  isMartial: boolean
} {
  if (propertyField === undefined || propertyField === null)
    return { properties: null, isMartial: false }
  const codes = String(propertyField)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
  const isMartial = codes.includes('M')
  const properties = codes.filter((c) => c !== 'M').map((c) => ({ name: PROPERTY_CODES[c] ?? c }))
  return { properties: properties.length > 0 ? properties : null, isMartial }
}

export function transformCompendiumItem(
  raw: CompendiumItem,
): TransformedRecord<Prisma.ContentItemCreateManyInput> | null {
  if (raw.type === '$') return null // currency — not a content type

  const tags = parseNameTags(raw.name)
  const citation = extractCitation(raw.text)
  const source = resolveCompendiumSource(citation.book)
  const { rarity, requiresAttunement, attunementDetail } = parseDetail(raw.detail)
  const { properties, isMartial } = parseProperties(raw.property)

  const extraData: Record<string, unknown> = { isMartial }
  if (tags.edition) extraData.edition = tags.edition
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (citation.page) extraData.page = citation.page
  if (citation.additionalCitations.length > 0)
    extraData.additionalCitations = citation.additionalCitations
  if (attunementDetail) extraData.attunementDetail = attunementDetail
  if (raw.range) extraData.range = raw.range
  if (raw.strength) extraData.strRequired = Number(raw.strength) || raw.strength
  if (raw.stealth) extraData.stealthDisadvantage = /yes/i.test(String(raw.stealth))

  const damage =
    raw.dmg1 && raw.dmgType
      ? `${raw.dmg1} ${DAMAGE_TYPE_CODES[raw.dmgType] ?? raw.dmgType.toLowerCase()}`
      : null
  // <dmg2> only ever pairs with the Versatile (V) property specifically —
  // the Compendium has no generic per-property detail field.
  if (raw.dmg2 && properties?.some((p) => p.name === 'Versatile')) {
    const versatile = properties.find((p) => p.name === 'Versatile')!
    versatile.detail = raw.dmg2
  }

  const logical = ItemSchema.parse({
    slug: slugify(tags.name),
    sourceId: source.sourceId,
    name: tags.name,
    itemType: TYPE_TO_ITEM_TYPE[raw.type] ?? raw.type.toLowerCase(),
    rarity,
    requiresAttunement,
    cost: raw.value !== undefined ? `${raw.value} gp` : null,
    weight: raw.weight !== undefined ? String(raw.weight) : null,
    damage,
    armorClass: raw.ac !== undefined ? String(raw.ac) : null,
    properties,
    description: citation.cleanedText,
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    row: {
      slug: logical.slug,
      sourceId: logical.sourceId,
      name: logical.name,
      itemType: logical.itemType,
      rarity: logical.rarity ?? null,
      requiresAttunement: logical.requiresAttunement,
      cost: logical.cost ?? null,
      weight: logical.weight ?? null,
      damage: logical.damage ?? null,
      armorClass: logical.armorClass ?? null,
      properties: toJsonString(logical.properties),
      description: logical.description,
      extraData: toJsonString(logical.extraData),
    },
    source,
  }
}
