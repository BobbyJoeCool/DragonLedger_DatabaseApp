import { useQuery } from '@tanstack/react-query'
import type { Spell } from '@dragonledger/content-types'
import { apiFetch } from '@/api/client'
import { useSources } from './useSources'

export type SpellIndexEntry = Spell & { id: string; sourceId: string }
export type SpellNameIndex = Map<string, SpellIndexEntry>

// Default source-priority ranking (§4 dependency 1 of the card-theming
// handoff doc): Open5e (Source.type API) ranked above Compendium (FILE)
// above homebrew (MANUAL) when the same spell name exists in more than
// one source. Lower number = higher priority.
const SOURCE_PRIORITY: Record<string, number> = { API: 0, FILE: 1, MANUAL: 2 }

/**
 * Every Spell in the library, deduped by name (case-insensitive) via the
 * source-priority ranking above — powers the Monster+Spellcasting
 * packet's appendix, which needs to match a monster's stored spell names
 * (plain strings) against real ContentSpell records (§4 dependency 4).
 * Homebrew is exempt from the dedupe conceptually (per the decision log),
 * but this index only needs one representative match per name for
 * display purposes, not a full duplicate-listing UI — the source-priority
 * settings surface itself stays out of scope for this phase.
 */
export function useSpellNameIndex() {
  const { data: sources } = useSources()

  return useQuery({
    queryKey: ['spell-name-index'],
    enabled: sources !== undefined,
    queryFn: async (): Promise<SpellNameIndex> => {
      const res = await apiFetch('/api/spells?fields=all')
      if (!res.ok) throw new Error('Failed to load spell index')
      const spells = (await res.json()) as SpellIndexEntry[]
      const sourceType = new Map((sources ?? []).map((s) => [s.id, s.type]))

      const byName = new Map<string, SpellIndexEntry[]>()
      for (const spell of spells) {
        const key = spell.name.trim().toLowerCase()
        const list = byName.get(key) ?? []
        list.push(spell)
        byName.set(key, list)
      }

      const resolved: SpellNameIndex = new Map()
      for (const [key, candidates] of byName) {
        const best = [...candidates].sort((a, b) => {
          const pa = SOURCE_PRIORITY[sourceType.get(a.sourceId) ?? 'MANUAL'] ?? 2
          const pb = SOURCE_PRIORITY[sourceType.get(b.sourceId) ?? 'MANUAL'] ?? 2
          return pa - pb
        })[0]
        resolved.set(key, best)
      }
      return resolved
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function resolveSpellName(index: SpellNameIndex | undefined, name: string): SpellIndexEntry | null {
  if (!index) return null
  return index.get(name.trim().toLowerCase()) ?? null
}
