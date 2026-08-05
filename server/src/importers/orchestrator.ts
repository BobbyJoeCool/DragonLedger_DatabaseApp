import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { transformBackground } from './open5e/backgrounds.js'
import { transformClass, transformSubclass } from './open5e/classes.js'
import { transformCondition } from './open5e/conditions.js'
import { transformItem, transformMagicItem } from './open5e/items.js'
import { transformMonster } from './open5e/monsters.js'
import {
  synthesizeSubracesFromLineageTrait,
  transformRace,
  transformSubspecies,
} from './open5e/races.js'
import { slugFromKey } from './open5e/slug.js'
import { transformSpell } from './open5e/spells.js'
import type {
  Open5eBackground,
  Open5eClass,
  Open5eCondition,
  Open5eCreature,
  Open5eItem,
  Open5eMagicItem,
  Open5eSpecies,
  Open5eSpell,
} from './open5e/types.js'
import { importEvents } from './importEvents.js'
import { computeChunkSize } from './utils/chunkSize.js'
import { fetchAllPages } from './utils/fetchAllPages.js'

const OPEN5E_BASE = 'https://api.open5e.com/v2'

export type Open5eContentType =
  | 'CONDITION'
  | 'SPELL'
  | 'RACE'
  | 'CLASS'
  | 'BACKGROUND'
  | 'ITEM'
  | 'MONSTER'

// Dependency-driven build order: Conditions & Spells first (no
// cross-references), Races before their subraces are meaningful, Classes
// before Subclasses, Items, then Monsters last.
const CONTENT_TYPE_ORDER: Open5eContentType[] = [
  'CONDITION',
  'SPELL',
  'RACE',
  'CLASS',
  'BACKGROUND',
  'ITEM',
  'MONSTER',
]

// Approximate column counts per widest table involved, used to keep each
// createMany batch's bound-parameter count safely under SQLite's ~999
// per-query ceiling (see utils/chunkSize.ts).
const COLUMN_COUNTS: Record<Open5eContentType, number> = {
  CONDITION: 7,
  SPELL: 17,
  RACE: 9,
  CLASS: 13,
  BACKGROUND: 9,
  ITEM: 14,
  MONSTER: 26, // +1 for experiencePoints (Phase 2.6)
}
const SUBRACE_COLUMN_COUNT = 10
const SUBCLASS_COLUMN_COUNT = 7
const CLASS_FEATURE_COLUMN_COUNT = 7 // id, classId, subclassId, level, name, description, type — Phase 2.6

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface ImportResult {
  count: number
}

async function importConditions(sourceId: string, documentKey: string): Promise<ImportResult> {
  const raw = await fetchAllPages<Open5eCondition>(
    `${OPEN5E_BASE}/conditions/?document__key__in=${documentKey}&limit=100`,
  )
  const rows = raw.map((r) => transformCondition(r, sourceId))
  const chunkSize = computeChunkSize(COLUMN_COUNTS.CONDITION)

  await prisma.$transaction(async (tx) => {
    await tx.contentCondition.deleteMany({ where: { sourceId } })
    for (const batch of chunk(rows, chunkSize)) {
      await tx.contentCondition.createMany({ data: batch })
    }
  })

  return { count: rows.length }
}

async function importSpells(sourceId: string, documentKey: string): Promise<ImportResult> {
  const raw = await fetchAllPages<Open5eSpell>(
    `${OPEN5E_BASE}/spells/?document__key__in=${documentKey}&limit=100`,
  )
  const rows = raw.map((r) => transformSpell(r, sourceId))
  const chunkSize = computeChunkSize(COLUMN_COUNTS.SPELL)

  await prisma.$transaction(async (tx) => {
    await tx.contentSpell.deleteMany({ where: { sourceId } })
    for (const batch of chunk(rows, chunkSize)) {
      await tx.contentSpell.createMany({ data: batch })
    }
  })

  return { count: rows.length }
}

