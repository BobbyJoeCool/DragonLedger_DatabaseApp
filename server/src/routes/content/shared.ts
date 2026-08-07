import type { Request } from 'express'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export interface ListQuery {
  source?: string
  q?: string
  page: number
  limit: number
  skip: number
  fieldsName: boolean
}

// Shared across every content type per outline.md §3.1: ?source=, ?q=,
// ?page=/?limit= (envelope pagination), and ?fields=name (lightweight
// {id,name}[] mode powering Phase 5's position-bar name index).
export function parseListQuery(req: Request): ListQuery {
  const query = req.query as Record<string, string | undefined>

  const rawPage = Number.parseInt(query.page ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

  const rawLimit = Number.parseInt(query.limit ?? String(DEFAULT_LIMIT), 10)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT

  return {
    source: query.source || undefined,
    q: query.q || undefined,
    page,
    limit,
    skip: (page - 1) * limit,
    fieldsName: query.fields === 'name',
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
