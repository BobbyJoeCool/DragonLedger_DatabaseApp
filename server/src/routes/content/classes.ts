import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const classesRouter = Router()

const JSON_FIELDS = [
  'primaryAbility',
  'savingThrows',
  'armorProfs',
  'weaponProfs',
  'skillChoices',
  'extraData',
] as const

// GET /api/classes — filters: source, q
classesRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentClassWhereInput = {
    ...(source ? { sourceId: source } : {}),
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
