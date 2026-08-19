import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import { SpellCorrectableSchema, SpellPartialSchema, SpellSchema } from '@dragonledger/content-types'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const spellsRouter = Router()

const JSON_FIELDS = ['classes', 'extraData'] as const

const writeConfig = {
  delegate: prisma.contentSpell,
  schema: SpellSchema,
  partialSchema: SpellPartialSchema,
  correctableSchema: SpellCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Spell',
}

// GET /api/spells — filters: source, q, level, school, class
spellsRouter.get('/', async (req, res) => {
  const { sourceIds, sourceType, edition, q, page, limit, skip, fieldsName, fieldsAll } = parseListQuery(req)
  const { level, school, class: className } = req.query as Record<string, string | undefined>

  if (level !== undefined && Number.isNaN(Number.parseInt(level, 10))) {
    res.status(400).json({ error: '`level` must be an integer' })
    return
  }

  const where: Prisma.ContentSpellWhereInput = {
    ...sourceWhere(sourceIds, sourceType, edition),
    ...(q ? { name: { contains: q } } : {}),
    ...(level !== undefined ? { level: Number.parseInt(level, 10) } : {}),
    ...(school ? { school } : {}),
    // classes is a JSON string array of display names — match the quoted
    // element so "Sorcerer" doesn't also match a class named "Sorcerer II".
    ...(className ? { classes: { contains: `"${className}"` } } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentSpell.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  if (fieldsAll) {
    const rows = await prisma.contentSpell.findMany({ where, orderBy: { name: 'asc' } })
    res.json(rows.map((r) => parseJsonFields(r, JSON_FIELDS)))
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentSpell.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentSpell.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/spells/:id
spellsRouter.get('/:id', async (req, res) => {
  const spell = await prisma.contentSpell.findUnique({ where: { id: req.params.id } })
  if (!spell) {
    res.status(404).json({ error: 'Spell not found' })
    return
  }
  res.json(parseJsonFields(spell, JSON_FIELDS))
})

// POST /api/spells (auth)
spellsRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/spells/:id (auth)
spellsRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/spells/:id (auth) — no dependents, simple confirm+delete
spellsRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
