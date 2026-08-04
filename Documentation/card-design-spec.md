# DragonLedger — Content Card Design Specification (Data Reference)

**What "card" means here:** the **full-content, printable** display for a
single record, shown once a user selects it (from the Browse results table —
see note below). This is what `outline.md`/`phase-5-browse-ui-final-export.md`
call `<Type>DetailFields`. It shows the **entire record**, not a summary —
and it must be printable.

**What "card" does *not* mean here:** the searchable/selectable list on the
Browse screen is a **table**, not cards — that's a separate, out-of-scope
piece of UI. Nothing in this document concerns table/column design.

**This document is a data reference only.** It exists so a design session
(intended to run on Claude Mobile) has every field available per content
type in one place, without needing this codebase open. **It deliberately
contains no layout, grouping, visual-treatment, or "which fields matter
most" opinions** — every decision about how a type's card looks, what's
grouped together, how print pagination works, color, typography, etc. belongs
to that session, not to this document. Where a note below states a data fact
(a field is usually null, a field only has meaning in combination with
another), that's included because it's necessary to represent the data
correctly, not as a layout suggestion.

**Source of truth this was compiled from:** `Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`
(field-by-field schema + worked examples) and `Documentation/outline.md`
Appendix A. If this document and the master schema ever disagree, the master
schema wins — re-sync this file.

---

## 1. App Context (factual)

DragonLedger is a local, single-user desktop app (Electron-packaged) for
managing D&D 5e reference content — spells, classes, races, monsters, items,
etc. — imported from the Open5e API and a Compendium XML file, or hand-entered
as homebrew. Every record belongs to a named **Source** (`API` / `FILE` /
`MANUAL`) and carries a `slug` unique within that source.

Frontend stack: React 19 + Vite + TypeScript, Tailwind CSS v4 (CSS-first
config, no `tailwind.config.js`), shadcn/ui. Cards will be implemented as
ordinary React components in this stack.

**Stated requirements (from the person who requested this document, not
inferred):**
- Each card shows the **full record** for its type — no field is out of
  scope for display because it's "detail-view only" or "too long."
- Each card must be **printable**.

Nothing beyond those two points should be treated as decided going in.

---

## 2. Where This Fits

```
BrowseScreen — searchable/filterable TABLE of results (out of scope here)
  → user selects a row
    → DetailScreen — shows the full-content, printable "card" for that record
```

One card component per content type, rendered on `DetailScreen`
(`/browse/:type/:id` per the existing routing decision).

---

## 3. Cross-Cutting Data Facts

Facts that apply across every content type below.

**Every content table shares this base shape:**

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | internal PK |
| `slug` | String | unique within `sourceId` |
| `sourceId` | String (FK → `Source`) | which book/API/homebrew this record came from |
| `name` | String | |

`Source` itself: `id`, `name`, `type` (`API \| FILE \| MANUAL`),
`description?`, `lastUpdated`, `isDeletable`.

**JSON-shaped fields:** SQLite has no native JSON column type, so every field
marked "JSON" below is stored as a `String` and parsed before use — a
data-layer detail, not something the card component itself needs to handle.

**The "Fixed/Choice Grant Shape"** (full spec: master schema Appendix C)
recurs across several types: `ContentBackground.proficiencies`,
`ContentBackground.abilityBonuses`, `ContentClass.skillChoices`, and
race/subrace trait `grant` fields. Its actual shape:

```json
{
  "fixed": { },
  "choices": [
    { "type": "select", "count": 1, "from": [ ], "amount": null },
    { "type": "distribute", "pool": 2, "among": [ ], "maxPerOption": 2 }
  ]
}
```

- `fixed` is an array for name-only grants (skills, tools, languages), or an
  object carrying an amount for grants like ability bonuses (e.g. `{"WIS":1}`)
- `choices[].type: "select"` — pick `count` items from `from` (`from: null` means "from anywhere")
- `choices[].type: "distribute"` — spend a `pool` of points across `among`, capped by `maxPerOption`
- `from`/`among` entries are plain strings, or `{ name, category }` objects
  when a choice spans categories (e.g. "Stealth, Sleight of Hand, or Thieves' Tools")

**`extraData`:** most content types have an `extraData String?` column — a
JSON escape hatch for fields with no dedicated column (either rare fields, or
source data too unpredictable to normalize into a fixed column). Since this
card shows the full record, `extraData`'s parsed contents are in scope for
display the same as any dedicated column — its per-type contents are listed
in each section below.

