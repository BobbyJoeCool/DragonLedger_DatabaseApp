// Minimal typings for the Open5e v2 API — only the fields this app's
// transforms actually read. Field shapes verified against live API
// responses (see server/src/__tests__/fixtures/open5e/) rather than taken
// from documentation alone; several diverge from what the original design
// doc assumed (see DevTools/Claude/phase-2.md for the corrections list).

export interface Open5eDocument {
  key: string
  name: string
}

export interface Open5eKeyName {
  key: string
  name: string
}

export interface Open5eSpell {
  key: string
  name: string
  level: number
  school: Open5eKeyName
  casting_time: string
  range_text: string
  duration: string
  concentration: boolean
  ritual: boolean
  desc: string
  higher_level: string | null
  verbal: boolean
  somatic: boolean
  material: boolean
  material_specified: string | null
  classes: Open5eKeyName[]
  document: Open5eDocument
  casting_options: unknown[]
  damage_roll: string | null
  damage_types: string[]
  saving_throw_ability: string | null
  attack_roll: boolean
  target_type: string | null
  target_count: number | null
  shape_type: string | null
  shape_size: number | null
  shape_size_unit: string | null
  reaction_condition: string | null
  material_cost: string | null
  material_consumed: boolean
}

export interface Open5eConditionDescription {
  desc: string
  document: string
  gamesystem: string
}

export interface Open5eCondition {
  key: string
  name: string
  descriptions: Open5eConditionDescription[]
  document: Open5eDocument
  icon: unknown | null
}

export interface Open5eTrait {
  name: string
  desc: string
  type: string | null
  order: number | null
}

export interface Open5eSpecies {
  key: string
  name: string
  desc: string
  document: Open5eDocument
  is_subspecies: boolean
  subspecies_of: string | null
  traits: Open5eTrait[]
}

export interface Open5eGainedAt {
  level: number
  detail: string | null
}

export interface Open5eFeature {
  key: string
  name: string
  desc: string
  feature_type: string
  gained_at: Open5eGainedAt[]
  data_for_class_table: unknown[]
}

export interface Open5eHitPoints {
  hit_dice: string
  hit_dice_name: string
  hit_points_at_1st_level: string
  hit_points_at_higher_levels: string
}

export interface Open5eClass {
  key: string
  name: string
  desc: string
  document: Open5eDocument
  hit_dice: string | null
  hit_points: Open5eHitPoints | null
  primary_abilities: Open5eKeyName[]
  saving_throws: Open5eKeyName[]
  caster_type: 'NONE' | 'FULL' | 'HALF' | string
  subclass_of: Open5eKeyName | null
  features: Open5eFeature[]
}

export interface Open5eBenefit {
  name: string
  desc: string
  type: string
}

export interface Open5eBackground {
  key: string
  name: string
  desc: string
  document: Open5eDocument
  benefits: Open5eBenefit[]
}

export interface Open5eWeaponProperty {
  property: { name: string; type: string | null; desc: string }
  detail: string | null
}

export interface Open5eWeapon {
  name: string
  key: string
  damage_type: Open5eKeyName | null
  damage_dice: string | null
  properties: Open5eWeaponProperty[]
  is_simple: boolean
  is_martial: boolean
  is_improvised: boolean
  range?: number | null
  long_range?: number | null
}

export interface Open5eArmor {
  name: string
  key: string
  category: string
  ac_base: number
  ac_display: string
  ac_add_dexmod: boolean
  ac_cap_dexmod: number | null
  grants_stealth_disadvantage: boolean
  strength_score_required: number | null
}

export interface Open5eItem {
  key: string
  name: string
  desc: string
  document: Open5eDocument
  category: Open5eKeyName
  weight: string | null
  weight_unit: string | null
  cost: string | null
  size: Open5eKeyName | null
  weapon: Open5eWeapon | null
  armor: Open5eArmor | null
}

export interface Open5eMagicItem extends Open5eItem {
  rarity: { name: string; key: string; rank: number } | null
  requires_attunement: boolean
  attunement_detail: string | null
}

export interface Open5eAttack {
  to_hit_mod: number | null
  damage_die_count: number | null
  damage_die_type: string | null
  damage_bonus: number | null
  extra_damage_type: Open5eKeyName | null
}

export interface Open5eCreatureAction {
  name: string
  desc: string
  action_type:
    | 'ACTION'
    | 'BONUS_ACTION'
    | 'REACTION'
    | 'MYTHIC_ACTION'
    | 'LEGENDARY_ACTION'
    | 'LAIR_ACTION'
    | string
  attacks: Open5eAttack[]
}

export interface Open5eCreatureTrait {
  name: string
  desc: string
}

export interface Open5eResistancesAndImmunities {
  damage_resistances: Open5eKeyName[]
  damage_immunities: Open5eKeyName[]
  damage_vulnerabilities: Open5eKeyName[]
  condition_immunities: Open5eKeyName[]
}

export interface Open5eCreature {
  key: string
  name: string
  size: Open5eKeyName
  type: Open5eKeyName
  alignment: string
  armor_class: number
  armor_detail: string | null
  hit_points: number
  hit_dice: string
  challenge_rating: number
  speed_all: Record<string, unknown>
  ability_scores: Record<string, number>
  saving_throws: Record<string, number> | null
  skill_bonuses: Record<string, number> | null
  resistances_and_immunities: Open5eResistancesAndImmunities
  darkvision_range: number | null
  blindsight_range: number | null
  tremorsense_range: number | null
  truesight_range: number | null
  normal_sight_range?: number | null
  passive_perception: number | null
  languages: { as_string: string } | null
  category: string | null
  subcategory: string | null
  experience_points: number | null
  proficiency_bonus: number | null
  document: Open5eDocument
  description?: string | null
  actions: Open5eCreatureAction[]
  traits: Open5eCreatureTrait[]
}
