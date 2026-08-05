export function toJsonString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}
