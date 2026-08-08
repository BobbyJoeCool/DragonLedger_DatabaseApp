import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import { FeatCorrectableSchema, FeatPartialSchema, FeatSchema } from '../../schemas/content/feat.js'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const featsRouter = Router()

const JSON_FIELDS = ['extraData'] as const

const writeConfig = {
  delegate: prisma.contentFeat,
  schema: FeatSchema,
  partialSchema: FeatPartialSchema,
  correctableSchema: FeatCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Feat',
}

// GET /api/feats — filters: category, source, q
featsRouter.get('/', async (req, res) => {
  const { sourceIds, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { category } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentFeatWhereInput = {
    ...sourceWhere(sourceIds),
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

// POST /api/feats (auth)
featsRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/feats/:id (auth)
featsRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/feats/:id (auth) — no dependents, simple confirm+delete
featsRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
