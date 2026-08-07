# DragonLedger — Schema + Real Data Examples (Card Design Reference)

**Purpose:** companion to `Documentation/card-design-spec.md` (which lists
fields but deliberately omits worked examples). This document pairs every
model with 2–3 **real rows pulled live from `prisma/dev.db`** so the card
design chat can see actual shapes, actual messiness, and actual edge cases —
not idealized data — when deciding what's easy to lay out vs. what needs a
schema change.

**Compiled:** 2026-08-06, directly from `prisma/schema.prisma` and
`sqlite3 prisma/dev.db`. This reflects the schema **after** Phase 2.6
(extraData → columns unification) — it is more current than
`Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`, whose worked
examples predate that phase. `card-design-spec.md`'s field notes are current
except where flagged below (§Class).

**Row counts** (live db, for scale/sparsity context):

| Model | Rows |
|---|---|
| Source | 1,265 |
| ContentSpell | 1,343 |
| ContentClass | 37 |
| ContentSubclass | 382 |
| ContentClassFeature | 2,881 |
| ContentRace | 140 |
| ContentSubrace | 166 |
| ContentBackground | 227 |
| ContentCondition | **0** |
| ContentItem | 6,927 |
| ContentMonster | 5,178 |
| ContentFeat | 580 |
| ContentClassOption | 126 |
| Language | 22 |
| ImportJob | 5 |

---

## Source

| Field | Type | Notes |
|---|---|---|
| id | String (PK) | slug-style, e.g. `"open5e-srd-2024"` |
| name | String | display name |
| type | `API \| FILE \| MANUAL` | |
| description | String? | |
| lastUpdated | DateTime | |
| isDeletable | Boolean | |

**By type:** 1 `API` (Open5e), 1263 `FILE` (Compendium, one per imported
book/module), 1 `MANUAL` (a single seeded "Homebrew" bucket, currently
**empty** — 0 content rows reference it yet).

**Examples:**

```json
{ "id": "open5e-srd-2024", "name": "Open5e SRD 2024", "type": "API",
  "description": null, "isDeletable": true }

{ "id": "compendium-player-s-handbook-2024",
  "name": "Player's Handbook (2024)", "type": "FILE",
  "description": null, "isDeletable": true }

{ "id": "homebrew", "name": "Homebrew", "type": "MANUAL",
  "description": "User-created content not tied to an external source.",
  "isDeletable": false }
```

**Card-design note — source id/name can be very long and ugly.** Some
Compendium sources were auto-named from garbled source-file metadata. The
longest `id` in the live db is 279 characters:

> `compendium-heliana-s-guide-to-monster-hunting-part-one-p-194-what-prompted-you-to-begin-taming-creatures-loneliness-a-need-to-transport-your-favorite-dragonling-through-customs-a-pathological-desire-to-catch-em-all-the-bond-tamers-experience-with-their-companions-are-incredibly-intimate-both-are-privy-to-the-other-s-innermost-thoughts-however`

If a card shows a "source" badge/footer, it needs to handle this gracefully
(truncate + tooltip, wrap, or a display-name fallback) — a fixed-width badge
will break on rows like this.

---

## ContentSpell

| Field | Type | Notes |
|---|---|---|
| name, level, school, castingTime, range, components, duration | — | plain scalars |
| material | String? | null on non-material spells |
| concentration, ritual | Boolean | |
| classes | JSON array | display names |
| description | String | full text |
| higherLevels | String? | empty string (not null) when absent |
| extraData | JSON? | `scaling[]`, `damageRoll`, `damageTypes[]`, `savingThrow`, `targetType`/`targetCount`, `shapeType`/`shapeSize`/`shapeSizeUnit` |

**Examples:**

