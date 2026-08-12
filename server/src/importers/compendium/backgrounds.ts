import type { Prisma } from '@prisma/client'
import { BackgroundSchema } from '@dragonledger/content-types'
import { ABILITY_NAME_TO_CODE } from '../open5e/abilities.js'
import { parseProficiencyGrant, splitOptionList } from '../open5e/proseGrant.js'
import { slugify } from '../../utils/slugify.js'
import { toJsonString } from '../utils/json.js'
import { extractCitation } from './citation.js'
import { parseNameTags } from './nameTags.js'
import { resolveCompendiumSource } from './sourceBooks.js'
import type { CompendiumBackground, CompendiumBackgroundTrait } from './types.js'
import type { TransformedRecord } from './feats.js'

// Real, unanticipated finding: the design doc's 6-record sample assumed
// proficiencies/abilities/feats live as "• Label: ..." bullet lines
// embedded in one big Description trait, requiring prose bullet-parsing.
// The real, broader file instead structures each as its own <trait>
// element with a colon-labeled name ("Ability Scores: Intelligence,
// Wisdom, Charisma", "Feat: Magic Initiate (Cleric)", "Tool Proficiency:
// Choose one kind of Artisan's Tools") — no bullet-parsing needed at all,
// just reading each trait's own name. See DevTools/Notes/v0.2.notes.md.
function traitLabel(trait: CompendiumBackgroundTrait): { label: string | null; detail: string } {
  const name = trait.name ?? ''
  const colonIndex = name.indexOf(':')
  if (colonIndex === -1) return { label: null, detail: name }
  return { label: name.slice(0, colonIndex).trim(), detail: name.slice(colonIndex + 1).trim() }
}

function traitText(trait: CompendiumBackgroundTrait): string {
  return typeof trait.text === 'string' ? trait.text : String(trait.text ?? '')
}

export function transformCompendiumBackground(
  raw: CompendiumBackground,
): TransformedRecord<Prisma.ContentBackgroundCreateManyInput> {
  const tags = parseNameTags(raw.name)

  const skillGrant = parseProficiencyGrant(raw.proficiency ?? '')
  let toolGrant = {
    fixed: [] as string[],
    choices: [] as ReturnType<typeof parseProficiencyGrant>['choices'],
  }
  let abilityBonuses: { fixed: Record<string, number>; choices: unknown[] } = {
    fixed: {},
    choices: [],
  }
  const feature: { name: string; description: string }[] = []
  const unrecognizedTraits: { name: string; description: string }[] = []
  let description = ''
  let citedBook: string | null = null
  const extraData: Record<string, unknown> = {}

  for (const trait of raw.trait ?? []) {
    const { label, detail } = traitLabel(trait)
    const text = traitText(trait)

    if (trait.name === 'Description') {
      const citation = extractCitation(text)
      description = citation.cleanedText
      citedBook = citation.book
      if (citation.page) extraData.page = citation.page
      continue
    }

    if (label && /^ability scores?$/i.test(label)) {
      const abilities = splitOptionList(detail)
        .map((n) => ABILITY_NAME_TO_CODE[n.toLowerCase()])
        .filter((c): c is string => Boolean(c))
      if (abilities.length > 0) {
        abilityBonuses = {
          fixed: {},
          choices: [{ type: 'distribute', pool: 3, among: abilities, maxPerOption: 2 }],
        }
      }
      continue
    }

    if (label && /^feat$/i.test(label)) {
      extraData.grantedFeat = { name: detail }
      continue
    }

    if (label && /^tool proficienc(y|ies)$/i.test(label)) {
      toolGrant = parseProficiencyGrant(detail)
      continue
    }

    if (/feature:/i.test(trait.name) || /^talent:/i.test(trait.name)) {
      const cite = extractCitation(text)
      feature.push({ name: trait.name, description: cite.cleanedText })
      continue
    }

    if (/^(starting equipment|equipment)$/i.test(trait.name)) {
      extraData.equipment = extractCitation(text).cleanedText
      continue
    }

    // Everything else — Suggested Characteristics, Talents (intro), Profession
    // Dice, faction/lore tables, "Choose X"-style alternate structures, etc.
    // Never silently dropped.
    unrecognizedTraits.push({ name: trait.name, description: extractCitation(text).cleanedText })
  }

  const source = resolveCompendiumSource(citedBook)

  const proficiencies = {
    fixed: [
      ...skillGrant.fixed.map((name) => ({ name, category: 'skill' as const })),
      ...toolGrant.fixed.map((name) => ({ name, category: 'tool' as const })),
    ],
    choices: [
      ...skillGrant.choices.map((c) => ({
        ...c,
        from: c.from?.map((name) => ({ name, category: 'skill' as const })) ?? null,
      })),
      ...toolGrant.choices.map((c) => ({
        ...c,
        from: c.from?.map((name) => ({ name, category: 'tool' as const })) ?? null,
      })),
    ],
  }

  if (tags.edition) extraData.edition = tags.edition
  if (tags.homebrew) extraData.homebrew = true
  if (tags.thirdParty) extraData.thirdParty = true
  if (tags.unearthedArcana) extraData.unearthedArcana = true
  if (tags.otherTags.length > 0) extraData.otherTags = tags.otherTags
  if (unrecognizedTraits.length > 0) extraData.unrecognizedTraits = unrecognizedTraits

  const logical = BackgroundSchema.parse({
    slug: slugify(tags.name),
    sourceId: source.sourceId,
    name: tags.name,
    proficiencies,
    abilityBonuses,
    feature,
    description: description || '',
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    row: {
      slug: logical.slug,
      sourceId: logical.sourceId,
      name: logical.name,
      proficiencies: toJsonString(logical.proficiencies) as string,
      abilityBonuses: toJsonString(logical.abilityBonuses) as string,
      feature: toJsonString(logical.feature) as string,
      description: logical.description,
      extraData: toJsonString(logical.extraData),
    },
    source,
  }
}
