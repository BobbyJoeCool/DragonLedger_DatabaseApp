import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  ConditionCorrectableSchema,
  ConditionPartialSchema,
  ConditionSchema,
} from '@dragonledger/content-types'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const conditionsRouter = Router()

const JSON_FIELDS = ['extraData'] as const

const writeConfig = {
  delegate: prisma.contentCondition,
  schema: ConditionSchema,
  partialSchema: ConditionPartialSchema,
  correctableSchema: ConditionCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Condition',
}

// GET /api/conditions — filters: source, q
conditionsRouter.get('/', async (req, res) => {
  const { sourceIds, sourceType, q, page, limit, skip, fieldsName, fieldsAll } = parseListQuery(req)

  const where: Prisma.ContentConditionWhereInput = {
    ...sourceWhere(sourceIds, sourceType),
    ...(q ? { name: { contains: q } } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentCondition.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  if (fieldsAll) {
    const rows = await prisma.contentCondition.findMany({ where, orderBy: { name: 'asc' } })
    res.json(rows.map((r) => parseJsonFields(r, JSON_FIELDS)))
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentCondition.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentCondition.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/conditions/:id
conditionsRouter.get('/:id', async (req, res) => {
  const condition = await prisma.contentCondition.findUnique({ where: { id: req.params.id } })
  if (!condition) {
    res.status(404).json({ error: 'Condition not found' })
    return
  }
  res.json(parseJsonFields(condition, JSON_FIELDS))
})

// POST /api/conditions (auth)
conditionsRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/conditions/:id (auth)
conditionsRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/conditions/:id (auth) — no dependents, simple confirm+delete
conditionsRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
