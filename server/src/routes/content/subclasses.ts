import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  SubclassCorrectableSchema,
  SubclassPartialSchema,
  SubclassSchema,
} from '../../schemas/content/class.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const subclassesRouter = Router()

const JSON_FIELDS = ['extraData'] as const

const writeConfig = {
  delegate: prisma.contentSubclass,
  schema: SubclassSchema,
  partialSchema: SubclassPartialSchema,
  correctableSchema: SubclassCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Subclass',
}

// GET /api/subclasses — reached from a Class's card. filters: classId, source, q
subclassesRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { classId } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentSubclassWhereInput = {
    ...(source ? { sourceId: source } : {}),
    ...(q ? { name: { contains: q } } : {}),
    ...(classId ? { classId } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentSubclass.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentSubclass.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentSubclass.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/subclasses/:id — includes its own ContentClassFeature rows
subclassesRouter.get('/:id', async (req, res) => {
  const subclass = await prisma.contentSubclass.findUnique({
    where: { id: req.params.id },
    include: { features: { orderBy: { level: 'asc' } } },
  })
  if (!subclass) {
    res.status(404).json({ error: 'Subclass not found' })
    return
  }
  const { features, ...rest } = subclass
  res.json({ ...parseJsonFields(rest, JSON_FIELDS), features })
})

// POST /api/subclasses (auth)
subclassesRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/subclasses/:id (auth)
subclassesRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/subclasses/:id (auth) — nothing references a Subclass, simple confirm+delete
subclassesRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
