import { readFileSync } from 'node:fs'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import { transformCompendiumBackground } from './compendium/backgrounds.js'
import { transformCompendiumClass } from './compendium/classes.js'
import { transformFeat } from './compendium/feats.js'
import { transformCompendiumItem } from './compendium/items.js'
import { transformCompendiumMonster } from './compendium/monsters.js'
import { transformCompendiumRace, type CompendiumRaceResult } from './compendium/races.js'
import { transformSpellOrManeuver } from './compendium/spells.js'
import type { ResolvedCompendiumSource } from './compendium/sourceBooks.js'
import type { CompendiumDocument } from './compendium/types.js'
import { parseCompendiumXml } from './compendium/xmlParser.js'
import { importEvents } from './importEvents.js'
import type { ExplodedClassFeature } from './shared/classFeature.js'

export type DuplicateDecision = 'duplicate' | 'skip'

export interface ImportCompendiumOptions {
  filePath: string
  jobId: string
  duplicateDecision?: DuplicateDecision
}

interface PendingMatch {
  contentType: string
  name: string
  sourceId: string
}

// Additive-only, never overwrites — a distinct code path from Open5e's
// delete-and-replace importSource, deliberately not sharing that function's
// internals (see compendium-race-subrace-reimport-safety-export.md §6): a
// static file has no upstream maintainer to fix and re-pull from, so any
// refresh-style overwrite would silently destroy local corrections made to
// a Compendium-sourced row.
//
// Two-layer duplicate resolution per record, in order:
//   1. Same-source (sourceId+slug already exists from a prior Compendium
//      import) → skip unconditionally, no exceptions, never re-evaluated.
//   2. Cross-source (name-matches existing content from an Open5e-type
//      source, and this record's book has a known Open5e mapping) → only
//      reached if (1) didn't match. Pending user confirmation the first
//      time; the batch decision (once made) applies to the whole import.
//   3. Neither → import fresh.
//
// Note: the design doc describes checking "that specific Open5e source
// only" (resolved via a book→Open5e-document-key mapping). This app has no
// stored mapping from a Source row back to which Open5e document key it
// was originally imported under (the user can name it anything), so the
// cross-source check here searches by name across all API-type sources
// instead of one specific source — a documented simplification, and a
// conservative one (more likely to ask than to silently duplicate).
// Prisma's per-model delegate types are structurally incompatible with
// each other (each has its own precise WhereUniqueInput/WhereInput shape),
// so a single helper working across all of them needs a loose escape
// hatch here rather than fighting delegate-specific generics — contained
// to this one function, not a pattern used elsewhere in the codebase.
type ContentDelegate = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findUnique: (args: any) => Promise<{ id: string } | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findFirst: (args: any) => Promise<{ id: string } | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createMany: (args: any) => Promise<unknown>
}

async function resolveAction(
  delegate: ContentDelegate,
  sourceId: string,
  slug: string,
  name: string,
  mappedOpen5eDocumentKey: string | null,
  decision: DuplicateDecision | undefined,
  contentType: string,
  pending: PendingMatch[],
): Promise<'insert' | 'skip'> {
  const existing = await delegate.findUnique({ where: { sourceId_slug: { sourceId, slug } } })
  if (existing) return 'skip'

  if (!mappedOpen5eDocumentKey) return 'insert'

  const crossMatch = await delegate.findFirst({ where: { name, source: { type: 'API' } } })
  if (!crossMatch) return 'insert'

  if (decision === 'skip') return 'skip'
  if (decision === 'duplicate') return 'insert'

  pending.push({ contentType, name, sourceId })
  return 'skip' // provisional — real outcome decided once the batch is confirmed
}

// Content rows FK to Source, so a book's Source row must exist *before*
// any content citing it is inserted — upserted incrementally the first
// time each distinct book is encountered, not batched at the end.
function makeSourceEnsurer(): (source: ResolvedCompendiumSource) => Promise<void> {
  const seen = new Set<string>()
  return async (source: ResolvedCompendiumSource) => {
    if (seen.has(source.sourceId)) return
    seen.add(source.sourceId)
    await prisma.source.upsert({
      where: { id: source.sourceId },
      update: {},
      create: {
        id: source.sourceId,
        name: source.sourceName,
        type: 'FILE',
        lastUpdated: new Date(),
        isDeletable: true,
      },
    })
  }
}

