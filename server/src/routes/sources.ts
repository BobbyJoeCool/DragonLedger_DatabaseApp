import { Router } from 'express'
import { prisma } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { slugify } from '../utils/slugify.js'

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
    const messages: string[] = []

    const classIds = (
      await tx.contentClass.findMany({ where: { sourceId: id }, select: { id: true } })
    ).map((c) => c.id)
    const raceIds = (
      await tx.contentRace.findMany({ where: { sourceId: id }, select: { id: true } })
    ).map((r) => r.id)

    if (classIds.length > 0) {
      const orphanedSubclasses = await tx.contentSubclass.findMany({
        where: { classId: { in: classIds }, sourceId: { not: id } },
        select: { name: true, sourceId: true },
      })
      for (const s of orphanedSubclasses) {
        messages.push(
          `Subclass "${s.name}" (source: ${s.sourceId}) lost its parent class and is now unlinked`,
        )
      }

      const orphanedClassOptions = await tx.contentClassOption.findMany({
        where: { classId: { in: classIds }, sourceId: { not: id } },
        select: { name: true, sourceId: true },
      })
      for (const o of orphanedClassOptions) {
        messages.push(
          `Class option "${o.name}" (source: ${o.sourceId}) lost its parent class and is now unlinked`,
        )
      }
    }

    if (raceIds.length > 0) {
      const orphanedSubraces = await tx.contentSubrace.findMany({
        where: { raceId: { in: raceIds }, sourceId: { not: id } },
        select: { name: true, sourceId: true },
      })
      for (const s of orphanedSubraces) {
        messages.push(
          `Subrace "${s.name}" (source: ${s.sourceId}) lost its parent race and is now unlinked`,
        )
      }

      // ContentRace.parentRaceId is onDelete: NoAction — unlike the SetNull
      // relations above, SQLite won't clear this automatically, and a
      // cross-source child left pointing at a row about to be deleted would
      // make the delete below fail with a foreign key constraint error.
      const orphanedSubspecies = await tx.contentRace.findMany({
        where: { parentRaceId: { in: raceIds }, sourceId: { not: id } },
        select: { id: true, name: true, sourceId: true },
      })
      if (orphanedSubspecies.length > 0) {
        await tx.contentRace.updateMany({
          where: { id: { in: orphanedSubspecies.map((r) => r.id) } },
          data: { parentRaceId: null },
        })
        for (const r of orphanedSubspecies) {
          messages.push(
            `Race "${r.name}" (source: ${r.sourceId}) lost its parent race and is now unlinked`,
          )
        }
      }
    }

    // ImportJob.sourceId is onDelete: RESTRICT — a source's job history
    // doesn't outlive the source itself.
    await tx.importJob.deleteMany({ where: { sourceId: id } })

    await tx.source.delete({ where: { id } })

    return messages
  })

  res.json({ warnings })
})
