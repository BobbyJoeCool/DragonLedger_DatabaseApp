# DragonLedger DatabaseApp — Phase 2 Import: Final Design Export

**Reconciliation note (added after later sessions):** three things below are now superseded elsewhere and should be read with this in mind rather than taken at face value:
1. **Database target changed from Azure SQL Server to local SQLite** after this document was written (see `architecture-addendum-local-sqlite.md`) — references to SQL Server's parameter limits below reflect the original assumption, not the current target.
2. **`ImportJobStatus` gained a new value**, `AWAITING_CONFIRMATION`, added during the Compendium sessions for the cross-source duplicate-check flow — not reflected in Section 3's schema block below.
3. **The delete-and-replace refresh mechanism described here applies specifically to Open5e (`API`-type) sources.** The Compendium uses a different, additive-only, never-overwrite mechanism instead (see `compendium-race-subrace-reimport-safety-export.md`, Section 4) — the two are deliberately different, not variations of one mechanism.

The current, fully reconciled schema lives in `dragonledger-master-schema.md`. This document's decisions and reasoning (batching, retries, validation approach, field mappings) remain accurate for Open5e specifically; only the three items above are stale.

## 1. Decisions Made

### 1.1 SSE Job State

DB-backed `ImportJob` model, not in-memory only.

Reasoning: App Service free-tier idling can silently kill an in-memory job mid-run, and `GET /api/import/history` needs a durable record anyway — building both an in-memory map and a DB table would be redundant. A small in-memory `EventEmitter` per running job pushes live updates to open SSE connections; every update also writes through to the DB row so a reconnect/restart can recover state.

### 1.2 Batch Insert Strategy

Chunk size: 500 rows per `createMany` call (originally sized against SQL Server's ~2100 parameter limit; SQLite's own default parameter limit — typically 999, sometimes higher depending on build — is actually more restrictive for the widest model, Monster, so this chunk size should be re-verified rather than assumed safe now that the target database has changed).

Rollback boundary: **whole content type**, not per-chunk. If one bad record breaks a chunk, the entire content type's transaction rolls back — not just that chunk — so you never end up with a partial, oddly-truncated set (e.g. 2000 of 2500 monsters). Other content types in the same import are unaffected and keep their successfully imported data. Reasoning: imports are already re-runnable (delete-and-replace), so re-running one failed type after a fix is cheap and unambiguous; a half-imported type is confusing to browse and hard to reason about.

### 1.3 Network Resilience

Retry with exponential backoff on Open5e fetch failures: 3 attempts, base 500ms doubling, honoring a `Retry-After` header on 429 responses. Included now rather than deferred — cheap to build, meaningfully reduces the odds of a full import failing on one transient blip.

### 1.4 Validation Strategy

Zod, one schema module per content type (`server/src/schemas/content/*.ts`), each exporting a full schema (create/import) and a `.partial()` variant (PATCH). Shared between Phase 2's import validation and Phase 4's write-API validation — no duplication, both live in the same Express server. A future client-side shared package (`@dragonledger/content-types`) is a later concern, not now.

### 1.5 Field Mapping Approach