// Safety net for slug collisions *within* one content type's batch (not
// against the DB — resolveAction already handles that). Two distinct real
// records can legitimately collapse to the same (sourceId, slug) — e.g.
// name-tag stripping is intentionally aggressive (see nameTags.ts) and can
// over-strip a genuinely distinguishing bracketed qualifier, or the source
// file itself contains near-duplicate entries. `createMany` fails the
// entire batch on any single collision, so entries are suffixed rather
// than dropped — no data is silently lost over a naming collision.
function dedupeSlugs<T extends { sourceId: string; slug: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.sourceId}::${row.slug}`
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    if (count > 0) row.slug = `${row.slug}-${count + 1}`
  }
  return rows
}

export async function importCompendium(options: ImportCompendiumOptions): Promise<void> {
  const { filePath, jobId, duplicateDecision } = options

  await prisma.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } })
  importEvents.emitProgress(jobId, { type: 'PARSE', status: 'running' })

  const xml = readFileSync(filePath, 'utf-8')
  const doc: CompendiumDocument = parseCompendiumXml(xml)
  const c = doc.compendium

  const ensureSource = makeSourceEnsurer()
  const pending: PendingMatch[] = []
  let totalInserted = 0
  const errors: { contentType: string; message: string }[] = []

  // ---- Feat ----
  try {
    const rows: Prisma.ContentFeatCreateManyInput[] = []
    let skipped = 0
    for (const raw of c.feat ?? []) {
      try {
        const { row, source } = transformFeat(raw)
        await ensureSource(source)
        const action = await resolveAction(
          prisma.contentFeat,
          row.sourceId,
          row.slug,
          row.name,
          source.mappedOpen5eDocumentKey,
          duplicateDecision,
          'FEAT',
          pending,
        )
        if (action === 'insert') rows.push(row)
      } catch (recordErr) {
        skipped += 1
        if (skipped <= 5) {
          errors.push({
            contentType: 'FEAT',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    importEvents.emitProgress(jobId, { type: 'FEAT', status: 'running' })
    if (rows.length > 0) {
      await prisma.contentFeat.createMany({ data: dedupeSlugs(rows) })
      totalInserted += rows.length
    }
    importEvents.emitProgress(jobId, { type: 'FEAT', status: 'done', count: rows.length })
  } catch (err) {
    errors.push({ contentType: 'FEAT', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'FEAT',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // ---- Spell / Maneuver (ContentClassOption) ----
  try {
    const spellRows: Prisma.ContentSpellCreateManyInput[] = []
    const optionRows: Prisma.ContentClassOptionCreateManyInput[] = []
    let skipped = 0
    for (const raw of c.spell ?? []) {
      try {
        const result = transformSpellOrManeuver(raw)
        await ensureSource(result.source)
        if (result.kind === 'spell') {
          const action = await resolveAction(
            prisma.contentSpell,
            result.row.sourceId,
            result.row.slug,
            result.row.name,
            result.source.mappedOpen5eDocumentKey,
            duplicateDecision,
            'SPELL',
            pending,
          )
          if (action === 'insert') spellRows.push(result.row)
        } else {
          const action = await resolveAction(
            prisma.contentClassOption,
            result.row.sourceId,
            result.row.slug,
            result.row.name,
            result.source.mappedOpen5eDocumentKey,
            duplicateDecision,
            'CLASS_OPTION',
            pending,
          )
          if (action === 'insert') optionRows.push(result.row)
        }
      } catch (recordErr) {
        skipped += 1
        if (skipped <= 5) {
          errors.push({
            contentType: 'SPELL',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    importEvents.emitProgress(jobId, { type: 'SPELL', status: 'running' })
    if (spellRows.length > 0) {
      await prisma.contentSpell.createMany({ data: dedupeSlugs(spellRows) })
      totalInserted += spellRows.length
    }
    if (optionRows.length > 0) {
      await prisma.contentClassOption.createMany({ data: dedupeSlugs(optionRows) })
      totalInserted += optionRows.length
    }
    importEvents.emitProgress(jobId, {
      type: 'SPELL',
      status: 'done',
      count: spellRows.length + optionRows.length,
    })
  } catch (err) {
    errors.push({ contentType: 'SPELL', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'SPELL',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // ---- Item ----
  try {
    const rows: Prisma.ContentItemCreateManyInput[] = []
    let skipped = 0
    for (const raw of c.item ?? []) {
      try {
        const result = transformCompendiumItem(raw)
        if (!result) continue // currency — not a content type
        await ensureSource(result.source)
        const action = await resolveAction(
          prisma.contentItem,
          result.row.sourceId,
          result.row.slug,
          result.row.name,
          result.source.mappedOpen5eDocumentKey,
          duplicateDecision,
          'ITEM',
          pending,
        )
        if (action === 'insert') rows.push(result.row)
      } catch (recordErr) {
        skipped += 1
        if (skipped <= 5) {
          errors.push({
            contentType: 'ITEM',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    importEvents.emitProgress(jobId, { type: 'ITEM', status: 'running' })
    if (rows.length > 0) {
      await prisma.contentItem.createMany({ data: dedupeSlugs(rows) })
      totalInserted += rows.length
    }
    importEvents.emitProgress(jobId, { type: 'ITEM', status: 'done', count: rows.length })
  } catch (err) {
    errors.push({ contentType: 'ITEM', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'ITEM',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // ---- Background ----
  try {
    const rows: Prisma.ContentBackgroundCreateManyInput[] = []
    let skipped = 0
    for (const raw of c.background ?? []) {
      try {
        const { row, source } = transformCompendiumBackground(raw)
        await ensureSource(source)
        const action = await resolveAction(
          prisma.contentBackground,
          row.sourceId,
          row.slug,
          row.name,
          source.mappedOpen5eDocumentKey,
          duplicateDecision,
          'BACKGROUND',
          pending,
        )
        if (action === 'insert') rows.push(row)
      } catch (recordErr) {
        skipped += 1
        if (skipped <= 5) {
          errors.push({
            contentType: 'BACKGROUND',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    importEvents.emitProgress(jobId, { type: 'BACKGROUND', status: 'running' })
    if (rows.length > 0) {
      await prisma.contentBackground.createMany({ data: dedupeSlugs(rows) })
      totalInserted += rows.length
    }
    importEvents.emitProgress(jobId, { type: 'BACKGROUND', status: 'done', count: rows.length })
  } catch (err) {
    errors.push({ contentType: 'BACKGROUND', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'BACKGROUND',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // ---- Monster ----
  try {
    const rows: Prisma.ContentMonsterCreateManyInput[] = []
    let skipped = 0
    for (const raw of c.monster ?? []) {
      try {
        const { row, source } = transformCompendiumMonster(raw)
        await ensureSource(source)
        const action = await resolveAction(
          prisma.contentMonster,
          row.sourceId,
          row.slug,
          row.name,
          source.mappedOpen5eDocumentKey,
          duplicateDecision,
          'MONSTER',
          pending,
        )
        if (action === 'insert') rows.push(row)
      } catch (recordErr) {
        skipped += 1
        if (skipped <= 5) {
          errors.push({
            contentType: 'MONSTER',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    importEvents.emitProgress(jobId, { type: 'MONSTER', status: 'running' })
    if (rows.length > 0) {
      await prisma.contentMonster.createMany({ data: dedupeSlugs(rows) })
      totalInserted += rows.length
    }
    importEvents.emitProgress(jobId, { type: 'MONSTER', status: 'done', count: rows.length })
  } catch (err) {
    errors.push({ contentType: 'MONSTER', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'MONSTER',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // ---- Class / Subclass / ContentClassFeature ----
  try {
    const classRows: Prisma.ContentClassCreateManyInput[] = []
    // Keyed by row object reference, not slug — dedupeSlugs mutates `.slug`
    // in place on collision, so a reference key stays correct regardless.
    const classFeaturesByRow = new Map<Prisma.ContentClassCreateManyInput, ExplodedClassFeature[]>()
    const pendingSubclasses: {
      row: Omit<Prisma.ContentSubclassCreateManyInput, 'classId'>
      source: ResolvedCompendiumSource
      parentClassName: string
      features: ExplodedClassFeature[]
    }[] = []
    let skipped = 0
    for (const raw of c.class ?? []) {
      try {
        const { classResult, classFeatures, subclasses } = transformCompendiumClass(raw)
        await ensureSource(classResult.source)
        const action = await resolveAction(
          prisma.contentClass,
          classResult.row.sourceId,
          classResult.row.slug,
          classResult.row.name,
          classResult.source.mappedOpen5eDocumentKey,
          duplicateDecision,
          'CLASS',
          pending,
        )
        if (action === 'insert') {
          classRows.push(classResult.row)
          classFeaturesByRow.set(classResult.row, classFeatures)
        }
        for (const sub of subclasses) {
          await ensureSource(sub.source)
          pendingSubclasses.push(sub)
        }
      } catch (recordErr) {
        skipped += 1
        if (skipped <= 5) {
          errors.push({
            contentType: 'CLASS',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    importEvents.emitProgress(jobId, { type: 'CLASS', status: 'running' })
    if (classRows.length > 0) {
      await prisma.contentClass.createMany({ data: dedupeSlugs(classRows) })
      totalInserted += classRows.length
    }

    const classFeatureRows: Prisma.ContentClassFeatureCreateManyInput[] = []
    if (classRows.length > 0) {
      const insertedClasses = await prisma.contentClass.findMany({
        where: { OR: classRows.map((r) => ({ sourceId: r.sourceId, slug: r.slug })) },
        select: { id: true, sourceId: true, slug: true },
      })
      const classIdByKey = new Map(
        insertedClasses.map((cl) => [`${cl.sourceId}::${cl.slug}`, cl.id]),
      )
      for (const row of classRows) {
        const classId = classIdByKey.get(`${row.sourceId}::${row.slug}`)
        if (!classId) continue
        for (const f of classFeaturesByRow.get(row) ?? []) {
          classFeatureRows.push({ classId, subclassId: null, ...f })
        }
      }
    }

    // Cross-source parent resolution (Subclass): prefer an Open5e-sourced
    // ContentClass match by name, then a Compendium-sourced match, else
    // import with classId: null, flagged via extraData.unresolvedClassName.
    const subclassRows: Prisma.ContentSubclassCreateManyInput[] = []
    const subclassFeaturesByRow = new Map<
      Prisma.ContentSubclassCreateManyInput,
      ExplodedClassFeature[]
    >()
    for (const sub of pendingSubclasses) {
      const openMatch = await prisma.contentClass.findFirst({
        where: { name: sub.parentClassName, source: { type: 'API' } },
      })
      const anyMatch =
        openMatch ?? (await prisma.contentClass.findFirst({ where: { name: sub.parentClassName } }))
      const classId = anyMatch?.id ?? null

      const action = await resolveAction(
        prisma.contentSubclass,
        sub.row.sourceId,
        sub.row.slug,
        sub.row.name,
        sub.source.mappedOpen5eDocumentKey,
        duplicateDecision,
        'SUBCLASS',
        pending,
      )
      if (action !== 'insert') continue

      let extraData: Record<string, unknown> = sub.row.extraData
        ? JSON.parse(sub.row.extraData)
        : {}
      if (!classId) extraData = { ...extraData, unresolvedClassName: sub.parentClassName }
      const subclassRow = { ...sub.row, classId, extraData: JSON.stringify(extraData) }
      subclassRows.push(subclassRow)
      subclassFeaturesByRow.set(subclassRow, sub.features)
    }
    if (subclassRows.length > 0) {
      await prisma.contentSubclass.createMany({ data: dedupeSlugs(subclassRows) })
      totalInserted += subclassRows.length
    }

    if (subclassRows.length > 0) {
      const insertedSubclasses = await prisma.contentSubclass.findMany({
        where: { OR: subclassRows.map((r) => ({ sourceId: r.sourceId, slug: r.slug })) },
        select: { id: true, sourceId: true, slug: true },
      })
      const subclassIdByKey = new Map(
        insertedSubclasses.map((s) => [`${s.sourceId}::${s.slug}`, s.id]),
      )
      for (const row of subclassRows) {
        const subclassId = subclassIdByKey.get(`${row.sourceId}::${row.slug}`)
        if (!subclassId) continue
        for (const f of subclassFeaturesByRow.get(row) ?? []) {
          classFeatureRows.push({ classId: null, subclassId, ...f })
        }
      }
    }

    if (classFeatureRows.length > 0) {
      await prisma.contentClassFeature.createMany({ data: classFeatureRows })
      totalInserted += classFeatureRows.length
    }

    importEvents.emitProgress(jobId, {
      type: 'CLASS',
      status: 'done',
      count: classRows.length + subclassRows.length + classFeatureRows.length,
    })
  } catch (err) {
    errors.push({ contentType: 'CLASS', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'CLASS',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // ---- Race / Subrace ----
  try {
    const raceResults: CompendiumRaceResult[] = []
    let raceTransformSkipped = 0
    for (const raw of c.race ?? []) {
      try {
        raceResults.push(transformCompendiumRace(raw))
      } catch (recordErr) {
        raceTransformSkipped += 1
        if (raceTransformSkipped <= 5) {
          errors.push({
            contentType: 'RACE',
            message: `Skipped "${raw.name}": ${(recordErr as Error).message}`,
          })
        }
      }
    }
    const independentRaces = raceResults.filter(
      (r): r is Extract<CompendiumRaceResult, { kind: 'race' }> => r.kind === 'race',
    )
    const subraceResults = raceResults.filter(
      (r): r is Extract<CompendiumRaceResult, { kind: 'subrace' }> => r.kind === 'subrace',
    )

    const raceRows: Prisma.ContentRaceCreateManyInput[] = []
    for (const r of independentRaces) {
      await ensureSource(r.source)
      const action = await resolveAction(
        prisma.contentRace,
        r.row.sourceId,
        r.row.slug,
        r.row.name,
        r.source.mappedOpen5eDocumentKey,
        duplicateDecision,
        'RACE',
        pending,
      )
      if (action === 'insert') raceRows.push(r.row)
    }
    importEvents.emitProgress(jobId, { type: 'RACE', status: 'running' })
    if (raceRows.length > 0) {
      await prisma.contentRace.createMany({ data: dedupeSlugs(raceRows) })
      totalInserted += raceRows.length
    }

    // Cross-source parent resolution (Subrace), same order as Subclass.
    const subraceRows: Prisma.ContentSubraceCreateManyInput[] = []
    for (const sub of subraceResults) {
      await ensureSource(sub.source)
      const openMatch = await prisma.contentRace.findFirst({
        where: { name: sub.parentName, source: { type: 'API' } },
      })
      const anyMatch =
        openMatch ?? (await prisma.contentRace.findFirst({ where: { name: sub.parentName } }))
      const parentId = anyMatch?.id ?? null
      const row = sub.buildRow(parentId, anyMatch?.description ?? null)

      const action = await resolveAction(
        prisma.contentSubrace,
        row.sourceId,
        row.slug,
        row.name,
        sub.source.mappedOpen5eDocumentKey,
        duplicateDecision,
        'SUBRACE',
        pending,
      )
      if (action === 'insert') subraceRows.push(row)
    }
    if (subraceRows.length > 0) {
      await prisma.contentSubrace.createMany({ data: dedupeSlugs(subraceRows) })
      totalInserted += subraceRows.length
    }
    importEvents.emitProgress(jobId, {
      type: 'RACE',
      status: 'done',
      count: raceRows.length + subraceRows.length,
    })
  } catch (err) {
    errors.push({ contentType: 'RACE', message: (err as Error).message })
    importEvents.emitProgress(jobId, {
      type: 'RACE',
      status: 'error',
      message: (err as Error).message,
    })
  }

  // If cross-source matches were found and the caller hasn't told us how to
  // handle them yet, pause here — nothing has been written for those
  // specific pending records (they were provisionally skipped above).
  if (pending.length > 0 && !duplicateDecision) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        status: 'AWAITING_CONFIRMATION',
        processedItems: totalInserted,
        // Repurposed for AWAITING_CONFIRMATION: holds resume state *and*
        // any real per-content-type errors from this same run — both are
        // real information the job history shouldn't hide behind whichever
        // happened to occur. FAILED/PARTIAL jobs (no pending matches) use
        // this column for just the { contentType, message }[] shape.
        errorLog: JSON.stringify({
          filePath,
          matchCount: pending.length,
          matches: pending.slice(0, 50),
          errors: errors.length > 0 ? errors : undefined,
        }),
      },
    })
    importEvents.emitComplete(jobId, 'AWAITING_CONFIRMATION')
    return
  }

  const finalStatus = errors.length === 0 ? 'COMPLETED' : 'PARTIAL'
  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: finalStatus,
      processedItems: totalInserted,
      completedAt: new Date(),
      errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  })
  importEvents.emitComplete(jobId, finalStatus)
}
