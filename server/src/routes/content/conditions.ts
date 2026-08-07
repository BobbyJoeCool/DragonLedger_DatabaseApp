import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const conditionsRouter = Router()

const JSON_FIELDS = ['extraData'] as const

// GET /api/conditions — filters: source, q
conditionsRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentConditionWhereInput = {
    ...(source ? { sourceId: source } : {}),
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
