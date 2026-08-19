import type { Prisma } from '@prisma/client'
import { SpellSchema } from '@dragonledger/content-types'
import { scalingTriggerForSpellLevel, type SpellScalingEntry } from '../shared/spellScaling.js'
import { toJsonString } from '../utils/json.js'
import { slugFromKey } from './slug.js'
import type { Open5eCastingOption, Open5eSpell } from './types.js'

function composeComponents(raw: Open5eSpell): string {
  const parts: string[] = []
  if (raw.verbal) parts.push('V')
  if (raw.somatic) parts.push('S')
  if (raw.material) parts.push('M')
  return parts.join(', ')
}

// A `casting_options[]` with exactly one entry that carries no real data
// beyond the default is a no-op — only keep the array when a later entry
// (an alternate slot/ritual mode with its own range/duration/damage) adds
// something the default doesn't already say.
function meaningfulCastingOptions(options: Open5eCastingOption[]): Open5eCastingOption[] | null {
  if (options.length === 0) return null
  if (options.length === 1) {
    const only = options[0] as unknown as Record<string, unknown>
    const hasRealData = Object.entries(only).some(
      ([key, value]) => key !== 'type' && value !== null,
    )
    if (!hasRealData) return null
  }
  return options
}

// Phase 2.6: unify into extraData.scaling, dropping the non-damage upcast
// fields (duration/range/concentration/shape_size) — every sample checked
// has these as null, so they're not carried forward unused (see
// schema-expansion-design-handoff.md §1.2). `type`'s trailing `_N` is the
// trigger value regardless of whether the prefix is `player_level_` or
// `slot_level_` — the trigger *kind* itself comes from the spell's own
// level, not this string.
function toScalingEntries(
  options: Open5eCastingOption[],
  spellLevel: number,
): SpellScalingEntry[] | null {
  const meaningful = meaningfulCastingOptions(options)
  if (!meaningful) return null

  const trigger = scalingTriggerForSpellLevel(spellLevel)
  const entries = meaningful
    .filter((o) => o.damage_roll)
    .map((o): SpellScalingEntry => {
      const match = o.type.match(/_(\d+)$/)
      return {
        trigger,
        triggerValue: match ? Number(match[1]) : null,
        dice: o.damage_roll as string,
        description: o.desc,
      }
    })
  return entries.length > 0 ? entries : null
}

export function transformSpell(
  raw: Open5eSpell,
  sourceId: string,
  edition: string,
): Prisma.ContentSpellCreateManyInput {
  const documentKey = raw.document.key

  const extraData: Record<string, unknown> = {}
  const scaling = toScalingEntries(raw.casting_options, raw.level)
  if (scaling) extraData.scaling = scaling
  if (raw.damage_roll) extraData.damageRoll = raw.damage_roll
  if (raw.damage_types.length > 0) extraData.damageTypes = raw.damage_types
  if (raw.saving_throw_ability) extraData.savingThrow = raw.saving_throw_ability
  if (raw.attack_roll) extraData.attackRoll = raw.attack_roll
  if (raw.target_type) extraData.targetType = raw.target_type
  if (raw.target_count !== null) extraData.targetCount = raw.target_count
  if (raw.shape_type) extraData.shapeType = raw.shape_type
  if (raw.shape_size !== null) extraData.shapeSize = raw.shape_size
  if (raw.shape_size_unit) extraData.shapeSizeUnit = raw.shape_size_unit
  if (raw.reaction_condition) extraData.reactionCondition = raw.reaction_condition
  if (raw.material_cost) extraData.materialCost = raw.material_cost
  if (raw.material_consumed) extraData.materialConsumed = raw.material_consumed

  const logical = SpellSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    level: raw.level,
    school: raw.school.key,
    castingTime: raw.casting_time,
    range: raw.range_text,
    components: composeComponents(raw),
    material: raw.material_specified,
    duration: raw.duration,
    concentration: raw.concentration,
    ritual: raw.ritual,
    classes: raw.classes.map((c) => c.name),
    description: raw.desc,
    higherLevels: raw.higher_level,
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    edition,
    level: logical.level,
    school: logical.school,
    castingTime: logical.castingTime,
    range: logical.range,
    components: logical.components,
    material: logical.material ?? null,
    duration: logical.duration,
    concentration: logical.concentration,
    ritual: logical.ritual,
    classes: toJsonString(logical.classes) as string,
    description: logical.description,
    higherLevels: logical.higherLevels ?? null,
    extraData: toJsonString(logical.extraData),
  }
}