async function importRaces(sourceId: string, documentKey: string): Promise<ImportResult> {
  const raw = await fetchAllPages<Open5eSpecies>(
    `${OPEN5E_BASE}/species/?document__key__in=${documentKey}&limit=100`,
  )
  const baseRaces = raw.filter((r) => !r.is_subspecies)
  const subspeciesRecords = raw.filter((r) => r.is_subspecies)

  const raceRows = baseRaces.map((r) => transformRace(r, sourceId))
  const raceChunkSize = computeChunkSize(COLUMN_COUNTS.RACE)
  const subraceChunkSize = computeChunkSize(SUBRACE_COLUMN_COUNT)

  let total = 0

  await prisma.$transaction(async (tx) => {
    await tx.contentSubrace.deleteMany({ where: { sourceId } })
    await tx.contentRace.deleteMany({ where: { sourceId } })

    for (const batch of chunk(raceRows, raceChunkSize)) {
      await tx.contentRace.createMany({ data: batch })
    }
    total += raceRows.length

    const inserted = await tx.contentRace.findMany({
      where: { sourceId },
      select: { id: true, slug: true, name: true },
    })
    const idBySlug = new Map(inserted.map((r) => [r.slug, r.id]))
    const idByName = new Map(inserted.map((r) => [r.name, r.id]))

    const subraceRows: Prisma.ContentSubraceCreateManyInput[] = []

    for (const base of baseRaces) {
      const raceId = idBySlug.get(slugFromKey(base.key, base.document.key))
      if (!raceId) continue
      subraceRows.push(...synthesizeSubracesFromLineageTrait(raceId, base, sourceId))
    }

    for (const sub of subspeciesRecords) {
      if (!sub.subspecies_of) continue
      const parentId =
        idBySlug.get(slugFromKey(sub.subspecies_of, sub.document.key)) ??
        idByName.get(sub.subspecies_of)
      if (!parentId) continue
      subraceRows.push(transformSubspecies(sub, parentId, sourceId))
    }

    for (const batch of chunk(subraceRows, subraceChunkSize)) {
      await tx.contentSubrace.createMany({ data: batch })
    }
    total += subraceRows.length
  })

  return { count: total }
}

async function importClasses(sourceId: string, documentKey: string): Promise<ImportResult> {
  const raw = await fetchAllPages<Open5eClass>(
    `${OPEN5E_BASE}/classes/?document__key__in=${documentKey}&limit=100`,
  )
  const baseClasses = raw.filter((c) => !c.subclass_of)
  const subclassRecords = raw.filter((c) => c.subclass_of)

  const classResults = baseClasses.map((c) => transformClass(c, sourceId))
  const classChunkSize = computeChunkSize(COLUMN_COUNTS.CLASS)
  const subclassChunkSize = computeChunkSize(SUBCLASS_COLUMN_COUNT)
  const featureChunkSize = computeChunkSize(CLASS_FEATURE_COLUMN_COUNT)

  let total = 0

  await prisma.$transaction(async (tx) => {
    // ContentClassFeature has no direct sourceId — cascades transitively
    // when its parent ContentClass/ContentSubclass row is deleted below
    // (onDelete: Cascade on both FKs, Prisma's own connections enforce
    // SQLite foreign_keys, unlike the bare sqlite3 CLI).
    await tx.contentSubclass.deleteMany({ where: { sourceId } })
    await tx.contentClass.deleteMany({ where: { sourceId } })

    for (const batch of chunk(
      classResults.map((r) => r.row),
      classChunkSize,
    )) {
      await tx.contentClass.createMany({ data: batch })
    }
    total += classResults.length

    const insertedClasses = await tx.contentClass.findMany({
      where: { sourceId },
      select: { id: true, slug: true },
    })
    const classIdBySlug = new Map(insertedClasses.map((c) => [c.slug, c.id]))

    const classFeatureRows: Prisma.ContentClassFeatureCreateManyInput[] = []
    for (const result of classResults) {
      const classId = classIdBySlug.get(result.row.slug)
      if (!classId) continue
      for (const f of result.features) {
        classFeatureRows.push({ classId, subclassId: null, ...f })
      }
    }

    const subclassResults = subclassRecords.map((sub) => {
      const classId = sub.subclass_of
        ? (classIdBySlug.get(slugFromKey(sub.subclass_of.key, sub.document.key)) ?? null)
        : null
      return transformSubclass(sub, classId, sourceId)
    })

    for (const batch of chunk(
      subclassResults.map((r) => r.row),
      subclassChunkSize,
    )) {
      await tx.contentSubclass.createMany({ data: batch })
    }
    total += subclassResults.length

    const insertedSubclasses = await tx.contentSubclass.findMany({
      where: { sourceId },
      select: { id: true, slug: true },
    })
    const subclassIdBySlug = new Map(insertedSubclasses.map((s) => [s.slug, s.id]))

    for (const result of subclassResults) {
      const subclassId = subclassIdBySlug.get(result.row.slug)
      if (!subclassId) continue
      for (const f of result.features) {
        classFeatureRows.push({ classId: null, subclassId, ...f })
      }
    }

    for (const batch of chunk(classFeatureRows, featureChunkSize)) {
      await tx.contentClassFeature.createMany({ data: batch })
    }
    total += classFeatureRows.length
  })

  return { count: total }
}

async function importBackgrounds(sourceId: string, documentKey: string): Promise<ImportResult> {
  const raw = await fetchAllPages<Open5eBackground>(
    `${OPEN5E_BASE}/backgrounds/?document__key__in=${documentKey}&limit=100`,
  )
  const rows = raw.map((r) => transformBackground(r, sourceId))
  const chunkSize = computeChunkSize(COLUMN_COUNTS.BACKGROUND)

  await prisma.$transaction(async (tx) => {
    await tx.contentBackground.deleteMany({ where: { sourceId } })
    for (const batch of chunk(rows, chunkSize)) {
      await tx.contentBackground.createMany({ data: batch })
    }
  })

  return { count: rows.length }
}