Heroes' existing import-map docs (`DragonLedger_Heroes/DevNotes/API_ImportMaps/*.md`) were used as the starting point, then adapted for this schema's shape (surrogate `cuid()` PK instead of Heroes' literal `key`-as-PK, inlined features/actions instead of Heroes' separate tables, single `extraData` catch-all). All mappings were then cross-checked against `API_Endpoints.md` (a real sampled-JSON reference, more authoritative than Heroes' secondhand notes) and, where feasible, against live Open5e v2 API responses. See Section 2 for the full per-type tables and Section 6 for a list of corrections found during that cross-check.

## 2. Field Mapping Tables Per Content Type

### 2.1 Spells

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | Per-source unique slug (not the PK — PK is `cuid()`). |
| `name` | `name` | Direct copy. |
| `level` | `level` | Direct copy, 0 = cantrip. |
| `school.key` | `school` | Direct copy. |
| `casting_time` | `castingTime` | Direct copy. |
| `range_text` | `range` | Use this field, not `range`/`range_unit`. |
| `duration` | `duration` | Direct copy. |
| `concentration` | `concentration` | Boolean, native SQL Server `BIT` via Prisma. |
| `ritual` | `ritual` | Boolean, same as above. |
| `desc` | `description` | Direct copy. |
| `classes[].name` | `classes` | JSON array of **display names** (e.g. `["Sorcerer","Wizard"]`), not Open5e keys. |
| `higher_level` | `higherLevels` | Dedicated column (Heroes buries this in extraData; we don't need to). |
| `verbal`/`somatic`/`material` | `components` | Collapsed to a short string, e.g. `"V, S, M"`. |
| `material_specified` | `material` | Material description text, or `null`. |
| `document.key` | `sourceId` | Resolved to `Source.id` at import time. |
| `casting_options[]` | `extraData.castingOptions` | `null` if the array is a single no-op default entry. **Full array preserved** if any entry beyond default has real data (differing range/duration/damage per casting mode). |

Everything else (`damage_roll`, `damage_types[]`, `saving_throw_ability`, `attack_roll`, `target_type`/`target_count`, `shape_type`/`shape_size`/`shape_size_unit`, `reaction_condition`, `material_cost`, `material_consumed`) → `extraData`, no dedicated columns.

Edge case note: an empty `classes[]` array is left as-is (no distinction made between "genuinely no classes" and "data missing") — not worth the added complexity.

### 2.2 Conditions

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | Per-source unique slug. |
| `name` | `name` | Direct copy. |
| `descriptions[]` | `description` | Match entry where `document === document.key`; fall back to first entry if no match. |
| `document.key` | `sourceId` | Resolved to `Source.id`. |
| `icon` | `extraData.icon` | Almost always `null`; stashed if present. |
| — | `effects` | Left `null` — Open5e conditions have no structured effects, only description prose. |

Edge case handling: **when the description fallback is used** (no entry matches this source's `document.key`), record it — `extraData.descriptionSource` (the game-system actually used) and `extraData.requestedSource` (the one that was wanted but missing) — present only when a fallback occurred. This matters because a future Heroes character sheet could otherwise silently show a DM the wrong ruleset's condition text with no way to tell.

### 2.3 Races & Subraces

Schema: `ContentRace` and `ContentSubrace` are separate tables. `ContentSubrace.raceId` is a FK to `ContentRace.id`, `onDelete: NoAction` (same reasoning as Subclass→Class — avoids SQL Server rejecting a second cascade path to the same table, since `ContentSubrace` already cascades from `Source`).

Size/Speed extraction: match the trait **by name** (`"Size"`/`"Speed"`, case-insensitive) — confirmed against real sampled data that `traits[].type` is `null` for 2014-era content but populated for 2024, so name-matching works consistently across both. Parse `desc` the same way for both eras. `size` is a JSON array (usually one entry, sometimes two — e.g. Human/Tiefling's "Medium or Small, chosen when you select this species" → `["small","medium"]`). Default `["medium"]`/`{walk: 30}` only if no such trait exists at all.

Subrace sourcing — two input shapes, one output table:

| Source style | How it becomes a `ContentSubrace` row |
|---|---|
| 2014/third-party (`is_subspecies: true`, real separate record) | Direct import — `subspecies_of` resolves to the parent's `id`. |
| 2024 lineage tables (no separate record — a trait like "Elven Lineage"/"Draconic Ancestry"/"Fiendish Legacy" on the base race) | **Parsed apart** into synthetic rows, one per option (Wood Elf, Drow, High Elf, etc.), via a small per-race parsing function — these tables are not a consistent shape (2-column, 4-column, or prose bullets), so this cannot be one generic parser. Only ~5 SRD 2024 races have a lineage-style trait (Elf, Dragonborn, Gnome, Goliath, Tiefling). |

A nested sub-sub-race (a further specialization within a subrace, e.g. a hypothetical Drow house affiliation) is handled as a **feature/trait on the subrace row itself**, carrying its own `grant` choice — no third table tier needed, since `traits` is already flexible inline JSON.

Trait choice grants: any race/subrace trait recognizably granting a fixed-vs-choice benefit (e.g. Human's "Skillful" — *"You gain proficiency in one skill of your choice"*) gets both its prose (`description`) and a parsed `grant` field alongside it, using the standard Fixed/Choice Grant Shape (Section 4). Traits with no such pattern (Darkvision, Trance) skip `grant` entirely.

| Open5e Field | `ContentRace` | `ContentSubrace` | Notes |
|---|---|---|---|
| `key` | `slug` | `slug` (synthetic subraces get a generated slug, e.g. `elf-wood-elf`) | |
| `name` | `name` | `name` | Synthetic rows use the lineage option's label. |
| `desc` | `description` | `description` | `null` if blank. |
| `document.key` | `sourceId` | `sourceId` | Synthetic rows still tag the parent's source. |
| `subspecies_of` (2014) / parsed (2024) | — | `raceId` | Resolved to parent `ContentRace.id`. Import base races before subraces. |
| trait named `"Size"` | `size` | `size` (null unless overridden) | JSON array. |
| trait named `"Speed"` | `speed` | `speed` (null unless overridden) | `{ walk, fly?, swim? }`. |
| `traits[]` (all, minus lineage trait once parsed) | `traits` | `traits` | `{ name, description, level, grant? }` array. `level` defaults to 1 unless a level-gate is parseable. |
| lineage trait's embedded table/bullets (2024 only) | — | `traits` | Per-tier benefits become entries here via the race-specific parser. |

### 2.4 Background

Schema change: `skillProficiencies`/`toolProficiencies` merged into one `proficiencies` field (see Section 4 — this was necessary to represent mixed-category choices like "Stealth, Sleight of Hand, or Thieves' Tools," which can't be pre-sorted into separate columns without duplicating or losing an option).

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | Per-source unique slug. |
| `name` | `name` | Direct copy. |
| `desc` | `description` | `null` if blank. |
| `document.key` | `sourceId` | Resolved to `Source.id`. |
| `benefits[type="skill_proficiency"]` + `benefits[type="tool_proficiency"]` | `proficiencies` | Merged, Fixed/Choice shape, entries tagged `category: "skill"`/`"tool"`. |
| `benefits[type="ability_score"]` | `abilityBonuses` | Fixed/Choice shape; `fixed` is an object (`{WIS: 1}`) not an array since bonuses carry an amount. Supports plain bonuses, "pick from a list," and point-pool distribution (Section 4). |
| `benefits[type="feature"]` (all matches) | `feature` | JSON array `[{ name, description }, ...]` — collects every feature-type benefit, not just the first. |
| `benefits[type="language"]` | `extraData.languages` | Fixed/Choice shape (`{ languages: [...named], choices: [...] }`) — no dedicated column exists. |
| `benefits[type="equipment"]` | `extraData.equipment` | Raw string, unparsed — no dedicated column. |
| `benefits[type="adventures_and_advancement"]` / `"connection_and_memento"` | `extraData` | Flavor-only text/markdown tables, stored raw. |
| `benefits[type=<unrecognized>]` | `extraData.unrecognizedBenefits` | Raw benefit object preserved, array — **never silently dropped**, since a character-sheet app downstream needs everything, not just known categories. |

### 2.5 Classes & Subclasses

Schema change: `primaryAbility` restructured from a flat array to `{ abilities: [...], logic: "AND"|"OR" }`. Reasoning: some classes require *either* primary ability at 13+ to multiclass (Fighter — OR), others require *both* (Paladin, Monk, Ranger — AND), and Open5e's `primary_abilities[]` doesn't encode which. `logic` comes from a small hardcoded per-class lookup table (defaults to `"OR"` when there's only one ability).

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | Per-source unique slug. |
| `name` | `name` | Direct copy. |
| `hit_dice` (or `hit_points.hit_dice`, when the nested object is present) | `hitDie` | Prefer the nested `hit_points.hit_dice` object when present (verified in real samples); otherwise infer from a "Hit Dice"/"Hit Points" feature; fall back to a hardcoded SRD lookup table as a last resort. |
| `primary_abilities[]` | `primaryAbility` | `{ abilities: [...], logic }` per schema change above. |
| `saving_throws[]` | `savingThrows` | Plain JSON array — always fixed per class, no choice involved. |
| *(features scan, "Skills"-type)* | `skillChoices` | Fixed/Choice Grant Shape, parsed from the matching feature's prose — no dedicated API field for this. Needs verification against a live sample before implementation. |
| *(features scan, armor-type)* | `armorProfs` | Plain JSON array, parsed from feature prose. |
| *(features scan, weapon-type)* | `weaponProfs` | Same. |
| `caster_type` | `extraData.casterType` | Stored as-is (`NONE`/`FULL`/`HALF`). |
| *(hardcoded lookup by class name)* | `spellcastingAbility` | `null` if `caster_type = NONE`; otherwise looked up (Wizard→INT, Cleric/Druid/Ranger→WIS, Bard/Sorcerer/Warlock/Paladin→CHA, etc.) — Open5e doesn't expose this directly. |
| `desc` | `description` | `null` if blank. |
| `document.key` | `sourceId` | Resolved to `Source.id`. |
| `features[]` (all, excluding ones consumed above) | `extraData.features` | Structured array `[{ name, description, type, levels: [...] }]` — no separate features table exists here. |

Subclasses: `key`→`slug`, `name`→`name`, `subclass_of.key`→`classId` (resolved; **import classes before subclasses**), `desc`→`description`, `document.key`→`sourceId` (may legitimately differ from the parent class's source — confirmed intentional, e.g. A5E splatbook subclasses for core classes), `features[]`→`extraData.features` (same shape as class features).

Multiclassing rule handled without any additional field: the "13+ in primary ability" constant is a fixed 5e rule, not per-class data — a future character sheet reads it once and checks against whichever ability(ies) `primaryAbility.abilities` names, using `logic` to know AND vs. OR.

### 2.6 Items

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | Per-source unique slug. |
| `name` | `name` | Direct copy. |
| `desc` | `description` | `null` if blank. |
| `category.key` | `itemType` | Direct copy; overridden by `armor.category` when an armor sub-object is present (see below). |
| `weight` | `weight` | `parseFloat()`'d, stored as string. |
| `cost` | `cost` | Composed as `"25 gp"` — no copper-piece normalization. |
| `document.key` | `sourceId` | Resolved to `Source.id`. |
| `size.key` | `extraData.size` | No dedicated column. |

Weapon sub-object (when `weapon !== null`):

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `weapon.damage_dice` + `weapon.damage_type.key` | `damage` | Composed: `"1d8 slashing"`. |
| `weapon.properties[]` | `properties` | JSON array of `{ name, detail? }` objects — preserves Versatile's second die, etc. |
| `weapon.range` + `weapon.long_range` | `extraData.range` | No dedicated column — `"20/60 ft."`, or omitted if both are 0/null. Note: the *embedded* weapon object on an items record may not carry range at all per real samples — may require a secondary lookup against the standalone `/v2/weapons/` endpoint by key. |
| `weapon.is_simple` / `is_improvised` / `is_martial` | `extraData` | `{ isSimple, isImprovised, isMartial }`. |

Armor sub-object (when `armor !== null`):

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `armor.ac_base` | `armorClass` | Base number only, stored as a string, e.g. `"14"` — no formula composed in. |
| `armor.category` | `itemType` | Overrides base `category.key` with the more specific armor category. |
| `armor.grants_stealth_disadvantage` | `extraData.stealthDisadvantage` | Boolean. |
| `armor.ac_cap_dexmod` | `extraData.maxDexBonus` | Nullable integer. |
| `armor.ac_add_dexmod` | `extraData.addDexMod` | Boolean. |
| `armor.strength_score_required` | `extraData.strRequired` | Nullable integer. |
| `armor.ac_display` | `extraData.acDisplay` | Ready-made display string confirmed in real samples (e.g. `"14 + Dex modifier (max 2)"`) — stashed for convenience even though `armorClass` itself stays a plain number. |

Magic items (`/v2/magicitems/`): `rarity.key`→`rarity`, `requires_attunement`→`requiresAttunement`, `attunement_detail`→`extraData.attunementDetail` (if non-null); otherwise same base/weapon/armor mapping as above. Treated as regular new rows, not merges/modifications of existing mundane items.

Left `null` at import time (text-only, no structural source): `charges`, recharge info.

Edge case resolved without a schema change: an item with both `weapon` and `armor` populated (rare homebrew case) needs no special flag — future equip/attack logic can check "is this equipped item's `damage` field populated?" regardless of `itemType`/equip slot, so both fields simply populate normally with no `dualPurpose` marker needed.

### 2.7 Monsters

Schema addition: `ContentMonster.damageVulnerabilities String?` — this app's schema had resistance/immunity/condition-immunity columns but no vulnerability column, which was a real content gap (vulnerability is mechanically as significant as resistance/immunity).

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | Per-source unique slug. |
| `name` | `name` | Direct copy. |
| `size.key` | `size` | Direct copy. |
| `type.key` | `monsterType` | Direct copy. |
| `alignment` | `alignment` | Direct copy. |
| `armor_class` | `armorClass` | Direct copy (Int). For multi-form creatures (werewolves etc.), store the higher/combat-relevant AC. |
| `hit_points` | `hitPoints` | Direct copy (Int) — stored directly, no need to derive from `hit_dice`. |
| `hit_dice` | `hitDice` | Stored as-is, no parsing. |
| `challenge_rating` | `challengeRating` | Stored as string (handles fractions like `"1/8"`). |
| `speed_all` | `speed` | JSON, full object as-is. |
| `ability_scores` | `abilityScores` | JSON as-is; `modifiers` not stored (derivable). |
| `saving_throws` (proficient-only) | `savingThrows` | JSON, `null` if empty. |
| `skill_bonuses` (proficient-only) | `skills` | JSON, `null` if empty. |
| `resistances_and_immunities.damage_resistances` | `damageResistances` | JSON array of type keys, `null` if empty. |
| `resistances_and_immunities.damage_immunities` | `damageImmunities` | Same. |
| `resistances_and_immunities.damage_vulnerabilities` | `damageVulnerabilities` | Same — new column. |
| `resistances_and_immunities.condition_immunities` | `conditionImmunities` | Same. |
| darkvision/blindsight/tremorsense/truesight/passive_perception | `senses` | Composed display string (plain text field, not JSON) — e.g. `"darkvision 120 ft., passive Perception 15"`. |
| `languages.as_string` | `languages` | Direct copy. |
| `description` | `description` | `null` if blank. |
| `document.key` | `sourceId` | Resolved to `Source.id`. |
| Multi-form AC text (e.g. Werewolf's `"11 in humanoid form, 12 in wolf/hybrid form"`) | `extraData.armorClassDetail` | Full breakdown preserved alongside the single stored `armorClass` Int. |
| `actions[]` (type `ACTION`/`BONUS_ACTION`/`REACTION`/`MYTHIC_ACTION`) | `actions` | Single JSON array, each entry tagged with its own `actionType` (`"action"`/`"bonus"`/`"reaction"`) since there are no separate per-type columns. Dice **composed**, not copied: `"{damage_die_count}d{damage_die_type}+{damage_bonus}"`. Attack bonus read from `to_hit_mod` (not `attack_bonus` — corrected from Heroes' docs after live verification). Form-restricted action names (e.g. `"Bite (Wolf or Hybrid Form Only)"`) need no special handling — the restriction is already part of the name/desc text being preserved as-is. |
| `actions[]` (type `LEGENDARY_ACTION`) | `legendaryActions` | Dedicated field. |
| `actions[]` (type `LAIR_ACTION`) | `extraData.lairActions` | No dedicated column. |
| `traits[]` | `extraData.traits` | `[{ name, description }]` — no dedicated traits column on Monster (unlike Race). |
| Trait named `"Spellcasting"`/`"Innate Spellcasting"` | `extraData.spellcasting` | Parsed into `{ ability, atWill: [...], slots: { "1": [...], ... }, cantrips: [...] }`, spell names slugified for a best-effort name match against `ContentSpell.slug` (not a real FK — a lookup hint only, since source and slug may not align). Original raw trait is *also* kept in `extraData.traits` — the parse is additive, not a replacement. Unmatched names are left as plain strings. |
| `proficiency_bonus` | `extraData.proficiencyBonus` | Inferred from the CR-to-proficiency table when `null` (same pattern as Classes) — no dedicated column exists. |
| *(parsed from a "Legendary Resistance (N/Day)" trait, if present)* | `extraData.legendaryResistances` | Parsed count, defaulting to `0`. |
| `experience_points`, `category`, `subcategory` | `extraData` | No dedicated columns. |

## 3. Schema Additions

```prisma
model ImportJob {
  id             String    @id @default(cuid())
  sourceId       String
  source         Source    @relation(fields: [sourceId], references: [id])
  jobType        ImportJobType
  contentTypes   String    // JSON array, e.g. ["SPELL","ITEM"]
  status         ImportJobStatus @default(PENDING)
  totalItems     Int?
  processedItems Int       @default(0)
  errorLog       String?   // JSON array of { contentType, message }
  startedAt      DateTime  @default(now())
  completedAt    DateTime?
}

enum ImportJobType {
  OPEN5E
  FILE
}

enum ImportJobStatus {
  PENDING
  AWAITING_CONFIRMATION  // added during the Compendium sessions — see reconciliation note above
  RUNNING
  COMPLETED
  FAILED
  PARTIAL
}

model ContentRace {
  // ...existing fields...
  parentRaceId String?
  parentRace   ContentRace?  @relation("RaceSubspecies", fields: [parentRaceId], references: [id], onDelete: NoAction)
  subspecies   ContentRace[] @relation("RaceSubspecies")
}

model ContentSubrace {
  id           String   @id @default(cuid())
  slug         String
  sourceId     String
  source       Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  raceId       String
  race         ContentRace @relation(fields: [raceId], references: [id], onDelete: NoAction)
  name         String
  description  String?
  size         String?
  speed        String?
  traits       String
  extraData    String?

  @@unique([sourceId, slug])
}

model ContentMonster {
  // ...existing fields...
  damageVulnerabilities String?
}
```

Field-level changes (not new tables, applied to existing models):

- `ContentClass.primaryAbility`: flat array → `{ abilities: string[], logic: "AND" | "OR" }` (still a `String` column, JSON-shaped).
- `ContentBackground.skillProficiencies` + `ContentBackground.toolProficiencies` → merged into one `ContentBackground.proficiencies String`.

## 4. Standing Conventions

### 4.1 Fixed/Choice Grant Shape

Applies wherever official content mixes a fixed grant with a player choice — `Background.proficiencies`, `Background.abilityBonuses`, `extraData.languages`, `ContentClass.skillChoices`, and any race/subrace trait's `grant` field.

```json
{
  "fixed": { } ,
  "choices": [
    { "type": "select", "count": 1, "from": [ ] | null, "amount": null },
    { "type": "distribute", "pool": 2, "among": [ ], "maxPerOption": 2 }
  ]
}
```

- `fixed` is an array for name-only grants (skills, tools, languages) or an object for grants carrying an amount (ability bonuses, e.g. `{ "WIS": 1 }`).
- `choices[].type: "select"` — pick `count` items from `from` (or anywhere, if `from` is `null`). Covers "pick from a named list" and "pick anything, your choice."
- `choices[].type: "distribute"` — spend a `pool` of points across the options in `among`, capped by `maxPerOption`. Covers point-buy-style grants (e.g. "+2 to Intelligence or Wisdom, distributed as you choose").
- `from`/`among` entries are plain strings when every option is the same category (the common case). When a choice spans categories (e.g. "Stealth, Sleight of Hand, or Thieves' Tools" — two skills and a tool), entries become `{ name, category }` objects instead.
- `amount` on a `select` choice specifies the bonus size when relevant (e.g. `"+1 to Wisdom or Intelligence"` → `{ type: "select", count: 1, from: ["WIS","INT"], amount: 1 }`); omitted for skills/tools/languages where there's nothing to quantify.

### 4.2 extraData Fallback Rule

Any field with no dedicated column, and any record hitting a case the mapping didn't anticipate (an unrecognized enum value, an unmapped benefit type), gets captured in `extraData` rather than silently dropped — since this app is the foundation for a future character-sheet app (Heroes), and losing data invisibly is a worse failure mode than an unused JSON blob.

## 5. Transform Function Signatures (Pseudocode)

```typescript
// server/src/importers/open5e/spells.ts
function transformSpell(raw: Open5eSpell, sourceId: string): Prisma.ContentSpellCreateInput

// server/src/importers/open5e/conditions.ts
function transformCondition(raw: Open5eCondition, sourceId: string): Prisma.ContentConditionCreateInput

// server/src/importers/open5e/races.ts
function transformRace(raw: Open5eSpecies, sourceId: string): Prisma.ContentRaceCreateInput
function synthesizeSubracesFromLineageTrait(raceId: string, raw: Open5eSpecies, sourceId: string): Prisma.ContentSubraceCreateInput[]
  // one small per-race parser: parseElfLineage, parseDragonbornAncestry, parseGnomeLineage,
  // parseGoliathAncestry, parseTieflingLegacy — not a single generic function
function transformSubspecies(raw: Open5eSpecies, parentRaceId: string, sourceId: string): Prisma.ContentSubraceCreateInput
  // for is_subspecies: true records (2014/third-party path)

// server/src/importers/open5e/backgrounds.ts
function transformBackground(raw: Open5eBackground, sourceId: string): Prisma.ContentBackgroundCreateInput
function parseProficiencyBenefit(benefits: Open5eBenefit[]): FixedChoiceGrant
  // merges skill_proficiency + tool_proficiency benefits into one tagged grant

// server/src/importers/open5e/classes.ts
function transformClass(raw: Open5eClass, sourceId: string): Prisma.ContentClassCreateInput
function transformSubclass(raw: Open5eClass, classId: string, sourceId: string): Prisma.ContentSubclassCreateInput
function inferHitDie(raw: Open5eClass): number
  // priority: hit_points.hit_dice > "Hit Dice" feature scan > hardcoded SRD table
function lookupSpellcastingAbility(className: string, casterType: string): string | null
function lookupMulticlassLogic(className: string): "AND" | "OR"

// server/src/importers/open5e/items.ts
function transformItem(raw: Open5eItem, sourceId: string): Prisma.ContentItemCreateInput
function transformMagicItem(raw: Open5eMagicItem, sourceId: string): Prisma.ContentItemCreateInput

// server/src/importers/open5e/monsters.ts
function transformMonster(raw: Open5eCreature, sourceId: string): Prisma.ContentMonsterCreateInput
function composeAttackDice(attack: Open5eAttack): string
  // `${attack.damage_die_count}d${attack.damage_die_type}+${attack.damage_bonus}`
function inferProficiencyBonus(cr: string): number
  // CR-to-proficiency-bonus lookup table
function parseSpellcastingTrait(trait: Open5eTrait, availableSpellSlugs: string[]): SpellcastingBlock | null

// server/src/importers/orchestrator.ts
async function importSource(sourceId: string, contentTypes: ContentType[], jobId: string): Promise<void>
  // 1. upsert Source row
  // 2. for each contentType: DELETE existing rows for sourceId, in its own transaction
  // 3. fetchAllPages(endpoint) with retry/backoff
  // 4. transform + chunk(500) + createMany, per-content-type transaction
  // 5. update ImportJob.processedItems/status as each type completes
  // 6. update Source.lastUpdated on full completion
```

## 6. Corrections Found During Live/Sample Verification

- **Attack dice are not a single string field.** Heroes' docs describe `attacks[0].damage_dice`; the real API splits this into `damage_die_count` + `damage_die_type` + `damage_bonus`. Must be composed.
- **Attack bonus field is `to_hit_mod`, not `attack_bonus`.**
- **Race `traits[].type`/`traits[].order` are `null` for 2014-era content**, not just "sometimes" as Heroes' docs implied — confirmed across all sampled 2014 species. Size/Speed extraction must rely on trait *name*, not `type`.
- **2024 SRD species don't use separate subspecies records at all** — "lineage" choices (Wood Elf, Drow, etc.) are embedded as a choice table inside one trait (e.g. "Elven Lineage") on the base race, unlike 2014's real separate `is_subspecies: true` rows.
- **Classes may have a nested `hit_points` object** (`{ hit_dice, hit_dice_name, hit_points_at_1st_level, hit_points_at_higher_levels }`) not documented by Heroes — a better `hitDie` source than feature-scanning when present.
- **`weapon.is_martial` exists** as its own boolean on items (Heroes only documented `is_simple`/`is_improvised`).
- **Armor has a ready-made `ac_display` string** (e.g. `"14 + Dex modifier (max 2)"`) not documented by Heroes.
- **The embedded `weapon` object on an `/v2/items/` record may not carry `range`/`long_range`** — only the *standalone* `/v2/weapons/` endpoint reliably does; a secondary lookup by key may be required.
- **v1 and v2 are not the same content, not just old/new API shapes.** v2 = SRD 2024 (this project's actual import target); v1 = SRD 2014 + most third-party books. Confirmed by direct fetch: `/v1/classes/` returned an old flat shape (`prof_armor`, `hit_dice` as a populated string) while `/v2/creatures/?document__key__in=srd-2024` returned the rich nested shape Heroes documented.

## 7. Implementation Instructions for Claude Code

1. Add the schema changes from Section 3 to `prisma/schema.prisma` (new `ImportJob` model, new `ContentSubrace` model, `ContentRace.parentRaceId` + relation, `ContentMonster.damageVulnerabilities`, and the field-shape changes to `ContentClass.primaryAbility` / `ContentBackground.proficiencies`).
2. Run `prisma migrate dev --name phase2-import-additions`.
3. Create `server/src/schemas/content/*.ts` — one Zod schema per content type per Section 1.4, each exporting a full and `.partial()` variant. These will be reused by Phase 4.
4. Create `server/src/importers/open5e/*.ts` — one file per content type, implementing the transform functions signatures in Section 5. Build in this order: Conditions and Spells first (simplest, no cross-references), then Races (base races before subraces/lineage synthesis), then Classes (classes before subclasses), then Items, then Monsters last (most complex, depends on Spells existing for the spellcasting-trait name-matching to have something to match against).
5. Create `server/src/importers/utils/fetchWithRetry.ts` implementing the retry/backoff logic from Decision 1.3.
6. Create `server/src/importers/orchestrator.ts` implementing `importSource` per Section 5's pseudocode, including per-content-type transaction boundaries and `ImportJob` progress updates.
7. Wire the four endpoints from the outline (`POST /api/import/open5e`, `GET /api/import/progress/:jobId` via SSE, `POST /api/import/file`, `GET /api/import/history`) against the orchestrator and `ImportJob` model.
8. Before running a full import against live Open5e data, verify against a real API response (not just this document) the fields flagged as "needs verification" in Section 2.5 (Classes' `skillChoices`/`armorProfs`/`weaponProfs` parsing, since these aren't direct API fields but parsed from feature prose).
9. Confirm the small hardcoded lookup tables (hit die fallback, spellcasting ability by class, multiclass AND/OR logic by class) cover all SRD 2024 classes before considering Classes import complete.
10. Write the five per-race lineage parsers (Elf, Dragonborn, Gnome, Goliath, Tiefling) as isolated, individually testable functions — each has a genuinely different table/prose shape and should not share a single generic parser.
11. Update `database.mmd` to reflect the new `ImportJob`/`ContentSubrace` models and the `ContentRace`/`ContentMonster`/`ContentClass`/`ContentBackground` field changes.
12. Verify FK constraints: `ContentSubclass.classId` → `ContentClass` (`NoAction`), `ContentSubrace.raceId` → `ContentRace` (`NoAction`), `ContentRace.parentRaceId` → `ContentRace` self-relation (`NoAction`), `ImportJob.sourceId` → `Source`.
