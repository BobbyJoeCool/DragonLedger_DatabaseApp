// Shared between both Spell importers — Phase 2.6 unified Open5e's
// `extraData.castingOptions` and Compendium's `extraData.scalingDice` into
// one `extraData.scaling` shape, since both encode the same real-world fact
// (how a spell's effect grows) and a downstream consumer (damage
// calculation) needs to query it the same way regardless of source.
//
// `trigger` is decided from the existing `ContentSpell.level` column, not
// guessed per entry: `level === 0` means a cantrip scaling with character
// level; anything else means upcasting with a spell slot level. This
// resolves a real ambiguity found during design — Compendium's
// `<roll level="N">` means different things depending on what's attached to
// it, and Open5e's `casting_options[].type` uses two different prefixes for
// the same reason (`player_level_N` for cantrips, `slot_level_N` for
// upcasting) — the spell-level column disambiguates both cleanly.
export interface SpellScalingEntry {
  trigger: 'slot_level' | 'character_level'
  triggerValue: number | null
  dice: string
  description: string | null
}

export function scalingTriggerForSpellLevel(level: number): 'slot_level' | 'character_level' {
  return level === 0 ? 'character_level' : 'slot_level'
}