**1. Fireball** (typical attack spell — the shape most damage-spell cards will hit)
```json
{
  "name": "Fireball", "level": 3, "school": "evocation",
  "castingTime": "action", "range": "150 feet", "components": "V, S, M",
  "material": "a ball of bat guano and sulfur", "duration": "instantaneous",
  "concentration": false, "ritual": false,
  "classes": ["Sorcerer", "Wizard"],
  "description": "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one. […]",
  "higherLevels": "The damage increases by 1d6 for each spell slot level above 3.",
  "extraData": {
    "scaling": [
      { "trigger": "slot_level", "triggerValue": 4, "dice": "9d6", "description": null },
      { "trigger": "slot_level", "triggerValue": 9, "dice": "14d6", "description": null }
    ],
    "damageRoll": "8d6", "damageTypes": ["fire"], "savingThrow": "dexterity",
    "targetType": "creature", "targetCount": 1,
    "shapeType": "sphere", "shapeSize": 20, "shapeSizeUnit": "feet"
  }
}
```

**2. Guidance** (minimal cantrip — shows how sparse a card *can* be)
```json
{
  "name": "Guidance", "level": 0, "school": "divination",
  "castingTime": "action", "range": "Touch", "components": "V, S",
  "material": "", "duration": "1 minute",
  "concentration": true, "ritual": false,
  "classes": ["Cleric", "Druid"],
  "description": "You touch a willing creature and choose a skill. Until the spell ends, the creature adds 1d4 to any ability check using the chosen skill.",
  "higherLevels": "",
  "extraData": { "damageRoll": "1d4", "targetType": "creature", "targetCount": 1, "shapeSizeUnit": "feet" }
}
```
Note `extraData` here has leftover keys (`damageRoll`, `shapeSizeUnit`) that
don't really apply to a buff spell — the transform pipeline populates these
generically; a card shouldn't assume every `extraData` key present is
meaningful for that spell's actual mechanics.

**3. Delayed Blast Fireball** (multi-stage scaling — the complex end of the range)
```json
{
  "name": "Delayed Blast Fireball", "level": 7,
  "higherLevels": "The base damage increases by 1d6 for each spell slot level above 7.",
  "extraData": {
    "scaling": [
      { "trigger": "slot_level", "triggerValue": 8, "dice": "13d6", "description": null },
      { "trigger": "slot_level", "triggerValue": 9, "dice": "14d6", "description": null }
    ],
    "damageRoll": "12d6", "damageTypes": ["fire"], "savingThrow": "dexterity",
    "shapeType": "sphere", "shapeSize": 20, "shapeSizeUnit": "feet"
  }
}
```
This one also has a secondary saving-throw mechanic embedded only in prose
(the "touching the glowing bead" trigger) — `extraData.scaling` doesn't
capture it. Any card design that wants to *structurally* render "what
happens if you touch the bead" as a separate block would need new schema;
right now that's description prose only.

---

## ContentClass

| Field | Type | Notes |
|---|---|---|
| name, hitDie | — | |
| primaryAbility | JSON | `{ abilities: string[], logic: "AND"\|"OR" }` |
| savingThrows, armorProfs, weaponProfs | JSON array | |
| skillChoices | JSON | Fixed/Choice Grant Shape |
| spellcastingAbility | String? | null for non-casters |
| description | String | **see note below** |
| extraData | JSON? | `casterType` (`FULL\|HALF\|NONE\|PACT`); Compendium rows add `edition`, `slotsReset`, `page` |
| *(relation)* features | ContentClassFeature[] | **not yet in `card-design-spec.md`** — see below |

**Correction to `card-design-spec.md` §5.2:** that doc's `extraData` note
still lists `features[]` as an `extraData` key. As of Phase 2.6, class
features live in the separate **`ContentClassFeature`** table (one row per
level, `classId` FK), not in `extraData`. That's actually better for card
design — features are queryable/sortable by level rather than buried in
JSON — but any card mockup should join `ContentClassFeature` by `classId`
rather than reading `extraData.features`.

**Examples:**

**1. Wizard — Open5e** (`open5e-srd-2024`)
```json
{
  "name": "Wizard", "hitDie": 6,
  "primaryAbility": { "abilities": ["INT"], "logic": "OR" },
  "savingThrows": ["Intelligence", "Wisdom"],
  "armorProfs": [], "weaponProfs": ["Simple weapons"],
  "spellcastingAbility": "INT",
  "description": "",
  "extraData": { "casterType": "FULL" }
}
```

