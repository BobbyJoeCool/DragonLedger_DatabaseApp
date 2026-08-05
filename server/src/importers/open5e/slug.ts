// Open5e keys are prefixed with their document key, e.g. "srd-2024_fireball".
// This app's `slug` is per-source (sourceId already identifies the
// document), so the prefix is redundant and stripped for a cleaner id.
export function slugFromKey(key: string, documentKey: string): string {
  const prefix = `${documentKey}_`
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}
