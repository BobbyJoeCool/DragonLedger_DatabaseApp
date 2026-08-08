import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import { ItemCorrectableSchema, ItemPartialSchema, ItemSchema } from '@dragonledger/content-types'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const itemsRouter = Router()

const JSON_FIELDS = ['properties', 'extraData'] as const

const writeConfig = {
  delegate: prisma.contentItem,
  schema: ItemSchema,
  partialSchema: ItemPartialSchema,
  correctableSchema: ItemCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Item',
}

// GET /api/items — filters: type, rarity, source, q
itemsRouter.get('/', async (req, res) => {
  const { sourceIds, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { type, rarity } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentItemWhereInput = {
    ...sourceWhere(sourceIds),
    ...(q ? { name: { contains: q } } : {}),
    ...(type ? { itemType: type } : {}),
    ...(rarity ? { rarity } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentItem.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentItem.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentItem.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/items/:id
itemsRouter.get('/:id', async (req, res) => {
  const item = await prisma.contentItem.findUnique({ where: { id: req.params.id } })
  if (!item) {
    res.status(404).json({ error: 'Item not found' })
    return
  }
  res.json(parseJsonFields(item, JSON_FIELDS))
})

// POST /api/items (auth)
itemsRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/items/:id (auth)
itemsRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/items/:id (auth) — no dependents, simple confirm+delete
itemsRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
