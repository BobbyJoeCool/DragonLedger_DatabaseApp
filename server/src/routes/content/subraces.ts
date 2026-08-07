import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const subracesRouter = Router()

const JSON_FIELDS = ['size', 'speed', 'traits', 'extraData'] as const

// GET /api/subraces — reached from a Race's card. filters: raceId, source, q
subracesRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { raceId } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentSubraceWhereInput = {
    ...(source ? { sourceId: source } : {}),
    ...(q ? { name: { contains: q } } : {}),
    ...(raceId ? { raceId } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentSubrace.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentSubrace.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentSubrace.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/subraces/:id
subracesRouter.get('/:id', async (req, res) => {
  const subrace = await prisma.contentSubrace.findUnique({ where: { id: req.params.id } })
  if (!subrace) {
    res.status(404).json({ error: 'Subrace not found' })
    return
  }
  res.json(parseJsonFields(subrace, JSON_FIELDS))
})
