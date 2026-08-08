import type { Request, Response } from 'express'
import type { z } from 'zod'
import { prisma } from '../../db/client.js'
import { errorResponse } from '../../utils/errorResponse.js'
import {
  isUniqueConstraintError,
  parseJsonFields,
  resolveManualSource,
  serializeJsonFields,
  zodFieldErrors,
} from './shared.js'

// Loosely-typed on purpose: shared across 9+ content types whose Prisma
// delegates each have their own concrete Create/Update/Where types. The real
// type safety lives at each schema's Zod validation boundary (POST/PATCH
// bodies) and at parseJsonFields/serializeJsonFields — this interface only
// needs to describe "a Prisma model delegate," not any one model's shape.
interface ContentDelegate {
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>
  update(args: {
    where: { id: string }
    data: Record<string, unknown>
  }): Promise<Record<string, unknown>>
  findUnique(args: { where: { id: string } }): Promise<Record<string, unknown> | null>
  delete(args: { where: { id: string } }): Promise<Record<string, unknown>>
}

export interface ContentWriteConfig {
  delegate: ContentDelegate
  schema: z.ZodObject
  partialSchema: z.ZodObject
  correctableSchema: z.ZodObject
  jsonFields: readonly string[]
  label: string
}

function slugConflictError(label: string) {
  return errorResponse(
    'SLUG_CONFLICT',
    `A ${label.toLowerCase()} with this slug already exists in this source`,
  )
}

// POST /api/<type> (Phase 4 §3): body must resolve `sourceId` to a MANUAL
// source. 201 / 400 SOURCE_NOT_MANUAL / 409 SLUG_CONFLICT / 400 VALIDATION_ERROR.
export function createPostHandler(config: ContentWriteConfig) {
  return async (req: Request, res: Response) => {
    const parsed = config.schema.safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json(
          errorResponse('VALIDATION_ERROR', `Invalid ${config.label} data`, {
            fields: zodFieldErrors(parsed.error),
          }),
        )
      return
    }
    const data = parsed.data as Record<string, unknown>

    const manualSource = await resolveManualSource(data.sourceId as string)
    if (!manualSource) {
      res
        .status(400)
        .json(errorResponse('SOURCE_NOT_MANUAL', '`sourceId` must resolve to a MANUAL source'))
      return
    }

    try {
      const created = await config.delegate.create({
        data: serializeJsonFields(data, config.jsonFields),
      })
      res.status(201).json(parseJsonFields(created, config.jsonFields))
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        res.status(409).json(slugConflictError(config.label))
        return
      }
      throw err
    }
  }
}

// PATCH /api/<type>/:id (Phase 4 §3, revised by phase-4-write-api-final-export.md
// §4 2026-08-08): correctability is source-type-based, not a blanket
// per-type check. MANUAL sources always apply in place. FILE (Compendium)
// sources apply in place only for fields outside the lock list
// (config.correctableSchema, now name/slug/sourceId/parent-FK-omitted).
// API (Open5e) sources never apply in place — every edit needs `saveAs`,
// since a re-import would silently wipe an in-place fix anyway.
export function createPatchHandler(config: ContentWriteConfig) {
  return async (req: Request, res: Response) => {
    const existing = await config.delegate.findUnique({ where: { id: req.params.id as string } })
    if (!existing) {
      res.status(404).json(errorResponse('NOT_FOUND', `${config.label} not found`))
      return
    }

    const source = await prisma.source.findUnique({ where: { id: existing.sourceId as string } })

    const {
      saveAs,
      targetSourceId,
      sourceId: _ignoredSourceId, // sourceId only ever changes via saveAs/targetSourceId, never a raw field edit
      ...changedFields
    } = req.body as Record<string, unknown>

    const respondUpdated = async (data: Record<string, unknown>) => {
      try {
        const updated = await config.delegate.update({
          where: { id: existing.id as string },
          data: serializeJsonFields(data, config.jsonFields),
        })
        res.json(parseJsonFields(updated, config.jsonFields))
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          res.status(409).json(slugConflictError(config.label))
          return
        }
        throw err
      }
    }

    if (source?.type === 'FILE') {
      const correctableResult = config.correctableSchema.strict().safeParse(changedFields)
      if (correctableResult.success) {
        await respondUpdated(correctableResult.data as Record<string, unknown>)
        return
      }
    }

    const generalResult = config.partialSchema.strict().safeParse(changedFields)
    if (!generalResult.success) {
      res
        .status(400)
        .json(
          errorResponse('VALIDATION_ERROR', `Invalid ${config.label} data`, {
            fields: zodFieldErrors(generalResult.error),
          }),
        )
      return
    }
    const data = generalResult.data as Record<string, unknown>

    if (source?.type === 'MANUAL') {
      await respondUpdated(data)
      return
    }

    if (saveAs !== 'original' && saveAs !== 'homebrew') {
      res
        .status(400)
        .json(
          errorResponse(
            'SAVE_AS_REQUIRED',
            'This edit requires `saveAs: "original"` or `saveAs: "homebrew"`',
          ),
        )
      return
    }

    if (saveAs === 'original') {
      await respondUpdated(data)
      return
    }

    // saveAs === 'homebrew': duplicate as a new row under the resolved
    // MANUAL destination — original untouched (Phase 4 §1.9).
    const targetId = typeof targetSourceId === 'string' ? targetSourceId : 'homebrew'
    const target = await resolveManualSource(targetId)
    if (!target) {
      res
        .status(400)
        .json(
          errorResponse('SOURCE_NOT_MANUAL', '`targetSourceId` must resolve to a MANUAL source'),
        )
      return
    }

    const { id: _existingId, ...rest } = existing
    const newRow = {
      ...rest,
      ...serializeJsonFields(data, config.jsonFields),
      sourceId: target.id,
    }
    try {
      const created = await config.delegate.create({ data: newRow })
      res.status(201).json(parseJsonFields(created, config.jsonFields))
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        res.status(409).json(slugConflictError(config.label))
        return
      }
      throw err
    }
  }
}

// DELETE /api/<type>/:id for content types nothing else references (every
// type except Class and Race, which get their own dependent-aware handler).
export function createSimpleDeleteHandler(config: Pick<ContentWriteConfig, 'delegate' | 'label'>) {
  return async (req: Request, res: Response) => {
    const existing = await config.delegate.findUnique({ where: { id: req.params.id as string } })
    if (!existing) {
      res.status(404).json(errorResponse('NOT_FOUND', `${config.label} not found`))
      return
    }

    const { confirm } = req.body as { confirm?: unknown }
    if (confirm !== true) {
      res.status(400).json(errorResponse('CONFIRM_REQUIRED', 'Deleting requires `{ confirm: true }`'))
      return
    }

    await config.delegate.delete({ where: { id: existing.id as string } })
    res.status(204).end()
  }
}