**2. Wizard — Compendium** (`compendium-player-s-handbook-2024`)
```json
{
  "name": "Wizard", "hitDie": 6,
  "spellcastingAbility": "Intelligence",
  "description": "Wizards are defined by their exhaustive study of magic's inner workings. They cast spells of explosive fire, arcing lightning, subtle deception, and spectacular transformations. […]",
  "extraData": { "casterType": "FULL", "edition": "2024", "slotsReset": "L", "page": "165" }
}
```
**Card-design note — `description` is empty string on every Open5e-sourced
class** (all 12 checked, 12 empty). If a card's hero/flavor-text block reads
`ContentClass.description`, the Open5e-imported Wizard/Fighter/etc. cards
will show a blank where the Compendium PHB 2024 versions show three
paragraphs of flavor text. Not a bug — just a real gap between the two
import sources that the card layout needs to tolerate (e.g. hide the block
if empty, rather than reserving fixed vertical space for it).

**3. Fighter — Open5e** (non-caster contrast)
```json
{
  "name": "Fighter", "hitDie": 10,
  "primaryAbility": { "abilities": ["STR", "DEX"], "logic": "OR" },
  "savingThrows": ["Dexterity", "Strength"],
  "armorProfs": ["Light, Medium, and Heavy armor and Shields"],
  "weaponProfs": ["Simple and Martial weapons"],
  "spellcastingAbility": null,
  "extraData": { "casterType": "NONE" }
}
```

---

## ContentClassFeature *(not covered in `card-design-spec.md` — new since Phase 2.6)*

