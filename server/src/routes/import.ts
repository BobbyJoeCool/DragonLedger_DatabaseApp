import { Router } from 'express'
import { prisma } from '../db/client.js'
import { importEvents, type ImportProgressEvent } from '../importers/importEvents.js'
import { importSource, type Open5eContentType } from '../importers/orchestrator.js'
import { requireAuth } from '../middleware/auth.js'

export const importRouter = Router()

const VALID_CONTENT_TYPES: Open5eContentType[] = [
  'CONDITION',
  'SPELL',
  'RACE',
  'CLASS',
  'BACKGROUND',
  'ITEM',
  'MONSTER',
]

// POST /api/import/open5e — kicks off a background import and returns
// immediately with a jobId; progress is tracked via the DB-backed
// ImportJob row and streamed over GET /api/import/progress/:jobId.
importRouter.post('/open5e', requireAuth, async (req, res) => {
  const { sourceId, sourceName, contentTypes, documentKey } = req.body as {
    sourceId?: unknown
    sourceName?: unknown
    contentTypes?: unknown
    documentKey?: unknown
  }

  if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
    res.status(400).json({ error: '`sourceId` is required' })
    return
  }
  if (typeof sourceName !== 'string' || sourceName.trim().length === 0) {
    res.status(400).json({ error: '`sourceName` is required' })
    return
  }
  if (!Array.isArray(contentTypes) || contentTypes.length === 0) {
    res.status(400).json({ error: '`contentTypes` must be a non-empty array' })
    return
  }
  const invalid = contentTypes.filter((t) => !VALID_CONTENT_TYPES.includes(t))
  if (invalid.length > 0) {
    res.status(400).json({ error: `Unknown content type(s): ${invalid.join(', ')}` })
    return
  }
  if (documentKey !== undefined && typeof documentKey !== 'string') {
    res.status(400).json({ error: '`documentKey` must be a string' })
    return
  }

  // ImportJob.sourceId is a required FK — the Source row must exist first,
  // which matters for a brand-new sourceId (the orchestrator's own upsert
  // runs after this and would otherwise be too late).
  await prisma.source.upsert({
    where: { id: sourceId },
    update: {},
    create: {
      id: sourceId,
      name: sourceName,
      type: 'API',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })

  const job = await prisma.importJob.create({
    data: {
      sourceId,
      jobType: 'OPEN5E',
      contentTypes: JSON.stringify(contentTypes),
      status: 'PENDING',
    },
  })

  res.status(202).json({ jobId: job.id })

  // Fire-and-forget: the response above already went out. Per-content-type
  // failures are caught inside importSource and recorded on the job; this
  // catch is a last-resort net for anything that escapes that (e.g. the
  // initial Source upsert itself failing).
  importSource({
    sourceId,
    sourceName,
    documentKey: documentKey as string | undefined,
    contentTypes: contentTypes as Open5eContentType[],
    jobId: job.id,
  }).catch(async (err) => {
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorLog: JSON.stringify([{ contentType: 'ALL', message: (err as Error).message }]),
      },
    })
    importEvents.emitComplete(job.id, 'FAILED')
  })
})

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'PARTIAL'])

// GET /api/import/progress/:jobId — SSE stream of { type, status, ... }
// events. Replays current DB state on connect so a client that connects
// after some progress already happened isn't stuck waiting.
importRouter.get('/progress/:jobId', async (req, res) => {
  const jobId = req.params.jobId as string
  const job = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!job) {
    res.status(404).json({ error: 'Import job not found' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  send({
    type: 'STATUS',
    status: job.status,
    processedItems: job.processedItems,
    totalItems: job.totalItems,
  })

  if (TERMINAL_STATUSES.has(job.status)) {
    res.end()
    return
  }

  const listener = (event: ImportProgressEvent | { type: 'DONE'; status: string }) => {
    send(event)
    if (event.type === 'DONE') {
      importEvents.off(jobId, listener)
      res.end()
    }
  }
  importEvents.on(jobId, listener)

  req.on('close', () => {
    importEvents.off(jobId, listener)
  })
})

// GET /api/import/history — past import jobs, read from the DB.
importRouter.get('/history', async (_req, res) => {
  const jobs = await prisma.importJob.findMany({ orderBy: { startedAt: 'desc' }, take: 50 })
  res.json(
    jobs.map((j) => ({
      ...j,
      contentTypes: JSON.parse(j.contentTypes),
      errorLog: j.errorLog ? JSON.parse(j.errorLog) : null,
    })),
  )
})
