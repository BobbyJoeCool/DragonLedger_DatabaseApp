import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const featsRouter = Router()

const JSON_FIELDS = ['extraData'] as const

// GET /api/feats — filters: category, source, q
featsRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { category } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentFeatWhereInput = {
    ...(source ? { sourceId: source } : {}),
    ...(q ? { name: { contains: q } } : {}),
    ...(category ? { category } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentFeat.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentFeat.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentFeat.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/feats/:id
featsRouter.get('/:id', async (req, res) => {
  const feat = await prisma.contentFeat.findUnique({ where: { id: req.params.id } })
  if (!feat) {
    res.status(404).json({ error: 'Feat not found' })
    return
  }
  res.json(parseJsonFields(feat, JSON_FIELDS))
})
