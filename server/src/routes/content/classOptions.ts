import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const classOptionsRouter = Router()

const JSON_FIELDS = ['extraData'] as const

// GET /api/class-options — Metamagic / Eldritch Invocations / Maneuvers.
// filters: classId, pool, source, q. Given its own endpoint (not nested
// under Class) per the resolved Phase 3 open question — most live rows
// currently have classId: null (general options not yet linked to a class).
classOptionsRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { classId, pool } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentClassOptionWhereInput = {
    ...(source ? { sourceId: source } : {}),
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
