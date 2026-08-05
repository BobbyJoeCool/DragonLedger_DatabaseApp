// Raw shapes for `Complete_Compendium_5.5e.xml`, as produced by fast-xml-parser
// with the config in xmlParser.ts. Verified against the real file (see
// DevTools/Claude/phase-2.5.md) — several diverge from what the design docs
// assumed, since those were checked against only one or two sample files.

export interface CompendiumTrait {
  name: string
  text: string | number
  recharge?: string
  '@_category'?: string
}

export interface CompendiumAttack {
  // Always a string in the raw XML; normalized to an array in transforms
  // since a single action can carry multiple pipe-delimited attack lines
  // (one combined summary + per-damage-type breakdowns).
}

export interface CompendiumAction {
  name: string
  text: string
  attack?: string | string[]
  recharge?: string
  '@_category'?: string
}

export interface CompendiumMonster {
  name: string
  sortname?: string
  ancestry?: string
  size: string
  type: string
  alignment: string
  ac: number | string
  hp: string
  speed: string
  init?: number
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  save?: string
  skill?: string
  passive?: number
  languages?: string
  cr: number | string
  vulnerable?: string
  resist?: string
  immune?: string
  conditionImmune?: string
  senses?: string
  trait?: CompendiumTrait[]
  action?: CompendiumAction[]
  legendary?: CompendiumAction[]
  spells?: string
  description: string
  environment?: string
}

// Real shape: the dice expression is the element's own text content, with
// description/level as attributes — not nested child elements as first
// assumed (see DevTools/Claude/phase-2.5.md). fast-xml-parser collapses to
// a bare string when a <roll> has no attributes at all.
export type CompendiumSpellRoll =
  | string
  | {
      '#text'?: string
      '@_description'?: string
      '@_level'?: number | string
    }

export interface CompendiumSpell {
  name: string
  level: number
  school: string
  classes?: string
  time: string
  range: string
  components: string
  duration: string
  ritual?: unknown
  text: string
  roll?: CompendiumSpellRoll[]
}

export interface CompendiumFeatModifier {
  text?: string
  '@_category'?: string
}

export interface CompendiumFeat {
  name: string
  prerequisite?: string
  text: string
  modifier?: CompendiumFeatModifier[]
  special?: string
}

export interface CompendiumItemProperty {
  // properties come through as a single comma-joined string in <property>,
  // not repeated elements — see items.ts for the real parse.
}

export interface CompendiumItem {
  name: string
  type: string
  magic?: string
  detail?: string
  text: string
  weight?: string | number
  value?: string | number
  dmg1?: string
  dmg2?: string
  dmgType?: string
  range?: string
  property?: string
  ac?: string | number
  strength?: string
  stealth?: string
}

export interface CompendiumBackgroundTrait {
  name: string
  text: string
}

export interface CompendiumBackground {
  name: string
  proficiency?: string
  trait?: CompendiumBackgroundTrait[]
}

export interface CompendiumAutolevelFeature {
  name: string
  text: string
}

export interface CompendiumAutolevel {
  '@_level': string | number
  feature?: CompendiumAutolevelFeature[]
  slots?: string
}

export interface CompendiumClassTrait {
  name: string
  text: string
}

export interface CompendiumClass {
  name: string
  hd: number | string
  proficiency?: string
  numSkills?: number | string
  armor?: string
  weapons?: string
  tools?: string
  spellAbility?: string
  slotsReset?: string
  trait?: CompendiumClassTrait[]
  autolevel?: CompendiumAutolevel[]
}

export interface CompendiumRaceTrait {
  name: string
  text: string
}

export interface CompendiumRace {
  name: string
  size?: string
  speed?: string | number
  speedOther?: string
  ability?: string
  resist?: string
  vulnerable?: string
  conditionResist?: string
  conditionImmune?: string
  proficiency?: string
  weapons?: string
  tools?: string
  languages?: string
  trait?: CompendiumRaceTrait[]
}

export interface CompendiumDocument {
  compendium: {
    class?: CompendiumClass[]
    race?: CompendiumRace[]
    spell?: CompendiumSpell[]
    item?: CompendiumItem[]
    feat?: CompendiumFeat[]
    background?: CompendiumBackground[]
    monster?: CompendiumMonster[]
  }
}
