import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  ClassOptionCorrectableSchema,
  ClassOptionPartialSchema,
  ClassOptionSchema,
} from '@dragonledger/content-types'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const classOptionsRouter = Router()

const JSON_FIELDS = ['extraData'] as const

const writeConfig = {
  delegate: prisma.contentClassOption,
  schema: ClassOptionSchema,
  partialSchema: ClassOptionPartialSchema,
  correctableSchema: ClassOptionCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Class option',
}

// GET /api/class-options — Metamagic / Eldritch Invocations / Maneuvers.
// filters: classId, pool, source, q. Given its own endpoint (not nested
// under Class) per the resolved Phase 3 open question — most live rows
// currently have classId: null (general options not yet linked to a class).
classOptionsRouter.get('/', async (req, res) => {
  const { sourceIds, sourceType, edition, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { classId, pool } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentClassOptionWhereInput = {
    ...sourceWhere(sourceIds, sourceType, edition),
    ...(q ? { name: { contains: q } } : {}),
    ...(classId ? { classId } : {}),
    ...(pool ? { pool } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentClassOption.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentClassOption.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentClassOption.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/class-options/:id
classOptionsRouter.get('/:id', async (req, res) => {
  const classOption = await prisma.contentClassOption.findUnique({ where: { id: req.params.id } })
  if (!classOption) {
    res.status(404).json({ error: 'Class option not found' })
    return
  }
  res.json(parseJsonFields(classOption, JSON_FIELDS))
})

// POST /api/class-options (auth)
classOptionsRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/class-options/:id (auth)
classOptionsRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/class-options/:id (auth) — nothing references a ClassOption
// itself (it's the dependent, not the parent — see Class's delete handler
// for the reconciliation note), simple confirm+delete
classOptionsRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
