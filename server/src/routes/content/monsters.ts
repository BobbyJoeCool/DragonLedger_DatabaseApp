import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  MonsterCorrectableSchema,
  MonsterPartialSchema,
  MonsterSchema,
} from '../../schemas/content/monster.js'
import { envelope, parseJsonFields, parseListQuery, sourceWhere } from './shared.js'
import { createPatchHandler, createPostHandler, createSimpleDeleteHandler } from './writeHandlers.js'

export const monstersRouter = Router()

const JSON_FIELDS = [
  'speed',
  'abilityScores',
  'savingThrows',
  'skills',
  'damageResistances',
  'damageImmunities',
  'damageVulnerabilities',
  'conditionImmunities',
  'actions',
  'legendaryActions',
  'extraData',
] as const

const writeConfig = {
  delegate: prisma.contentMonster,
  schema: MonsterSchema,
  partialSchema: MonsterPartialSchema,
  correctableSchema: MonsterCorrectableSchema,
  jsonFields: JSON_FIELDS,
  label: 'Monster',
}

// GET /api/monsters — filters: cr, type, source, q
monstersRouter.get('/', async (req, res) => {
  const { sourceIds, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { cr, type } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentMonsterWhereInput = {
    ...sourceWhere(sourceIds),
    ...(q ? { name: { contains: q } } : {}),
    // challengeRating is a String to hold fractions like "1/8" — exact match, not numeric comparison.
    ...(cr ? { challengeRating: cr } : {}),
    ...(type ? { monsterType: type } : {}),
  }

  if (fieldsName) {
    const rows = await prisma.contentMonster.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    res.json(rows)
    return
  }

  const [rows, total] = await Promise.all([
    prisma.contentMonster.findMany({ where, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.contentMonster.count({ where }),
  ])
  res.json(envelope(rows.map((r) => parseJsonFields(r, JSON_FIELDS)), total, page, limit))
})

// GET /api/monsters/:id
monstersRouter.get('/:id', async (req, res) => {
  const monster = await prisma.contentMonster.findUnique({ where: { id: req.params.id } })
  if (!monster) {
    res.status(404).json({ error: 'Monster not found' })
    return
  }
  res.json(parseJsonFields(monster, JSON_FIELDS))
})

// POST /api/monsters (auth)
monstersRouter.post('/', requireAuth, createPostHandler(writeConfig))

// PATCH /api/monsters/:id (auth)
monstersRouter.patch('/:id', requireAuth, createPatchHandler(writeConfig))

// DELETE /api/monsters/:id (auth) — no dependents, simple confirm+delete
monstersRouter.delete('/:id', requireAuth, createSimpleDeleteHandler(writeConfig))