One row per **level** (Open5e's grouped `{levels:[4,8,12,16]}` entries are
exploded into 4 rows to match Compendium's native granularity). Belongs to
exactly one of `classId`/`subclassId` (enforced in the transform layer, not
by the DB).

| Field | Type | Notes |
|---|---|---|
| classId / subclassId | String? (FK, mutually exclusive) | |
| level | Int | |
| name, description | String | |
| type | String? | Open5e tag (e.g. `CLASS_LEVEL_FEATURE`); null on Compendium rows |

**Examples:**

**1. Class-level feature** — Barbarian, level 1
```json
{ "classId": "cmsglm41s...", "subclassId": null, "level": 1,
  "name": "Rage", "type": "CLASS_LEVEL_FEATURE",
  "description": "You can imbue yourself with a primal power called Rage […] While active, your Rage follows the rules below. Damage Resistance. […] Rage Damage. […] Strength Advantage. […]" }
```

**2. Same class, higher level** — Barbarian, level 15
```json
{ "classId": "cmsglm41s...", "level": 15, "name": "Persistent Rage",
  "type": "CLASS_LEVEL_FEATURE",
  "description": "When you roll Initiative, you can regain all expended uses of Rage. […]" }
```

**3. Subclass-level feature** — Champion, level 7
```json
{ "classId": null, "subclassId": "cmsglm41u...", "level": 7,
  "name": "Additional Fighting Style", "type": "CLASS_LEVEL_FEATURE",
  "description": "You gain another Fighting Style feat of your choice." }
```

**Card-design note:** since this is a real table (not JSON), a Class card
can trivially render a sorted "Features by Level" list via
`SELECT * FROM ContentClassFeature WHERE classId = ? ORDER BY level` — no
schema work needed for that. Barbarian alone has 13 feature rows across
levels 1–20; expect this list to be long on full-caster/full-martial
classes and worth collapsing or paginating on a printable card.

---

## ContentSubclass *(reached from a Class card)*

| Field | Type | Notes |
|---|---|---|
| classId | String? | nullable FK, `onDelete: SetNull` |
| name, description | String | |
| extraData | JSON? | `unresolvedClassName` only when Compendium cross-source resolution failed |

**Examples:**

**1. Champion — Open5e**
```json
{ "name": "Champion", "classId": "<Fighter id>",
  "description": "Pursue Physical Excellence in Combat\n\nA Champion focuses on the development of martial prowess […]",
  "extraData": null }
```

**2. Champion — Compendium PHB 2024** (same subclass, different source)
```json
{ "name": "Champion", "classId": "<Fighter id>",
  "description": "Pursue Physical Excellence in Combat\n\nA Champion focuses on the development of martial prowess […]",
  "extraData": { "page": "96" } }
```
The two sources produce near-duplicate rows (same subclass, same class,
different `sourceId`) — expected given each `Source` is independently
imported. A card design that lists "subclasses of this class" should
decide how to handle same-name duplicates across sources (show both? dedupe
by name? show source badge on each?) — this is a real, common case, not a
rare edge.

---

## ContentRace

| Field | Type | Notes |
|---|---|---|
| size | JSON array | e.g. `["medium"]` |
| speed | JSON | `{ walk, fly?, swim? }` |
| traits | JSON array | `{ name, description, level, grant? }[]` |
| description | String | |
| extraData | JSON? | |
| parentRaceId | String? (self-FK) | only for real 2014-style "subspecies" — separate from the Subrace table |

**Examples:**

**1. Elf — Open5e SRD 2024** (concise, 4 traits)
```json
{
  "name": "Elf", "size": ["medium"], "speed": { "walk": 30 },
  "traits": [
    { "name": "Darkvision", "description": "You have Darkvision with a range of 60 feet.", "level": 1 },
    { "name": "Fey Ancestry", "description": "You have Advantage on saving throws you make to avoid or end the Charmed condition.", "level": 1 },
    { "name": "Keen Senses", "description": "You have proficiency in the Insight, Perception, or Survival skill.", "level": 1 },
    { "name": "Trance", "description": "You don't need to sleep, and magic can't put you to sleep. […]", "level": 1 }
  ],
  "description": "", "extraData": null
}
```

**2. Elf — Compendium "Plane Shift: Zendikar"** (11 traits, much denser)
```json
{
  "name": "Elf", "size": ["medium"], "speed": { "walk": 35 },
  "traits": [
    { "name": "Ability Score Increase", "description": "Wis +2, Dex +1", "level": 1 },
    { "name": "Weapon Proficiencies", "description": "Longsword, Shortsword, Shortbow, Longbow", "level": 1 },
    { "name": "Age", "description": "…", "level": 1 },
    { "name": "Alignment", "description": "…", "level": 1 },
    { "name": "Size", "description": "…includes a height/weight dice-roll formula as prose…", "level": 1 },
    { "name": "Darkvision", "description": "…", "level": 1 },
    { "name": "Fleet of Foot", "description": "Your ground speed increases to 35 feet.", "level": 1 }
  ],
  "extraData": { "otherTags": ["Zendikar, Joraga Nation"], "page": "19",
                 "rawAbility": "Wis +2, Dex +1", "rawWeapons": "Longsword, Shortsword, Shortbow, Longbow" }
}
```
**Card-design note — trait count and shape vary wildly by source.** Open5e's
SRD Elf has 4 clean, modern-format traits. The same race imported from a
third-party Compendium module has 11 traits including one that duplicates
`speed`/`extraData` info as prose (e.g. "Fleet of Foot" restating
`speed.walk`, "Ability Score Increase" restating a `rawAbility` string not
otherwise structured). A trait-list card component needs to just render
whatever's in the array — it can't assume a fixed trait count or that
traits are non-redundant with other fields.

---

## ContentSubrace *(reached from a Race card)*

| Field | Type | Notes |
|---|---|---|
| raceId | String? (FK) | nullable, `onDelete: SetNull` |
| size, speed | JSON? | **null unless this subrace overrides the parent's** |
| traits | JSON array | this subrace's own traits, additive to parent |
| extraData | JSON? | `unresolvedRaceName` if parent resolution failed |

**Examples:**

**1. High Elf — Open5e** (clean parent link, no size/speed override)
```json
{ "name": "High Elf", "raceId": "<Elf id>", "description": null,
  "size": null, "speed": null,
  "traits": [
    { "name": "Level 1 Benefit", "description": "You know the Prestidigitation cantrip. […]", "level": 1 },
    { "name": "Level 3 Benefit", "description": "Detect Magic", "level": 3 },
    { "name": "Level 5 Benefit", "description": "Misty Step", "level": 5 }
  ],
  "extraData": null }
```

**2. High Elf Ancestry — Compendium (unresolved parent)**
```json
{ "name": "High Elf Ancestry", "raceId": null,
  "size": ["medium"], "speed": { "walk": 30 },
  "description": "Walking in two worlds but truly belonging to neither, half-elves combine […]",
  "extraData": { "page": "38", "unresolvedRaceName": "Half-Elf",
                 "rawAbility": "Cha +2", "descriptionStrippingSkipped": true } }
```
**Card-design note — orphaned subraces are real, not theoretical.** This
example has `raceId: null` with `extraData.unresolvedRaceName: "Half-Elf"` —
the import couldn't confidently match it to a parent Race row. A Subrace
card needs a fallback for "no parent" (show `unresolvedRaceName` as plain
text instead of a link) rather than assuming `raceId` always resolves.

---

## ContentBackground

| Field | Type | Notes |
|---|---|---|
| proficiencies | JSON | Fixed/Choice Grant Shape, entries tagged `category: "skill"\|"tool"` |
| abilityBonuses | JSON | Fixed/Choice Grant Shape (`fixed` is an object here, e.g. `{"WIS":1}`) |
| feature | JSON array | `[{ name, description }]` |
| extraData | JSON? | `equipment`, `grantedFeat`, languages, `unrecognizedBenefits[]` |

**Examples:**

**1. Acolyte**
```json
{
  "name": "Acolyte",
  "proficiencies": { "fixed": [
      { "name": "Insight", "category": "skill" },
      { "name": "Religion", "category": "skill" },
      { "name": "Calligrapher's Supplies", "category": "tool" }
    ], "choices": [] },
  "abilityBonuses": { "fixed": {}, "choices": [
      { "type": "distribute", "pool": 3, "among": ["INT","WIS","CHA"], "maxPerOption": 2 }
    ] },
  "feature": [],
  "extraData": {
    "equipment": "*Choose A or B:* (A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP",
    "grantedFeat": { "name": "Magic Initiate (Cleric)" }
  }
}
```

**2. Soldier**
```json
{
  "name": "Soldier",
  "proficiencies": { "fixed": [
      { "name": "Athletics", "category": "skill" }, { "name": "Intimidation", "category": "skill" }
    ], "choices": [
      { "type": "select", "count": 1, "from": [{ "name": "Gaming Set", "category": "tool" }], "amount": null }
    ] },
  "extraData": {
    "equipment": "*Choose A or B:* (A) Spear, Shortbow, 20 Arrows, Gaming Set (same as above), Healer's Kit, Quiver, Traveler's Clothes, 14 GP; or (B) 50 GP",
    "grantedFeat": { "name": "Savage Attacker" }
  }
}
```
Both real examples have `"feature": []` — the dedicated `feature` column is
empty on these 2024-style backgrounds because the "background feature" was
folded into `grantedFeat` (a full Feat, cross-referenced by name in
`extraData`) rather than an inline `{name, description}`. A card that reads
`feature[]` as *the* background feature will show nothing for these; the
actual granted benefit lives in `extraData.grantedFeat.name`, which isn't
even an FK — just a name string a card would need to look up against
`ContentFeat` itself to show details.

---

## ContentCondition — **currently empty (0 rows)**

| Field | Type | Notes |
|---|---|---|
| name, description | String | |
| effects | String? | per schema notes, usually null even when populated |
| extraData | JSON? | `descriptionSource`/`requestedSource`, `icon` |

No live examples exist to pull — the Condition import path was included in
the initial `open5e-srd-2024` job's `contentTypes` (`["CONDITION","SPELL",...]`)
but produced zero rows. **Worth confirming with the user before the card
design session treats Condition as "just like the other 7 types" — right
now there's nothing to design against, and it's unclear whether this is
expected (Open5e's condition endpoint returned nothing) or a pipeline gap.**

---

## ContentItem

| Field | Type | Notes |
|---|---|---|
| itemType | String | e.g. `"weapon"`, `"wondrous-item"` |
| rarity | String? | null for mundane gear |
| requiresAttunement | Boolean | |
| cost, weight | String? | free text, not numeric |
| damage, armorClass | String? | type-specific, both often null |
| properties | JSON array? | `{ name, detail? }[]` |
| extraData | JSON? | `size`, `isSimple`/`isMartial`/`isImprovised`, `stealthDisadvantage`, `maxDexBonus`, etc. |

**Examples:**

**1. Longsword** (mundane weapon)
```json
{ "name": "Longsword", "itemType": "weapon", "rarity": null,
  "requiresAttunement": false, "cost": "15 gp", "weight": "3", "damage": "1d8 slashing",
  "armorClass": null,
  "properties": [ { "name": "Sap" }, { "name": "Versatile", "detail": "1d10" } ],
  "extraData": { "isSimple": false, "isMartial": true, "isImprovised": false, "size": "tiny" } }
```

**2. Dancing Longsword** (magic weapon, same base stats + rarity/attunement layered on)
```json
{ "name": "Dancing Longsword", "itemType": "weapon", "rarity": "very-rare",
  "requiresAttunement": true, "damage": "1d8 slashing",
  "properties": [ { "name": "Sap" }, { "name": "Versatile", "detail": "1d10" } ],
  "description": "You can take a Bonus Action to toss this magic weapon into the air. […]" }
```

**3. Bag of Holding** (wondrous item — no damage/armorClass/properties at all)
```json
{ "name": "Bag of Holding", "itemType": "wondrous-item", "rarity": "uncommon",
  "requiresAttunement": false, "cost": "0 gp", "weight": "0",
  "damage": null, "armorClass": null, "properties": null,
  "description": "This bag has an interior space considerably larger than its outside dimensions […]",
  "extraData": { "size": "tiny" } }
```
**Card-design note:** `cost`/`weight` are free text, not numbers — "0 gp" on
plenty of magic items (cost wasn't tracked by the source), and weight is a
bare numeric string with no unit (`"3"`, not `"3 lb."` as
`card-design-spec.md` implies). A card showing weight needs to append the
unit itself; it isn't in the data. Item shape also varies a lot by
`itemType` — weapon fields (`damage`, `properties`) are populated and
`armorClass` is null; wondrous items have neither `damage` nor `properties`
nor `armorClass`. A single fixed-layout item card will have a lot of empty
rows depending on type — worth deciding whether the card layout branches by
`itemType` or just hides empty fields generically.

---

## ContentMonster

The widest type. 24 direct columns + `extraData`.

| Field | Type | Notes |
|---|---|---|
| armorClass, hitPoints | Int | |
| hitDice | String | e.g. `"6d6"` |
| speed | JSON | `{ unit, walk, fly, swim, climb, burrow, crawl, hover }` — **always includes all keys, zeroed if unused** |
| abilityScores | JSON | 6 raw scores |
| savingThrows, skills | JSON? | modifier maps, e.g. `{"stealth":6}` |
| damageResistances/Immunities/Vulnerabilities, conditionImmunities | JSON array? | `{ types[], nonmagical, bypassedBy }[]` |
| senses, languages | String? | plain display strings, not structured |
| challengeRating | String | handles fractions like `"1/8"` |
| experiencePoints | Int | computed at import from CR (Phase 2.6) |
| actions | JSON array | each tagged `actionType: "action"\|"bonus"\|"reaction"` |
| legendaryActions | JSON array? | |
| extraData | JSON? | `traits[]`, `spellcasting`, `proficiencyBonus`, `armorClassDetail`, `category` |

**Examples:**

**1. Goblin Boss** (CR 1 — typical low-tier statblock)
```json
{
  "name": "Goblin Boss", "size": "small", "monsterType": "fey", "alignment": "chaotic neutral",
  "armorClass": 17, "hitPoints": 21, "hitDice": "6d6",
  "speed": { "unit": "feet", "walk": 30, "crawl": 15, "hover": false, "fly": 0, "burrow": 0, "climb": 15, "swim": 15 },
  "abilityScores": { "strength": 10, "dexterity": 15, "constitution": 10, "intelligence": 10, "wisdom": 8, "charisma": 10 },
  "skills": { "stealth": 6 },
  "damageResistances": null, "damageImmunities": null,
  "senses": "darkvision 60 ft., passive Perception 9", "languages": "Common, Goblin",
  "challengeRating": "1", "experiencePoints": 200,
  "actions": [
    { "name": "Multiattack", "actionType": "action", "description": "The goblin makes two attacks, using Scimitar or Shortbow in any combination." },
    { "name": "Scimitar", "actionType": "action", "toHitMod": 4, "damage": "1d6+2 slashing", "description": "Melee Attack Roll: +4, reach 5 ft. […]" },
    { "name": "Nimble Escape", "actionType": "bonus", "description": "The goblin takes the Disengage or Hide action." },
    { "name": "Redirect Attack", "actionType": "reaction", "description": "Trigger: A creature the goblin can see makes an attack roll against it. […]" }
  ],
  "legendaryActions": null,
  "extraData": { "traits": [], "proficiencyBonus": 2, "legendaryResistances": 0, "armorClassDetail": "natural armor", "category": "Monsters" }
}
```

**2. Ancient Red Dragon** (CR 24 — the complex end: legendary actions + spellcasting + resistances)
```json
{
  "name": "Ancient Red Dragon", "size": "gargantuan", "monsterType": "dragon",
  "armorClass": 22, "hitPoints": 507, "hitDice": "26d20 + 234",
  "speed": { "unit": "feet", "walk": 40, "fly": 80, "climb": 40, "swim": 20, "burrow": 0, "crawl": 20, "hover": false },
  "damageImmunities": [ { "types": ["fire"], "nonmagical": false, "bypassedBy": null } ],
  "senses": "darkvision 120 ft., blindsight 60 ft., passive Perception 26",
  "challengeRating": "24", "experiencePoints": 62000,
  "actions": [
    { "name": "Fire Breath", "actionType": "action", "description": "Dexterity Saving Throw: DC 24, each creature in a 90-foot Cone. […]" },
    { "name": "Multiattack", "actionType": "action", "description": "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting […]" },
    { "name": "Spellcasting", "actionType": "action", "description": "The dragon casts one of the following spells […]" }
  ],
  "legendaryActions": [
    { "name": "Commanding Presence", "actionType": "action", "description": "The dragon uses Spellcasting to cast Command (level 2 version). […]" },
    { "name": "Pounce", "actionType": "action", "description": "The dragon moves up to half its Speed, and it makes one Rend attack." }
  ],
  "extraData": {
    "traits": [ { "name": "Legendary Resistance (4/Day, or 5/Day in Lair)", "description": "If the dragon fails a saving throw, it can choose to succeed instead." } ],
    "proficiencyBonus": 7,
    "spellcasting": { "ability": "Charisma", "saveDC": 23, "atWill": ["Command","Detect Magic","Scorching Ray"],
                       "limitedUse": [ { "frequency": "1/Day Each", "spells": ["Fireball","Scrying"] } ] },
    "category": "Monsters"
  }
}
```
**Card-design note — statblock complexity scales enormously by monster.**
Goblin Boss has 4 actions, no legendary actions, no traits, no spellcasting.
Ancient Red Dragon has 3 actions, 3 legendary actions, 1 trait, and a nested
`extraData.spellcasting` block with its own at-will/limited-use lists. A
Monster card can't use one fixed layout — legendary-action and spellcasting
blocks need to conditionally render only when present, and the action list
itself needs to handle 1–10+ entries gracefully for print pagination.

---

## ContentFeat

| Field | Type | Notes |
|---|---|---|
| category | String | `GENERAL \| ORIGIN \| FIGHTING_STYLE \| EPIC_BOON \| CLASS_SPECIFIC` |
| prerequisite | String? | |
| extraData | JSON? | `benefits[]` (Open5e only), `special`, `modifiers[]` |

**Examples:**

**1. Alert**
```json
{ "name": "Alert", "category": "ORIGIN", "prerequisite": null,
  "description": "You gain the following benefits.\n\tInitiative Proficiency. When you roll Initiative, you can add your Proficiency Bonus to the roll.\n\tInitiative Swap. […]",
  "extraData": { "edition": "2024", "page": "200" } }
```

**2. Lucky**
```json
{ "name": "Lucky", "category": "ORIGIN", "prerequisite": null,
  "description": "You gain the following benefits.\n\tLuck Points. […]\n\tAdvantage. […]\n\tDisadvantage. […]",
  "extraData": { "edition": "2024", "page": "201" } }
```
Both real feats have multiple named sub-benefits (Initiative
Proficiency/Swap; Luck Points/Advantage/Disadvantage) folded into one
`description` string with `\t`-prefixed lines — not a structured
`benefits[]` array on these Compendium rows (that key is Open5e-only per
the schema comment). A card wanting to visually separate each sub-benefit
into its own block would need to parse `description`'s tab-delimited
pseudo-structure, or add a schema field — it's not already broken out.

---

## ContentClassOption *(Browse/card treatment still open upstream, per `card-design-spec.md` §4)*

| Field | Type | Notes |
|---|---|---|
| classId | String? | which class gates this option |
| pool | String | `"Metamagic" \| "Eldritch Invocation" \| "Maneuver"` |
| prerequisite | String? | |

**Examples:**

```json
{ "name": "Ambush", "pool": "Maneuver", "classId": null, "prerequisite": null,
  "description": "When you make a Dexterity (Stealth) check or an Initiative roll, you can expend one Superiority Die and add the die to the roll, unless you have the Incapacitated condition.",
  "extraData": { "edition": "2024", "page": "94" } }

{ "name": "Commander's Strike", "pool": "Maneuver", "classId": null,
  "description": "When you take the Attack action on your turn, you can replace one of your attacks to direct one of your companions to strike. […]",
  "extraData": { "edition": "2024", "page": "94" } }
```
All 126 live rows have `classId: null` — every Maneuver in the current data
is a general Battle Master option not yet linked to a specific class row,
even though the column exists. If the card design wants "grouped by class,"
that grouping isn't populated yet for any live Maneuver.

---

## Language

Flat lookup table, not a content type with its own card (per
`card-design-spec.md`) — referenced elsewhere as a plain string.

```json
{ "name": "Common", "category": "common" }
{ "name": "Dwarvish", "category": "common" }
{ "name": "Elvish", "category": "common" }
```

---

## ImportJob

Not card-facing, included for completeness / to explain why some sources
have gaps (e.g. Condition).

```json
{
  "sourceId": "open5e-srd-2024", "jobType": "OPEN5E", "status": "COMPLETED",
  "contentTypes": ["CONDITION","SPELL","RACE","CLASS","BACKGROUND","ITEM","MONSTER"],
  "totalItems": 7, "processedItems": 7, "errorLog": null
}
```

A second real job (`fc5-compendium-uncredited`, `status: "PARTIAL"`) has a
populated `errorLog` — rows get skipped when they fail Zod validation (e.g.
a spell missing `duration`, a monster with a malformed `legendaryActions`
entry). Not card-relevant directly, but explains why coverage per source is
uneven — some real books have a handful of items silently missing.

---

## Summary — things that will bite a naive "one fixed layout per type" card design

1. **`ContentCondition` has zero rows.** Nothing to design against yet — flag before spending design time on it.
2. **Class `description` is empty on every Open5e row**, populated on Compendium rows. Layout needs to tolerate a missing flavor-text block.
3. **Class features are a separate table now** (`ContentClassFeature`), not `extraData.features[]` as `card-design-spec.md` currently says — good news structurally, but the existing doc needs a sync.
4. **Background `feature[]` is empty on 2024-style backgrounds**; the real granted benefit is `extraData.grantedFeat.name`, a bare string, not an FK.
5. **Item shape branches hard on `itemType`** — weapon vs. wondrous item populate almost entirely different field sets.
6. **Monster complexity ranges from 4 fields used to every field used** (Goblin Boss vs. Ancient Red Dragon) — legendary actions / spellcasting / traits need conditional rendering.
7. **Source names/ids can be 279+ characters** of garbled auto-generated text — any source badge needs truncation handling.
8. **Race trait count/shape varies 4× to 11×** across sources for the "same" race, and can restate other fields as prose.
9. **Subrace/Subclass can have a null parent FK** (`unresolvedRaceName`/`unresolvedClassName` in `extraData` instead) — card needs a no-parent fallback, not just a broken link.
10. **Duplicate near-identical rows across sources are normal** (e.g. Champion from both Open5e and PHB 2024) — worth a design decision on how lists of "subclasses of X" handle same-name duplicates.
