import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/client.js'
import { envelope, parseJsonFields, parseListQuery } from './shared.js'

export const spellsRouter = Router()

const JSON_FIELDS = ['classes', 'extraData'] as const

// GET /api/spells — filters: source, q, level, school, class
spellsRouter.get('/', async (req, res) => {
  const { source, q, page, limit, skip, fieldsName } = parseListQuery(req)
  const { level, school, class: className } = req.query as Record<string, string | undefined>

  if (level !== undefined && Number.isNaN(Number.parseInt(level, 10))) {
    res.status(400).json({ error: '`level` must be an integer' })
    return
  }

  const where: Prisma.ContentSpellWhereInput = {
    ...(source ? { sourceId: source } : {}),
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
