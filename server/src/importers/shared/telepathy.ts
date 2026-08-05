// Shared between both importers — verified against real data (Aboleth,
// Open5e) that structured language arrays omit telepathy entirely; it only
// ever shows up in free language text as a "telepathy X ft." phrase.
export function extractTelepathyRange(text: string | null | undefined): number | null {
  if (!text) return null
  const match = text.match(/telepathy\s+(\d+)\s*ft/i)
  return match ? Number(match[1]) : null
}