**Nullability in practice:** fields typed `String?` are genuinely absent on
many real records — e.g. `ContentCondition.effects` is null on essentially
every Open5e condition, `ContentSubrace.size`/`speed` are null unless that
specific subrace overrides its parent. These are noted per field below
because they're facts about the data, not because any field should be
hidden.

---

## 4. Content Types

Per `outline.md`, there are **8 top-level browsable content types**
(Spell, Class, Race, Background, Condition, Item, Monster, Feat). Two more
exist in the schema but are reached from a parent record rather than the
top-level list:

- **Subclass** — reached from a Class's card (`GET /api/subclasses?classId=`)
- **Subrace** — reached from a Race's card (`GET /api/subraces?raceId=`)

Also present in the schema, included below for completeness, but its
own Browse/card treatment is an **open, unresolved question upstream**
(`outline.md` Open Questions #1) — not something this document is deciding:

- **`ContentClassOption`** (Metamagic / Eldritch Invocations / Maneuvers)

Not included below: **`Language`** — a seeded lookup table (`name`,
`category`) referenced by other records as a plain string; it isn't itself a
content type with a card.

---

## 5. Per-Type Field Reference

### 5.1 Spell

| Field | Type | Notes |
|---|---|---|
| name | String | |
| level | Int | 0 = cantrip |
| school | String | e.g. "evocation", "abjuration" — free-text from source, not a fixed in-schema enum |
| castingTime | String | e.g. "action", "1 bonus action", "1 reaction" |
| range | String | e.g. "150 feet", "Self", "Touch" |
| components | String | collapsed display string, e.g. `"V, S, M"` |
| material | String? | the specific material component text, if any |
| duration | String | e.g. "instantaneous", "Concentration, up to 10 minutes" |
| concentration | Boolean | |
| ritual | Boolean | |
| classes | String (JSON array) | display names, e.g. `["Sorcerer","Wizard"]` |
| description | String | full spell text |
| higherLevels | String? | "at higher levels" text |
| extraData | String? (JSON) | `damageRoll`, `damageTypes`, `savingThrow`, `attackRoll`, `targetType`/`targetCount`, AoE shape/size, `reactionCondition`, `materialCost`/`materialConsumed` |

### 5.2 Class

| Field | Type | Notes |
|---|---|---|
| name | String | |
| hitDie | Int | e.g. 6, 8, 10, 12 |
| primaryAbility | String (JSON) | `{ abilities: string[], logic: "AND"\|"OR" }` |
| savingThrows | String (JSON array) | e.g. `["STR","CON"]` |
| armorProfs | String (JSON array) | |
| weaponProfs | String (JSON array) | |
| skillChoices | String (JSON) | Fixed/Choice Grant Shape (§3) |
| spellcastingAbility | String? | null if the class doesn't cast spells |
| description | String | |
| extraData | String? (JSON) | `casterType`, `features[]` (each with name/description/type/levels) |
| *(relation)* subclasses | ContentSubclass[] | |

### 5.3 Subclass *(reached from a Class's card)*

| Field | Type | Notes |
|---|---|---|
| name | String | |
| classId | String? | nullable FK to parent Class — null if the parent was deleted (homebrew subclass orphaned) |
| description | String | |
| extraData | String? (JSON) | `features[]`; `unresolvedClassName` if cross-source parent resolution failed (Compendium-imported only) |

### 5.4 Race

| Field | Type | Notes |
|---|---|---|
| name | String | |
| size | String (JSON array) | e.g. `["medium"]`, or `["small","medium"]` for size-choice races |
| speed | String (JSON) | `{ walk, fly?, swim? }` |
| traits | String (JSON array) | `{ name, description, level, grant? }[]` |
| description | String | |
| extraData | String? (JSON) | |
| parentRaceId | String? | self-relation FK — set only for real 2014-style "subspecies" records (distinct from the separate Subrace table) |
| *(relation)* subraces | ContentSubrace[] | |

### 5.5 Subrace *(reached from a Race's card)*

| Field | Type | Notes |
|---|---|---|
| name | String | |
| raceId | String? | nullable FK to parent Race, same orphan possibility as Subclass |
| description | String? | |
| size | String? (JSON array) | **null unless this subrace overrides the parent's** |
| speed | String? (JSON) | same override-only semantics as `size` |
| traits | String (JSON array) | this subrace's own traits, in addition to the parent Race's |
| extraData | String? (JSON) | `unresolvedRaceName` if parent resolution failed |

### 5.6 Background

| Field | Type | Notes |
|---|---|---|
| name | String | |
| proficiencies | String (JSON) | Fixed/Choice Grant Shape (§3), entries tagged `category: "skill"\|"tool"` — skills and tools merged into one field |
| abilityBonuses | String (JSON) | Fixed/Choice Grant Shape; `fixed` is an object carrying an amount, e.g. `{"WIS":1}` |
| feature | String (JSON array) | `[{ name, description }]` |
| description | String | |
| extraData | String? (JSON) | languages, equipment, `unrecognizedBenefits[]`, flavor text, `proficiencyMismatch` (Compendium-only, when a tag and a bullet point disagree) |

### 5.7 Condition

| Field | Type | Notes |
|---|---|---|
| name | String | e.g. "Blinded", "Poisoned", "Prone" |
| description | String | |
| effects | String? | usually null — Open5e conditions have no structured effects field |
| extraData | String? (JSON) | `descriptionSource`/`requestedSource` (present only when a fallback substitution occurred), `icon` |

### 5.8 Item

| Field | Type | Notes |
|---|---|---|
| name | String | |
| itemType | String | e.g. "weapon", "armor", "wondrous item" |
| rarity | String? | e.g. "common", "rare", "legendary" — null for mundane equipment |
| requiresAttunement | Boolean | |
| cost | String? | e.g. "15 gp" |
| weight | String? | e.g. "3 lb." |
| damage | String? | weapons only, e.g. "1d8 slashing" |
| armorClass | String? | armor only |
| properties | String? (JSON array) | `{ name, detail? }[]` — e.g. weapon properties like "Finesse", "Versatile (1d10)" |
| description | String | |
| extraData | String? (JSON) | `size`, `range`, `isSimple`/`isMartial`/`isImprovised`, `stealthDisadvantage`, `maxDexBonus`, `addDexMod`, `strRequired`, `acDisplay`, `attunementDetail` |

Note: `rarity`'s text-parsing reliability for Compendium imports is flagged
elsewhere (`outline.md` Open Questions #10) as unconfirmed — expect null on
some real magic items.

### 5.9 Monster

The type with the most fields.

| Field | Type | Notes |
|---|---|---|
| name | String | |
| size | String | e.g. "small", "large" |
| monsterType | String | e.g. "fey", "dragon", "undead" |
| alignment | String | e.g. "neutral evil" |
| armorClass | Int | |
| hitPoints | Int | |
| hitDice | String | e.g. "2d6" |
| speed | String (JSON) | e.g. `{"unit":"feet","walk":30}` |
| abilityScores | String (JSON) | `{ strength, dexterity, constitution, intelligence, wisdom, charisma }` |
| savingThrows | String? (JSON) | |
| skills | String? (JSON) | e.g. `{"stealth":6}` |
| damageResistances | String? (JSON array) | composite-parser shape (structured, not a naive comma-split) |
| damageImmunities | String? (JSON array) | |
| damageVulnerabilities | String? (JSON array) | |
| conditionImmunities | String? (JSON array) | |
| senses | String? | plain display string, e.g. "darkvision 60 ft., passive Perception 9" |
| languages | String? | plain display string |
| challengeRating | String | handles fractions like `"1/8"` |
| actions | String (JSON array) | each entry tagged `actionType: "action"\|"bonus"\|"reaction"` |
| legendaryActions | String? (JSON array) | |
| description | String? | |
| extraData | String? (JSON) | `armorClassDetail`, `lairActions`, `traits[]`, `spellcasting`, `proficiencyBonus`, `legendaryResistances`, `experiencePoints`, `category`/`subcategory` |

### 5.10 Feat

| Field | Type | Notes |
|---|---|---|
| name | String | |
| category | String | `GENERAL \| ORIGIN \| FIGHTING_STYLE \| EPIC_BOON \| CLASS_SPECIFIC` |
| prerequisite | String? | e.g. "Strength 13 or higher" — null if none |
| description | String | |
| extraData | String? (JSON) | `benefits[]` (Open5e only), `special`, `modifiers[]` |

### 5.11 ContentClassOption *(Browse/card treatment still undecided upstream — see §4)*

| Field | Type | Notes |
|---|---|---|
| name | String | |
| classId | String? | which class this option is gated behind |
| pool | String | `"Metamagic" \| "Eldritch Invocation" \| "Maneuver"` (future pools possible) |
| description | String | |
| prerequisite | String? | |
| extraData | String? (JSON) | |

---

## 6. Expected Deliverable

For each type in §5: a concrete visual direction (mockup, or a precise
field-to-layout mapping) for its full-content, printable card — specific
enough to translate directly into a `<Type>DetailFields`/`<Type>Card.tsx`
React component (Tailwind v4 + shadcn/ui). All layout, grouping, print-
pagination, and visual-treatment decisions are made in that session, not here.
