import { existsSync } from 'node:fs'
import { Router } from 'express'
import { prisma } from '../db/client.js'
import { importCompendium, type DuplicateDecision } from '../importers/compendiumOrchestrator.js'
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

const COMPENDIUM_CONTENT_TYPES = ['FEAT', 'SPELL', 'ITEM', 'BACKGROUND', 'MONSTER', 'CLASS', 'RACE']

// POST /api/import/compendium — imports a local Complete_Compendium_5.5e.xml
// file. No upload UI exists yet (Phase 6), so this takes a server-side file
// path rather than a multipart upload — matches how the file is actually
// used today (a local DevTools copy), not a hypothetical browser upload.
// If cross-source duplicate matches are found and no duplicateDecision was
// given, the job pauses in AWAITING_CONFIRMATION — see
// POST /api/import/compendium/:jobId/resume.
importRouter.post('/compendium', requireAuth, async (req, res) => {
  const { filePath, duplicateDecision } = req.body as {
    filePath?: unknown
    duplicateDecision?: unknown
  }

  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    res.status(400).json({ error: '`filePath` is required' })
    return
  }
  if (!existsSync(filePath)) {
    res.status(400).json({ error: `File not found: ${filePath}` })
    return
  }
  if (
    duplicateDecision !== undefined &&
    duplicateDecision !== 'duplicate' &&
    duplicateDecision !== 'skip'
  ) {
    res.status(400).json({ error: '`duplicateDecision` must be "duplicate" or "skip" if provided' })
    return
  }

  // Compendium content is additive-only and spans many per-book Source
  // rows discovered while parsing the file — there's no single sourceId to
  // attach the job to up front the way Open5e's job has one. The
  // "uncredited" fallback source (upserted here so the FK is satisfiable)
  // is as good a home for the job record as any single real book would be.
  await prisma.source.upsert({
    where: { id: 'fc5-compendium-uncredited' },
    update: {},
    create: {
      id: 'fc5-compendium-uncredited',
      name: 'Compendium (Uncredited)',
      type: 'FILE',
      lastUpdated: new Date(),
      isDeletable: true,
    },
  })

  const job = await prisma.importJob.create({
    data: {
      sourceId: 'fc5-compendium-uncredited',
      jobType: 'FILE',
      contentTypes: JSON.stringify(COMPENDIUM_CONTENT_TYPES),
      status: 'PENDING',
    },
  })

  res.status(202).json({ jobId: job.id })

  importCompendium({
    filePath,
    jobId: job.id,
    duplicateDecision: duplicateDecision as DuplicateDecision | undefined,
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

// POST /api/import/compendium/:jobId/resume — completes a job left in
// AWAITING_CONFIRMATION, applying the batch decision to every pending
// cross-source match. Re-parses the same file (fast — under a second for
// the full ~32MB file) rather than persisting the whole transformed
// dataset between calls; records already written on the first pass are
// naturally skipped again via the same same-source check that makes
// Compendium re-imports idempotent.
importRouter.post('/compendium/:jobId/resume', requireAuth, async (req, res) => {
  const jobId = req.params.jobId as string
  const { decision } = req.body as { decision?: unknown }

  if (decision !== 'duplicate' && decision !== 'skip') {
    res.status(400).json({ error: '`decision` must be "duplicate" or "skip"' })
    return
  }

  const job = await prisma.importJob.findUnique({ where: { id: jobId } })
  if (!job) {
    res.status(404).json({ error: 'Import job not found' })
    return
  }
  if (job.status !== 'AWAITING_CONFIRMATION') {
    res.status(400).json({ error: `Job is not awaiting confirmation (status: ${job.status})` })
    return
  }

  const state = JSON.parse(job.errorLog ?? '{}') as { filePath?: string }
  if (!state.filePath) {
    res.status(500).json({ error: 'Job is missing its stored file path and cannot be resumed' })
    return
  }

  res.status(202).json({ jobId: job.id })

  importCompendium({ filePath: state.filePath, jobId: job.id, duplicateDecision: decision }).catch(
    async (err) => {
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorLog: JSON.stringify([{ contentType: 'ALL', message: (err as Error).message }]),
        },
      })
      importEvents.emitComplete(job.id, 'FAILED')
    },
  )
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
