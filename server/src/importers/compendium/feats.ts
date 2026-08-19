import type { Prisma } from '@prisma/client'
import { FeatSchema } from '@dragonledger/content-types'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { editionFromTag, parseNameTags } from './nameTags.js'
import { resolveCompendiumSource, type ResolvedCompendiumSource } from './sourceBooks.js'
import type { CompendiumFeat } from './types.js'

export interface TransformedRecord<T> {
  row: T
  source: ResolvedCompendiumSource
}

// Real category prefixes confirmed present (see phase-2.5 dev log) go well
// beyond the docs' Origin/Fighting Style/Epic Boon set — Dragonmark, Path
// of the Lich, Dark Gift, etc. are all real, setting/homebrew-specific
// prefixes with no natural fit in the schema's small fixed category list.
// Recognized prefixes map to their known bucket; everything else with a
// colon-style prefix goes to CLASS_SPECIFIC as a catch-all, with the raw
// prefix preserved in extraData.rawCategory rather than lost.
const PREFIX_TO_CATEGORY: Record<string, string> = {
  origin: 'ORIGIN',
  'fighting style': 'FIGHTING_STYLE',
  boon: 'EPIC_BOON',
  'epic boon': 'EPIC_BOON',
  'epic origin': 'EPIC_BOON',
}

function parseCategory(name: string): {
  category: string
  strippedName: string
  rawPrefix: string | null
} {
  const match = name.match(/^([A-Za-z][\w\s]*?):\s*(.+)$/)
  if (!match) return { category: 'GENERAL', strippedName: name, rawPrefix: null }
  const [, prefix, rest] = match
  const category = PREFIX_TO_CATEGORY[prefix.trim().toLowerCase()] ?? 'CLASS_SPECIFIC'
  return { category, strippedName: rest.trim(), rawPrefix: prefix.trim() }
}

export function transformFeat(
  raw: CompendiumFeat,
): TransformedRecord<Prisma.ContentFeatCreateManyInput> {
  const tags = parseNameTags(raw.name)
  const { category, strippedName, rawPrefix } = parseCategory(tags.name)
  const citation = extractCitation(raw.text)
  const source = resolveCompendiumSource(citation.book)

  const extraData: Record<string, unknown> = {}
  const edition = editionFromTag(tags.edition)
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (category === 'CLASS_SPECIFIC' && rawPrefix) extraData.rawCategory = rawPrefix
  if (citation.page) extraData.page = citation.page
  if (citation.additionalCitations.length > 0)
    extraData.additionalCitations = citation.additionalCitations
  if (raw.special) extraData.special = raw.special
  const modifiers = (raw.modifier ?? [])
    .filter((m) => m.text)
    .map((m) => ({ category: m['@_category'] ?? null, text: m.text }))
  if (modifiers.length > 0) extraData.modifiers = modifiers

  const logical = FeatSchema.parse({
    slug: slugify(strippedName),
    sourceId: source.sourceId,
    name: strippedName,
    category,
    prerequisite: raw.prerequisite || null,
    description: citation.cleanedText,
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    row: {
      slug: logical.slug,
      sourceId: logical.sourceId,
      name: logical.name,
      edition,
      category: logical.category,
      prerequisite: logical.prerequisite ?? null,
      description: logical.description,
      extraData: toJsonString(logical.extraData),
    },
    source,
  }
}
