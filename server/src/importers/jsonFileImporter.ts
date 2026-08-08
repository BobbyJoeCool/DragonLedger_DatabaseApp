import { readFile } from 'node:fs/promises'
import type { z } from 'zod'
import { prisma } from '../db/client.js'
import { slugify } from '../utils/slugify.js'
import { importEvents } from './importEvents.js'
import { computeChunkSize } from './utils/chunkSize.js'
import { BackgroundSchema } from '../schemas/content/background.js'
import { ClassSchema } from '../schemas/content/class.js'
import { ConditionSchema } from '../schemas/content/condition.js'
import { FeatSchema } from '../schemas/content/feat.js'
import { ItemSchema } from '../schemas/content/item.js'
import { MonsterSchema } from '../schemas/content/monster.js'
import { RaceSchema } from '../schemas/content/race.js'
import { SpellSchema } from '../schemas/content/spell.js'

// Appendix B (outline.md) — user-authored JSON import. Only the 8 top-level
// browsable types are supported: Subclass/Subrace/ContentClassOption need FK
// linkage (classId/raceId) a flat same-shape-as-schema JSON entry has no
// clean way to express, so they're out of scope here — same 8-type boundary
// Phase 3/5 already draw everywhere else in this app.
export type JsonContentType =
  | 'spell'
  | 'class'
  | 'race'
  | 'background'
  | 'condition'
  | 'item'
  | 'monster'
  | 'feat'

// Both singular ("contentType": "spell") and plural (a "spells": [...]
// section key) forms per Appendix B's two accepted shapes.
const SECTION_TO_TYPE: Record<string, JsonContentType> = {
  spell: 'spell',
  spells: 'spell',
  class: 'class',
  classes: 'class',
  race: 'race',
  races: 'race',
  background: 'background',
  backgrounds: 'background',
  condition: 'condition',
  conditions: 'condition',
  item: 'item',
  items: 'item',
  monster: 'monster',
  monsters: 'monster',
  feat: 'feat',
  feats: 'feat',
}

// `data` is loosely typed on purpose: Prisma's real createMany signature
// accepts `XCreateManyInput | XCreateManyInput[]` (a union), which breaks
// method-shorthand bivariance against a plain `Record<string, unknown>[]`
// the way single-object create/update didn't (see content/writeHandlers.ts's
// equivalent boundary). Real type safety here lives at each entry's Zod
// validation in buildRow(), not this delegate interface.
interface ImportDelegate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createMany(args: { data: any[] }): Promise<{ count: number }>
}

interface TypeConfig {
  schema: z.ZodObject
  delegate: ImportDelegate
  jsonFields: readonly string[]
  columnCount: number
}

const TYPE_CONFIG: Record<JsonContentType, TypeConfig> = {
  spell: {
    schema: SpellSchema,
    delegate: prisma.contentSpell,
    jsonFields: ['classes', 'extraData'],
    columnCount: 17,
  },
  class: {
    schema: ClassSchema,
    delegate: prisma.contentClass,
    jsonFields: ['primaryAbility', 'savingThrows', 'armorProfs', 'weaponProfs', 'skillChoices', 'extraData'],
    columnCount: 13,
  },
  race: {
    schema: RaceSchema,
    delegate: prisma.contentRace,
    jsonFields: ['size', 'speed', 'traits', 'extraData'],
    columnCount: 9,
  },
  background: {
    schema: BackgroundSchema,
    delegate: prisma.contentBackground,
    jsonFields: ['proficiencies', 'abilityBonuses', 'feature', 'extraData'],
    columnCount: 9,
  },
  condition: {
    schema: ConditionSchema,
    delegate: prisma.contentCondition,
    jsonFields: ['extraData'],
    columnCount: 7,
  },
  item: {
    schema: ItemSchema,
    delegate: prisma.contentItem,
    jsonFields: ['properties', 'extraData'],
    columnCount: 14,
  },
  monster: {
    schema: MonsterSchema,
    delegate: prisma.contentMonster,
    jsonFields: [
      'speed',
      'abilityScores',
      'savingThrows',
      'skills',
      'damageResistances',
      'damageImmunities',
      'damageVulnerabilities',
      'conditionImmunities',
      'actions',
      'legendaryActions',
      'extraData',
    ],
    columnCount: 26,
  },
  feat: {
    schema: FeatSchema,
    delegate: prisma.contentFeat,
    jsonFields: ['extraData'],
    columnCount: 8,
  },
}

interface Section {
  type: JsonContentType
  entries: unknown[]
}

interface ParseResult {
  sections: Section[]
  unknownSections: string[]
}

// Appendix B's two accepted top-level shapes: a single
// { contentType, entries } object, or a multi-type object keyed by section
// name ({ spells: [...], items: [...] }).
export function extractSections(parsed: unknown): ParseResult {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File must contain a JSON object')
  }
  const obj = parsed as Record<string, unknown>

  if (typeof obj.contentType === 'string' && Array.isArray(obj.entries)) {
    const type = SECTION_TO_TYPE[obj.contentType.toLowerCase()]
    if (!type) throw new Error(`Unknown contentType "${obj.contentType}"`)
    return { sections: [{ type, entries: obj.entries }], unknownSections: [] }
  }

  const sections: Section[] = []
  const unknownSections: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (!Array.isArray(value)) continue
    const type = SECTION_TO_TYPE[key.toLowerCase()]
    if (type) {
      sections.push({ type, entries: value })
    } else {
      unknownSections.push(key)
    }
  }
  return { sections, unknownSections }
}

