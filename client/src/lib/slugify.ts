// Mirrors server/src/utils/slugify.ts exactly — a create-form needs to
// send a slug in the POST body (ContentSpell.slug is required, not
// server-generated), so this stays in sync rather than being imported
// across the client/server boundary.
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
