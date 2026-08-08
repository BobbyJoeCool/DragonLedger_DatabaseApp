import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import { RaceCorrectableSchema, RacePartialSchema, RaceSchema } from '@dragonledger/content-types'
import { errorResponse } from '../../utils/errorResponse.js'
import {
  classifyDependents,
  envelope,
  parseJsonFields,
  parseListQuery,
  sourceWhere,
  toDependentEntries,
} from './shared.js'
import { createPatchHandler, createPostHandler } from './writeHandlers.js'

export const racesRouter = Router()

const JSON_FIELDS = ['size', 'speed', 'traits', 'extraData'] as const

const writeConfig = {
  delegate: prisma.contentRace,
  schema: RaceSchema,
  partialSchema: RacePartialSchema,
  correctableSchema: RaceCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Race',
}

// GET /api/races — filters: source, q
racesRouter.get('/', async (req, res) => {
  const { sourceIds, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentRaceWhereInput = {
    ...sourceWhere(sourceIds),
    ...(q ? { name: { contains: q } } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentRace.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentRace.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentRace.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/races/:id — Subraces are a separate browsable list, fetched via
// GET /api/subraces?raceId=, not embedded here.
racesRouter.get('/:id', async (req, res) => {
  const race = await prisma.contentRace.findUnique({ where: { id: req.params.id } })
  if (!race) {
    res.status(404).json({ error: 'Race not found' })
    return
  }
  res.json(parseJsonFields(race, JSON_FIELDS))
})

// POST /api/races (auth)
racesRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/races/:id (auth)
racesRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/races/:id (auth) — dependent-aware: any Subrace (raceId) or
// subspecies (self-relation parentRaceId) pointing at this race, in any
// source (Phase 4 §1.7). Non-MANUAL dependents are deleted alongside; MANUAL
// dependents are kept as orphans — Subrace's raceId is SetNull and clears
// automatically, but ContentRace.parentRaceId is onDelete: NoAction (not
// SetNull), so MANUAL subspecies need their parentRaceId explicitly nulled
// here before the parent race is deleted, or the delete would fail with a
// foreign key constraint error (same reasoning as sources.ts's existing
// whole-source-delete handler / utils/sourceContent.ts's findOrphanWarnings).
racesRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const { confirm } = req.body as { confirm?: unknown }

  const existing = await prisma.contentRace.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json(errorResponse('NOT_FOUND', 'Race not found'))
    return
  }

  const [subraces, subspecies] = await Promise.all([
    prisma.contentSubrace.findMany({
      where: { raceId: id },
      select: { id: true, name: true, source: { select: { type: true } } },
    }),
    prisma.contentRace.findMany({
      where: { parentRaceId: id },
      select: { id: true, name: true, source: { select: { type: true } } },
    }),
  ])
  const subraceGroups = classifyDependents(subraces)
  const subspeciesGroups = classifyDependents(subspecies)
  const willDelete = [
    ...toDependentEntries('subrace', subraceGroups.willDelete),
    ...toDependentEntries('race', subspeciesGroups.willDelete),
  ]
  const willOrphan = [
    ...toDependentEntries('subrace', subraceGroups.willOrphan),
    ...toDependentEntries('race', subspeciesGroups.willOrphan),
  ]

  if (confirm !== true) {
    if (willDelete.length + willOrphan.length > 0) {
      res
        .status(409)
        .json(
          errorResponse('HAS_DEPENDENT_CHILDREN', 'This race has dependent subraces/subspecies', {
            dependents: { willDelete, willOrphan },
          }),
        )
      return
    }
    res.status(400).json(errorResponse('CONFIRM_REQUIRED', 'Deleting requires `{ confirm: true }`'))
    return
  }

  await prisma.$transaction(async (tx) => {
    const deleteSubraceIds = subraceGroups.willDelete.map((d) => d.id)
    const deleteSubspeciesIds = subspeciesGroups.willDelete.map((d) => d.id)
    const orphanSubspeciesIds = subspeciesGroups.willOrphan.map((d) => d.id)

    if (deleteSubraceIds.length > 0) {
      await tx.contentSubrace.deleteMany({ where: { id: { in: deleteSubraceIds } } })
    }
    if (deleteSubspeciesIds.length > 0) {
      await tx.contentRace.deleteMany({ where: { id: { in: deleteSubspeciesIds } } })
    }
    if (orphanSubspeciesIds.length > 0) {
      await tx.contentRace.updateMany({
        where: { id: { in: orphanSubspeciesIds } },
        data: { parentRaceId: null },
      })
    }
    // willOrphan subrace dependents' raceId is SetNull'd automatically by
    // the DB once the race row below is deleted.
    await tx.contentRace.delete({ where: { id } })
  })

  res.status(204).end()
})
