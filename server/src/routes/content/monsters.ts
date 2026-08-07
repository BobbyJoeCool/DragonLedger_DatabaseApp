import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

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

// GET /api/monsters — filters: cr, type, source, q
monstersRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { cr, type } = req.query as Record<string, string | undefined>

  const where: Prisma.ContentMonsterWhereInput = {
    ...(source ? { sourceId: source } : {}),
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
