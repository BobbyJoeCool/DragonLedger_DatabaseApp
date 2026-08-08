import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import { ClassCorrectableSchema, ClassPartialSchema, ClassSchema } from '@dragonledger/content-types'
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

export const classesRouter = Router()

const JSON_FIELDS = [
  'primaryAbility',
  'savingThrows',
  'armorProfs',
  'weaponProfs',
  'skillChoices',
  'extraData',
] as const

const writeConfig = {
  delegate: prisma.contentClass,
  schema: ClassSchema,
  partialSchema: ClassPartialSchema,
  correctableSchema: ClassCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Class',
}

// GET /api/classes — filters: source, q
classesRouter.get('/', async (req, res) => {
  const { sourceIds, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentClassWhereInput = {
    ...sourceWhere(sourceIds),
    ...(q ? { name: { contains: q } } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentClass.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentClass.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentClass.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/classes/:id — includes ContentClassFeature rows (Phase 2.6),
// ordered by level; Subclasses are a separate browsable list, fetched via
// GET /api/subclasses?classId=, not embedded here.
classesRouter.get('/:id', async (req, res) => {
  const cls = await prisma.contentClass.findUnique({
    where: { id: req.params.id },
    include: { features: { orderBy: { level: 'asc' } } },
  })
  if (!cls) {
    res.status(404).json({ error: 'Class not found' })
    return
  }
  const { features, ...rest } = cls
  res.json({ ...parseJsonFields(rest, JSON_FIELDS), features })
})

// POST /api/classes (auth)
classesRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/classes/:id (auth)
classesRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/classes/:id (auth) — dependent-aware: any Subclass or
// ClassOption pointing at this class, in any source (Phase 4 §1.7, extended
// per the design doc's reconciliation note to cover ClassOption the same as
// Subclass — same nullable-classId/SetNull shape). Non-MANUAL dependents are
// deleted alongside the class in the same transaction (replaceable — they
// reappear on that source's next refresh); MANUAL dependents are SetNull'd
// automatically and kept as orphans (irreplaceable user work).
classesRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const { confirm } = req.body as { confirm?: unknown }

  const existing = await prisma.contentClass.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json(errorResponse('NOT_FOUND', 'Class not found'))
    return
  }

  const [subclasses, classOptions] = await Promise.all([
    prisma.contentSubclass.findMany({
      where: { classId: id },
      select: { id: true, name: true, source: { select: { type: true } } },
    }),
    prisma.contentClassOption.findMany({
      where: { classId: id },
      select: { id: true, name: true, source: { select: { type: true } } },
    }),
  ])
  const subclassGroups = classifyDependents(subclasses)
  const classOptionGroups = classifyDependents(classOptions)
  const willDelete = [
    ...toDependentEntries('subclass', subclassGroups.willDelete),
    ...toDependentEntries('classOption', classOptionGroups.willDelete),
  ]
  const willOrphan = [
    ...toDependentEntries('subclass', subclassGroups.willOrphan),
    ...toDependentEntries('classOption', classOptionGroups.willOrphan),
  ]

  if (confirm !== true) {
    if (willDelete.length + willOrphan.length > 0) {
      res
        .status(409)
        .json(
          errorResponse('HAS_DEPENDENT_CHILDREN', 'This class has dependent subclasses/options', {
            dependents: { willDelete, willOrphan },
          }),
        )
      return
    }
    res.status(400).json(errorResponse('CONFIRM_REQUIRED', 'Deleting requires `{ confirm: true }`'))
    return
  }

  await prisma.$transaction(async (tx) => {
    const deleteSubclassIds = subclassGroups.willDelete.map((d) => d.id)
    const deleteClassOptionIds = classOptionGroups.willDelete.map((d) => d.id)
    if (deleteSubclassIds.length > 0) {
      await tx.contentSubclass.deleteMany({ where: { id: { in: deleteSubclassIds } } })
    }
    if (deleteClassOptionIds.length > 0) {
      await tx.contentClassOption.deleteMany({ where: { id: { in: deleteClassOptionIds } } })
    }
    // willOrphan dependents' classId is SetNull'd automatically by the DB
    // once the class row below is deleted.
    await tx.contentClass.delete({ where: { id } })
  })

  res.status(204).end()
})