async function importItems(sourceId: string, documentKey: string): Promise<ImportResult> {
  const [mundane, magic] = await Promise.all([
    fetchAllPages<Open5eItem>(`${OPEN5E_BASE}/items/?document__key__in=${documentKey}&limit=100`),
    fetchAllPages<Open5eMagicItem>(
      `${OPEN5E_BASE}/magicitems/?document__key__in=${documentKey}&limit=100`,
    ),
  ])
  const rows = [
    ...mundane.map((r) => transformItem(r, sourceId)),
    ...magic.map((r) => transformMagicItem(r, sourceId)),
  ]
  const chunkSize = computeChunkSize(COLUMN_COUNTS.ITEM)

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.deleteMany({ where: { sourceId } })
    for (const batch of chunk(rows, chunkSize)) {
      await tx.contentItem.createMany({ data: batch })
    }
  })

  return { count: rows.length }
}

async function importMonsters(sourceId: string, documentKey: string): Promise<ImportResult> {
  const raw = await fetchAllPages<Open5eCreature>(
    `${OPEN5E_BASE}/creatures/?document__key__in=${documentKey}&limit=100`,
  )
  const rows = raw.map((r) => transformMonster(r, sourceId))
  const chunkSize = computeChunkSize(COLUMN_COUNTS.MONSTER)

  await prisma.$transaction(async (tx) => {
    await tx.contentMonster.deleteMany({ where: { sourceId } })
    for (const batch of chunk(rows, chunkSize)) {
      await tx.contentMonster.createMany({ data: batch })
    }
  })

  return { count: rows.length }
}

async function importContentType(
  type: Open5eContentType,
  sourceId: string,
  documentKey: string,
): Promise<ImportResult> {
  switch (type) {
    case 'CONDITION':
      return importConditions(sourceId, documentKey)
    case 'SPELL':
      return importSpells(sourceId, documentKey)
    case 'RACE':
      return importRaces(sourceId, documentKey)
    case 'CLASS':
      return importClasses(sourceId, documentKey)
    case 'BACKGROUND':
      return importBackgrounds(sourceId, documentKey)
    case 'ITEM':
      return importItems(sourceId, documentKey)
    case 'MONSTER':
      return importMonsters(sourceId, documentKey)
  }
}

export interface ImportSourceOptions {
  sourceId: string
  sourceName: string
  // The Open5e document key to query (e.g. "srd-2024"). Defaults to
  // sourceId when omitted — this app's Source.id is a separate,
  // app-namespaced string (per Appendix A's own example, "open5e-srd-2024"
  // vs. Open5e's "srd-2024"), so callers that want that separation pass
  // documentKey explicitly; simple callers can let it default.
  documentKey?: string
  contentTypes: Open5eContentType[]
  jobId: string
}

// 1. upsert Source, 2. per content type: delete existing rows for
// sourceId, fetch+transform+chunk+createMany in its own transaction
// (whole-content-type rollback boundary — a bad record in one type never
// touches another type's already-imported data), 3. update ImportJob
// progress/status per type, 4. update Source.lastUpdated on completion.
export async function importSource(options: ImportSourceOptions): Promise<void> {
  const { sourceId, sourceName, jobId } = options
  const documentKey = options.documentKey ?? sourceId
  const contentTypes = CONTENT_TYPE_ORDER.filter((t) => options.contentTypes.includes(t))

  await prisma.source.upsert({
    where: { id: sourceId },
    update: { name: sourceName, lastUpdated: new Date() },
    create: {
      id: sourceId,
      name: sourceName,
      type: 'API',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', totalItems: contentTypes.length },
  })

  const errors: { contentType: string; message: string }[] = []
  let processedItems = 0

  for (const type of contentTypes) {
    importEvents.emitProgress(jobId, { type, status: 'running' })
    try {
      const result = await importContentType(type, sourceId, documentKey)
      processedItems += 1
      importEvents.emitProgress(jobId, { type, status: 'done', count: result.count })
    } catch (err) {
      const message = (err as Error).message
      errors.push({ contentType: type, message })
      processedItems += 1
      importEvents.emitProgress(jobId, { type, status: 'error', message })
    }

    await prisma.importJob.update({
      where: { id: jobId },
      data: { processedItems, errorLog: errors.length > 0 ? JSON.stringify(errors) : null },
    })
  }

  const finalStatus =
    errors.length === 0 ? 'COMPLETED' : errors.length === contentTypes.length ? 'FAILED' : 'PARTIAL'

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: finalStatus, completedAt: new Date() },
  })
  await prisma.source.update({ where: { id: sourceId }, data: { lastUpdated: new Date() } })

  importEvents.emitComplete(jobId, finalStatus)
}
