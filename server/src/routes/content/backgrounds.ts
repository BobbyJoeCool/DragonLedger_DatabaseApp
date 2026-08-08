import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  BackgroundCorrectableSchema,
  BackgroundPartialSchema,
  BackgroundSchema,
} from '@dragonledger/content-types'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const backgroundsRouter = Router()

const JSON_FIELDS = ['proficiencies', 'abilityBonuses', 'feature', 'extraData'] as const

const writeConfig = {
  delegate: prisma.contentBackground,
  schema: BackgroundSchema,
  partialSchema: BackgroundPartialSchema,
  correctableSchema: BackgroundCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Background',
}

// GET /api/backgrounds — filters: source, q
backgroundsRouter.get('/', async (req, res) => {
  const { sourceIds, q, page, limit, skip, fieldsName } = parseListQuery(req)

  const where: Prisma.ContentBackgroundWhereInput = {
    ...sourceWhere(sourceIds),
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

// POST /api/backgrounds (auth)
backgroundsRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/backgrounds/:id (auth)
backgroundsRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/backgrounds/:id (auth) — no dependents, simple confirm+delete
backgroundsRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