function serializeJsonFields(
  record: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...record }
  for (const field of fields) {
    const value = result[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      result[field] = JSON.stringify(value)
    }
  }
  return result
}

// id is always discarded — it's an internal cuid PK, not a real content
// field, and nothing in Appendix B says a client-supplied id must be
// preserved. slug is a real content-identity field (part of the
// @@unique([sourceId, slug]) constraint) so it's honored if given, generated
// from name otherwise. Unrecognized fields fold into extraData rather than
// being rejected (Appendix C's fallback rule), merged with any extraData the
// entry already carried.
function buildRow(
  raw: unknown,
  config: TypeConfig,
  sourceId: string,
): { data: Record<string, unknown> } | { error: string } {
  if (raw === null || typeof raw !== 'object') {
    return { error: 'entry is not an object' }
  }
  const { id: _ignoredId, slug: rawSlug, sourceId: _ignoredSourceId, ...rest } =
    raw as Record<string, unknown>

  const name = typeof rest.name === 'string' ? rest.name : undefined
  const slug =
    typeof rawSlug === 'string' && rawSlug.trim().length > 0
      ? slugify(rawSlug)
      : name
        ? slugify(name)
        : ''
  if (!slug) {
    return { error: 'missing both `slug` and a usable `name` to generate one from' }
  }

  const knownKeys = new Set(Object.keys(config.schema.shape))
  const known: Record<string, unknown> = {}
  const unknownFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (knownKeys.has(key)) known[key] = value
    else unknownFields[key] = value
  }

  const existingExtra =
    known.extraData && typeof known.extraData === 'object'
      ? (known.extraData as Record<string, unknown>)
      : {}
  const mergedExtra = { ...existingExtra, ...unknownFields }

  const candidate = {
    ...known,
    slug,
    sourceId,
    extraData: Object.keys(mergedExtra).length > 0 ? mergedExtra : (known.extraData ?? null),
  }

  const parsed = config.schema.safeParse(candidate)
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return { error: message }
  }

  return { data: serializeJsonFields(parsed.data as Record<string, unknown>, config.jsonFields) }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export interface ImportJsonFileOptions {
  filePath: string
  sourceId: string
  jobId: string
}

// One transaction-free pass, additive-only (unlike Open5e/Compendium's
// refresh semantics, there's no prior state for a brand-new user-authored
// source to reconcile against, and no re-run action exists for this import
// kind — Decision 1.6). A slug collision within the same source (e.g.
// running the same file twice) surfaces as that section's error, same
// granularity as every other per-content-type failure here.
export async function importJsonFile(options: ImportJsonFileOptions): Promise<void> {
  const { filePath, sourceId, jobId } = options

  const raw = await readFile(filePath, 'utf-8')
  const parsed: unknown = JSON.parse(raw)
  const { sections, unknownSections } = extractSections(parsed)

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', totalItems: sections.length },
  })

  const errors: { contentType: string; message: string }[] = []
  for (const section of unknownSections) {
    errors.push({ contentType: section, message: 'Unrecognized section — skipped' })
  }

  let processedItems = 0
  for (const section of sections) {
    const label = section.type.toUpperCase()
    importEvents.emitProgress(jobId, { type: label, status: 'running' })
    try {
      const config = TYPE_CONFIG[section.type]
      const rows: Record<string, unknown>[] = []
      const entryErrors: string[] = []
      section.entries.forEach((entry, index) => {
        const result = buildRow(entry, config, sourceId)
        if ('error' in result) {
          entryErrors.push(`entry ${index}: ${result.error}`)
        } else {
          rows.push(result.data)
        }
      })
      if (entryErrors.length > 0) {
        throw new Error(entryErrors.join('; '))
      }

      const chunkSize = computeChunkSize(config.columnCount)
      for (const batch of chunk(rows, chunkSize)) {
        await config.delegate.createMany({ data: batch })
      }

      processedItems += 1
      importEvents.emitProgress(jobId, { type: label, status: 'done', count: rows.length })
    } catch (err) {
      const message = (err as Error).message
      errors.push({ contentType: label, message })
      processedItems += 1
      importEvents.emitProgress(jobId, { type: label, status: 'error', message })
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: { processedItems, errorLog: errors.length > 0 ? JSON.stringify(errors) : null },
    })
  }

  const finalStatus =
    errors.length === 0 ? 'COMPLETED' : errors.length >= sections.length ? 'FAILED' : 'PARTIAL'

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: finalStatus, completedAt: new Date() },
  })
  await prisma.source.update({ where: { id: sourceId }, data: { lastUpdated: new Date() } })

  importEvents.emitComplete(jobId, finalStatus)
}
