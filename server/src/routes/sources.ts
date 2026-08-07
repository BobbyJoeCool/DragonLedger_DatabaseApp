import { Router } from 'express'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { slugify } from '../utils/slugify.js'
import { errorResponse } from '../utils/errorResponse.js'
import { clearContentForSource, findOrphanWarnings } from '../utils/sourceContent.js'

export const sourcesRouter = Router()

const CONTENT_COUNT_SELECT = {
  spells: true,
  classes: true,
  subclasses: true,
  races: true,
  subraces: true,
  backgrounds: true,
  conditions: true,
  items: true,
  monsters: true,
  feats: true,
  classOptions: true,
} as const

function entryCountOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

// GET /api/sources — list all sources
sourcesRouter.get('/', async (_req, res) => {
  const sources = await prisma.source.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: CONTENT_COUNT_SELECT } },
  })

  res.json(
    sources.map(({ _count, ...source }) => ({
      ...source,
      entryCount: entryCountOf(_count),
    })),
  )
})

// POST /api/sources — create a new manual source
sourcesRouter.post('/', requireAuth, async (req, res) => {
  const { name, description } = req.body as { name?: unknown; description?: unknown }

  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: '`name` is required' })
    return
  }
  if (description !== undefined && typeof description !== 'string') {
    res.status(400).json({ error: '`description` must be a string' })
    return
  }

  const baseId = slugify(name)
  if (baseId.length === 0) {
    res.status(400).json({ error: '`name` must contain at least one alphanumeric character' })
    return
  }

  let id = baseId
  let suffix = 2
  while (await prisma.source.findUnique({ where: { id } })) {
    id = `${baseId}-${suffix}`
    suffix += 1
  }

  const source = await prisma.source.create({
    data: {
      id,
      name,
      type: 'MANUAL',
      description: description ?? null,
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })

  res.status(201).json(source)
})

// GET /api/sources/:id — single source detail
sourcesRouter.get('/:id', async (req, res) => {
  const source = await prisma.source.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: CONTENT_COUNT_SELECT } },
  })

  if (!source) {
    res.status(404).json({ error: 'Source not found' })
    return
  }

  const { _count, ...rest } = source
  res.json({ ...rest, entryCount: entryCountOf(_count) })
})

// DELETE /api/sources/:id — delete a source and all its entries
sourcesRouter.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id as string

  const source = await prisma.source.findUnique({ where: { id } })
  if (!source) {
    res.status(404).json({ error: 'Source not found' })
    return
  }
  if (!source.isDeletable) {
    res.status(400).json({ error: `Source "${id}" is protected and cannot be deleted` })
    return
  }

  const warnings = await prisma.$transaction(async (tx) => {
    const messages = await findOrphanWarnings(tx, id)

    // ImportJob.sourceId is onDelete: RESTRICT — a source's job history
    // doesn't outlive the source itself.
    await tx.importJob.deleteMany({ where: { sourceId: id } })

    await tx.source.delete({ where: { id } })

    return messages
  })

  res.json({ warnings })
})

// DELETE /api/sources/:id/entries — bulk-clear every content row for a
// source, leaving the Source row itself intact. The delete half of a
// refresh, without the re-import step (Phase 4 §1.8). Heavier confirmation
// than a single-entry delete (exact-name match), proportional to blast radius.
sourcesRouter.delete('/:id/entries', requireAuth, async (req, res) => {
  const id = req.params.id as string
  const { confirmName } = req.body as { confirmName?: unknown }

  const source = await prisma.source.findUnique({ where: { id } })
  if (!source) {
    res.status(404).json(errorResponse('NOT_FOUND', 'Source not found'))
    return
  }
  if (typeof confirmName !== 'string' || confirmName !== source.name) {
    res
      .status(400)
      .json(
        errorResponse(
          'CONFIRM_NAME_MISMATCH',
          '`confirmName` must exactly match the source\'s name',
        ),
      )
    return
  }

  const { deletedCount, warnings } = await prisma.$transaction(async (tx) => {
    const warnings = await findOrphanWarnings(tx, id)
    const deletedCount = await clearContentForSource(tx, id)
    return { deletedCount, warnings }
  })

  res.json({ deletedCount, warnings })
})
