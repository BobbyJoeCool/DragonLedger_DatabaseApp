import type { Prisma } from '@prisma/client'
import { ItemSchema } from '@dragonledger/content-types'
import { toJsonString } from '../utils/json.js'
import { slugFromKey } from './slug.js'
import type { Open5eItem, Open5eMagicItem, Open5eWeaponProperty } from './types.js'

// Real live data correction: a weapon property's name lives at
// `properties[].property.name`, not `properties[].name` directly as the
// original design doc assumed.
function mapProperties(props: Open5eWeaponProperty[]): { name: string; detail?: string | null }[] {
  return props.map((p) => ({ name: p.property.name, detail: p.detail ?? undefined }))
}

interface WeaponFields {
  damage: string | null
  properties: { name: string; detail?: string | null }[] | null
  extraData: Record<string, unknown>
}

function composeWeaponFields(item: Open5eItem): WeaponFields {
  const w = item.weapon
  if (!w) return { damage: null, properties: null, extraData: {} }

  const damage = w.damage_dice
    ? `${w.damage_dice}${w.damage_type ? ` ${w.damage_type.key}` : ''}`
    : null
  const properties = w.properties.length > 0 ? mapProperties(w.properties) : null

  const extraData: Record<string, unknown> = {
    isSimple: w.is_simple,
    isMartial: w.is_martial,
    isImprovised: w.is_improvised,
  }
  // The embedded weapon object frequently doesn't carry range at all
  // (verified live) — only include it when actually present and non-zero.
  if (w.range && w.long_range) {
    extraData.range = `${w.range}/${w.long_range} ft.`
  }

  return { damage, properties, extraData }
}

interface ArmorFields {
  armorClass: string | null
  itemType: string | null
  extraData: Record<string, unknown>
}

function composeArmorFields(item: Open5eItem): ArmorFields {
  const a = item.armor
  if (!a) return { armorClass: null, itemType: null, extraData: {} }

  return {
    armorClass: String(a.ac_base),
    itemType: a.category,
    extraData: {
      stealthDisadvantage: a.grants_stealth_disadvantage,
      maxDexBonus: a.ac_cap_dexmod,
      addDexMod: a.ac_add_dexmod,
      strRequired: a.strength_score_required,
      acDisplay: a.ac_display,
    },
  }
}

interface MagicItemFields {
  rarity: string | null
  requiresAttunement: boolean
  attunementDetail: string | null
}

function buildItem(
  raw: Open5eItem,
  sourceId: string,
  edition: string,
  magic: MagicItemFields | null,
): Prisma.ContentItemCreateManyInput {
  const documentKey = raw.document.key
  const weaponFields = composeWeaponFields(raw)
  const armorFields = composeArmorFields(raw)

  const extraData: Record<string, unknown> = { ...weaponFields.extraData, ...armorFields.extraData }
  if (raw.size) extraData.size = raw.size.key
  if (magic?.attunementDetail) extraData.attunementDetail = magic.attunementDetail

  const logical = ItemSchema.parse({
    slug: slugFromKey(raw.key, documentKey),
    sourceId,
    name: raw.name,
    itemType: armorFields.itemType ?? raw.category.key,
    rarity: magic?.rarity ?? null,
    requiresAttunement: magic?.requiresAttunement ?? false,
    cost: raw.cost ? `${parseFloat(raw.cost)} gp` : null,
    weight: raw.weight ? String(parseFloat(raw.weight)) : null,
    damage: weaponFields.damage,
    armorClass: armorFields.armorClass,
    properties: weaponFields.properties,
    description: raw.desc || '',
    extraData: Object.keys(extraData).length > 0 ? extraData : null,
  })

  return {
    slug: logical.slug,
    sourceId: logical.sourceId,
    name: logical.name,
    edition,
    itemType: logical.itemType,
    rarity: logical.rarity ?? null,
    requiresAttunement: logical.requiresAttunement,
    cost: logical.cost ?? null,
    weight: logical.weight ?? null,
    damage: logical.damage ?? null,
    armorClass: logical.armorClass ?? null,
    properties: toJsonString(logical.properties),
    description: logical.description,
    extraData: toJsonString(logical.extraData),
  }
}

export function transformItem(
  raw: Open5eItem,
  sourceId: string,
  edition: string,
): Prisma.ContentItemCreateManyInput {
  return buildItem(raw, sourceId, edition, null)
}

export function transformMagicItem(
  raw: Open5eMagicItem,
  sourceId: string,
  edition: string,
): Prisma.ContentItemCreateManyInput {
  return buildItem(raw, sourceId, edition, {
    rarity: raw.rarity?.key ?? null,
    requiresAttunement: raw.requires_attunement,
    attunementDetail: raw.attunement_detail,
  })
}
