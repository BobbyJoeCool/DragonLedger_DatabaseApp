import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const racesRouter = Router()

const JSON_FIELDS = ['size', 'speed', 'traits', 'extraData'] as const

// GET /api/races — filters: source, q
racesRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentRaceWhereInput = {
    ...(source ? { sourceId: source } : {}),
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
