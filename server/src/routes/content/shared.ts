import type { Request } from 'express'
import { z } from 'zod'
import { Prisma, type SourceType } from '@prisma/client'
import { prisma } from '../../db/client.js'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export interface ListQuery {
  sourceIds: string[]
  sourceType?: string
  edition?: string
  q?: string
  page: number
  limit: number
  skip: number
  fieldsName: boolean
  // `?fields=all` — every matching row, full fields, unbounded by
  // MAX_LIMIT (same no-skip/no-take shape as fieldsName's {id,name} mode,
  // just without the `select`). Powers the trading-card print sheet and
  // the Monster+Spellcasting packet's spell-name matching, both of which
  // need "every row matching these filters," not one page of them.
  fieldsAll: boolean
}

// Shared across every content type per outline.md §3.1: ?source=, ?q=,
// ?page=/?limit= (envelope pagination), and ?fields=name (lightweight
// {id,name}[] mode powering Phase 5's position-bar name index).
//
// ?source= accepts multiple values (repeated: ?source=a&source=b — Express's
// default qs parser already arrays these) — Phase 5's SourceMultiSelect
// needs "any of these N sources", not just one. A single value still works
// (normalized to a 1-element array), so this is backwards compatible with
// Phase 3/4's existing single-source usage.
export function parseListQuery(req: Request): ListQuery {
  const query = req.query as Record<string, string | string[] | undefined>

  const rawPage = Number.parseInt((query.page as string | undefined) ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

  const rawLimit = Number.parseInt((query.limit as string | undefined) ?? String(DEFAULT_LIMIT), 10)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT

  const source = query.source
  const sourceIds = Array.isArray(source) ? source : source ? [source] : []

  const sourceType = (query.sourceType as string | undefined) || undefined
  const edition = (query.edition as string | undefined) || undefined

  return {
    sourceIds,
    sourceType,
    edition,
    q: (query.q as string | undefined) || undefined,
    page,
    limit,
    skip: (page - 1) * limit,
    fieldsName: query.fields === 'name',
    fieldsAll: query.fields === 'all',
  }
}

// Shared `sourceId` where-fragment: filters to any of the given ids, or no
// filter at all when the list is empty (SourceMultiSelect's "all checked"
// default omits ?source= entirely rather than listing every id).
export function sourceWhere(
  sourceIds: string[],
  sourceType?: string,
  edition?: string,
) {
  return {
    ...(sourceIds.length > 0 ? { sourceId: { in: sourceIds } } : {}),
    ...(sourceType ? { source: { is: { type: sourceType as SourceType } } } : {}),
    ...(edition ? { edition } : {}),
  }
}

export function envelope<T>(data: T[], total: number, page: number, limit: number) {
  return { data, total, page, limit }
}

// SQLite has no native JSON column, so every "JSON" field in schema.prisma is
// stored as a plain String — parse the listed fields back into real
// objects/arrays before a record leaves the API. Nullable JSON fields stay
// null rather than throwing.
export function parseJsonFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly string[],
): T {
  const result: Record<string, unknown> = { ...record }
  for (const field of fields) {
    const value = result[field]
    if (typeof value === 'string') {
      result[field] = JSON.parse(value)
    }
  }
  return result as T
}

// Inverse of parseJsonFields — stringify listed fields before a write hits
// Prisma. Leaves null/undefined alone (already the correct on-disk shape for
// a nullable JSON column). Returns a loosened Record rather than T: the
// caller's Zod-validated input type (e.g. classes: string[]) no longer
// matches the now-stringified runtime shape, so callers cast the result to
// the relevant Prisma Create/UpdateInput at the call site.
export function serializeJsonFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...record }
  for (const field of fields) {
    const value = result[field]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      result[field] = JSON.stringify(value)
    }
  }
  return result
}

// PATCH's Correctable Fields check (Phase 4 §4): true only when every key
// present in changedFields both belongs to and validates against the
// type's Correctable subset schema.
export function isFullyCorrectable(
  changedFields: Record<string, unknown>,
  correctableSchema: z.ZodTypeAny,
): boolean {
  return correctableSchema.safeParse(changedFields).success
}

// Splits a content type's cross-source dependents (Subclass/ClassOption for
// a Class; Subrace/subspecies-Race for a Race) by their own source's type —
// non-MANUAL dependents are replaceable (deleted alongside the parent; they
// reappear on that source's next refresh), MANUAL dependents are
// irreplaceable user work (SetNull'd, kept as orphans). Phase 4 §1.7.
export function classifyDependents<T extends { source: { type: string } }>(
  rows: T[],
): { willDelete: T[]; willOrphan: T[] } {
  return {
    willDelete: rows.filter((r) => r.source.type !== 'MANUAL'),
    willOrphan: rows.filter((r) => r.source.type === 'MANUAL'),
  }
}

export interface DependentEntry {
  type: string
  id: string
  name: string
}

// Tags a classified dependent list with its table name, e.g. "subclass" /
// "classOption" — used by Class/Race's dependent-aware DELETE (Phase 4 §1.7)
// to build the combined willDelete/willOrphan lists in the 409 response.
export function toDependentEntries<T extends { id: string; name: string }>(
  type: string,
  rows: T[],
): DependentEntry[] {
  return rows.map((r) => ({ type, id: r.id, name: r.name }))
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    fields[issue.path.join('.') || '(root)'] = issue.message
  }
  return fields
}

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// POST's sourceId and PATCH saveAs:"homebrew"'s target both need a
// MANUAL-type destination Source. Returns null if the id doesn't resolve to
// one — caller maps that to 400 SOURCE_NOT_MANUAL.
export async function resolveManualSource(sourceId: string): Promise<{ id: string } | null> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (!source || source.type !== 'MANUAL') return null
  return { id: source.id }
}
