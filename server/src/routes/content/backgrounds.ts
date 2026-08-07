import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const backgroundsRouter = Router()

const JSON_FIELDS = ['proficiencies', 'abilityBonuses', 'feature', 'extraData'] as const

// GET /api/backgrounds — filters: source, q
backgroundsRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentBackgroundWhereInput = {
    ...(source ? { sourceId: source } : {}),
    ...(q ? { name: { contains: q } } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentBackground.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentBackground.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentBackground.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/backgrounds/:id
backgroundsRouter.get('/:id', async (req, res) => {
  const background = await prisma.contentBackground.findUnique({ where: { id: req.params.id } })
  if (!background) {
    res.status(404).json({ error: 'Background not found' })
    return
  }
  res.json(parseJsonFields(background, JSON_FIELDS))
})
