# Phase 2.6 — Schema Expansion (extraData → columns unification): Design Notes

> Part of the `Documentation/v1.0.0/` phase-document set — see
> `v1.0.0-Roadmap.md` for the build-plan checklist and task log this design
> rationale supports. Consolidated from `schema-expansion-design-review.md`,
> `schema-expansion-design-handoff.md`, and `schema-expansion-session-log.md`.
> The three raw per-key frequency-count audits this session worked from
> (`extradata-key-frequency-audit.md`, `-compendium.md`, `-combined.md`,
> relocated alongside this document in `Documentation/v1.0.0/` but not
> merged into it) are not inlined here — their own header explicitly states
> "everything load-bearing is repeated" in the design-review document below
> (its §4 conflicts list and §5 full catalog), which *is* included in full.
> Implementation log, including the two deviations verified against live
> data: `DevTools/Notes/v0.2.notes.md`.

---

# Schema Expansion Design Review

> **Status: resolved.** The open questions below were worked through in an
> offline design session on August 5, 2026. Decisions, updated Prisma models,
> and an implementation checklist live in the handoff document further down
> this file (session narrative also included below). This document is kept
> as-is as the context record that session worked from — read the handoff
> for what to actually build.

**Purpose of this document:** a self-contained reference for an offline
design discussion (with another AI or a person, outside this repo) about
whether/how to promote fields currently buried in each content table's
`extraData` JSON blob into real, dedicated, indexable columns — and, where
Open5e and Compendium currently produce **different shapes for the same
concept**, how to reconcile them into one column both import pipelines can
fill. It contains: the full current Prisma schema, a description of both
import pipelines (what's a straight passthrough vs. a parsed/computed
value), and the complete catalog of everything either source currently
puts in `extraData`, with real examples. It does not propose a specific new
schema — that's the decision this document exists to support.

---

## 1. The two import pipelines, at a glance

This app has two independent content sources, each with its own importer
and its own storage/dedup behavior. Both write into the same set of
`Content*` tables via Prisma. A `Source` row (`type: API | FILE | MANUAL`)
tags where every content row came from; `sourceId` + `slug` is the unique
key per content row.

### Open5e (API, `server/src/importers/orchestrator.ts` + `open5e/*.ts`)

- Pulls from `https://api.open5e.com/v2`, one REST call per content type
  (`/spells/`, `/creatures/`, `/items/`, `/magicitems/`, `/classes/`,
  `/species/`, `/backgrounds/`, `/conditions/`), filtered by
  `document__key__in=<documentKey>` (e.g. `srd-2024`).
- **Delete-and-replace per source per content type**: each content type's
  import runs in its own transaction that does `deleteMany({sourceId})`
  then re-`createMany`s everything fresh. Re-running an Open5e import
  always fully overwrites that source's prior data for that content type —
  there is no notion of "skip if already there" or local-edit
  preservation. This is intentional: Open5e is a live upstream API with a
  maintainer, so "just re-pull" is a valid refresh strategy.
- JSON response fields map to logical fields via a Zod schema
  (`server/src/schemas/content/*.ts`) per content type, then a
  content-type-specific `transformX()` function builds the Prisma row. Most
  fields are near-1:1 API-field-to-column passthroughs; a meaningful
  minority are computed (composed from several raw fields, inferred via a
  hardcoded table, or regex-parsed out of a markdown-formatted prose
  field). Each field's exact method is documented per-table in §3 below.
- No cross-source duplicate detection — Open5e is always assumed to be the
  "base" content a Compendium import might later map onto.

### Compendium (FILE, `server/src/importers/compendiumOrchestrator.ts` + `compendium/*.ts`)

- Parses a single user-supplied XML file (`Complete_Compendium_5.5e.xml`,
  ~140 distinct cited source books bundled into one file) via
  `fast-xml-parser` (`compendium/xmlParser.ts`).
- **Additive-only, never overwrites**: every record goes through
  `resolveAction()`, a two-layer check —
  1. **Same-source duplicate** (this exact `sourceId`+`slug` already
     exists from a prior Compendium import) → skip unconditionally, no
     exceptions.
  2. **Cross-source match** (a same-named row exists in an `API`-type
     source, _and_ this record's cited book has a known mapping to an
     Open5e document key — see `COMPENDIUM_TO_OPEN5E_SOURCE` in
     `sourceBooks.ts`) → pause the whole job as `AWAITING_CONFIRMATION`
     the first time this happens, surfacing every pending match to the
     user; the caller resumes with `duplicateDecision: 'duplicate' |
'skip'`, applied to the _entire batch_ at once, not per-record.
  3. Neither → insert fresh.
     This means a Compendium import never silently overwrites a local edit,
     and never silently creates a duplicate of content that (probably)
     already exists from Open5e.
- **One `Source` row per cited book, not per import run.** Every record's
  free-text body ends with a `Source:\t<Book> p. <N>` citation line
  (`compendium/citation.ts`); the book name is slugified into
  `compendium-<book-slug>` and used as that record's `sourceId`
  (`compendium/sourceBooks.ts`). A record with no parseable citation lands
  under one shared fallback source, `fc5-compendium-uncredited`. Open5e and
  Compendium content for "the same" real book (e.g. the 2024 Player's
  Handbook) deliberately live under **two separate `Source` rows** — this
  was a scope decision, not an oversight.
- **Name-tag parsing** (`compendium/nameTags.ts`): every record's `<name>`
  can carry trailing bracket/paren qualifiers — `[5.5e]` (2024 edition),
  `(Legacy)` (2014 edition), `(HB)` (homebrew), `(TP)` (third-party),
  `(UA)` (Unearthed Arcana playtest), or arbitrary other text (publisher,
  campaign setting, book title) that doesn't match a known tag and is kept
  verbatim in `extraData.otherTags`. This is where every table's
  `edition`/`homebrew`/`thirdParty`/`unearthedArcana`/`otherTags`
  `extraData` keys come from — a shared mechanism across all 7 Compendium
  content types, not per-type logic.
- Cross-source **parent resolution** for Subclass→Class and
  Subrace→Race: prefers an Open5e-sourced parent match by name, falls back
  to any-source match by name, else imports with the FK left `null` and a
  `extraData.unresolvedClassName`/`unresolvedRaceName` flag recording the
  unmatched name.

Both pipelines ultimately produce the same Prisma `CreateManyInput` shapes
— the schema itself has no idea which pipeline wrote a given row.

---

## 2. Full Prisma schema at the time of this review (pre-expansion)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum SourceType {
  API
  FILE
  MANUAL
}

enum ImportJobType {
  OPEN5E
  FILE
}

enum ImportJobStatus {
  PENDING
  AWAITING_CONFIRMATION
  RUNNING
  COMPLETED
  FAILED
  PARTIAL
}

model Source {
  id          String     @id
  name        String
  type        SourceType
  description String?
  lastUpdated DateTime
  isDeletable Boolean

  spells       ContentSpell[]
  classes      ContentClass[]
  subclasses   ContentSubclass[]
  races        ContentRace[]
  subraces     ContentSubrace[]
  backgrounds  ContentBackground[]
  conditions   ContentCondition[]
  items        ContentItem[]
  monsters     ContentMonster[]
  feats        ContentFeat[]
  classOptions ContentClassOption[]
  importJobs   ImportJob[]
}

model ImportJob {
  id             String          @id @default(cuid())
  sourceId       String
  source         Source          @relation(fields: [sourceId], references: [id])
  jobType        ImportJobType
  contentTypes   String // JSON array, e.g. ["SPELL","ITEM"]
  status         ImportJobStatus @default(PENDING)
  totalItems     Int?
  processedItems Int             @default(0)
  errorLog       String? // JSON array of { contentType, message }
  startedAt      DateTime        @default(now())
  completedAt    DateTime?
}

model ContentSpell {
  id            String  @id @default(cuid())
  slug          String
  sourceId      String
  source        Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name          String
  level         Int
  school        String
  castingTime   String
  range         String
  components    String
  material      String?
  duration      String
  concentration Boolean
  ritual        Boolean
  classes       String // JSON array of class display names
  description   String
  higherLevels  String?
  extraData     String? // castingOptions, damageRoll, damageTypes, savingThrow,
  // attackRoll, targetType/targetCount, shape info, reactionCondition,
  // materialCost, materialConsumed

  @@unique([sourceId, slug])
  @@index([level])
  @@index([school])
}

model ContentClass {
  id                  String  @id @default(cuid())
  slug                String
  sourceId            String
  source              Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name                String
  hitDie              Int
  primaryAbility      String // JSON: { abilities: string[], logic: "AND"|"OR" }
  savingThrows        String // JSON array
  armorProfs          String // JSON array
  weaponProfs         String // JSON array
  skillChoices        String // JSON, Fixed/Choice Grant Shape
  spellcastingAbility String?
  description         String
  extraData           String? // casterType, features[] (name/description/type/levels)

  subclasses   ContentSubclass[]
  classOptions ContentClassOption[]

  @@unique([sourceId, slug])
}

model ContentSubclass {
  id          String        @id @default(cuid())
  slug        String
  sourceId    String
  source      Source        @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  classId     String? // nullable per Phase 4 — was required with onDelete: NoAction originally
  class       ContentClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
  name        String
  description String
  extraData   String? // features[]; unresolvedClassName if cross-source resolution (see Compendium docs) fails

  @@unique([sourceId, slug])
}

model ContentRace {
  id          String  @id @default(cuid())
  slug        String
  sourceId    String
  source      Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name        String
  size        String // JSON array, e.g. ["medium"] or ["small","medium"]
  speed       String // JSON, { walk, fly?, swim? }
  traits      String // JSON array of { name, description, level, grant? }
  description String
  extraData   String?

  parentRaceId String?
  parentRace   ContentRace?     @relation("RaceSubspecies", fields: [parentRaceId], references: [id], onDelete: NoAction)
  subspecies   ContentRace[]    @relation("RaceSubspecies")
  subraces     ContentSubrace[]

  @@unique([sourceId, slug])
}

model ContentSubrace {
  id          String       @id @default(cuid())
  slug        String
  sourceId    String
  source      Source       @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  raceId      String? // nullable per Phase 4 — was required with onDelete: NoAction originally
  race        ContentRace? @relation(fields: [raceId], references: [id], onDelete: SetNull)
  name        String
  description String?
  size        String? // JSON array, null unless this subrace overrides the parent's
  speed       String? // JSON, null unless overridden
  traits      String // JSON array, same shape as ContentRace.traits
  extraData   String? // unresolvedRaceName if cross-source resolution (see Compendium docs) fails

  @@unique([sourceId, slug])
}

model ContentBackground {
  id             String  @id @default(cuid())
  slug           String
  sourceId       String
  source         Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name           String
  proficiencies  String // JSON, Fixed/Choice Grant Shape, entries tagged category: "skill"|"tool"
  abilityBonuses String // JSON, Fixed/Choice Grant Shape (fixed is an object, not array)
  feature        String // JSON array of { name, description }
  description    String
  extraData      String? // languages, equipment, unrecognizedBenefits[], flavor text

  @@unique([sourceId, slug])
}

model ContentCondition {
  id          String  @id @default(cuid())
  slug        String
  sourceId    String
  source      Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name        String
  description String
  effects     String?
  extraData   String? // descriptionSource/requestedSource (when a fallback was used), icon

  @@unique([sourceId, slug])
}

model ContentItem {
  id                 String  @id @default(cuid())
  slug               String
  sourceId           String
  source             Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name               String
  itemType           String
  rarity             String?
  requiresAttunement Boolean
  cost               String?
  weight             String?
  damage             String?
  armorClass         String?
  properties         String? // JSON array of { name, detail? }
  description        String
  extraData          String? // size, range, isSimple/isMartial/isImprovised,
  // stealthDisadvantage, maxDexBonus, addDexMod, strRequired,
  // acDisplay, attunementDetail

  @@unique([sourceId, slug])
  @@index([itemType])
  @@index([rarity])
}

model ContentMonster {
  id                    String  @id @default(cuid())
  slug                  String
  sourceId              String
  source                Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name                  String
  size                  String
  monsterType           String
  alignment             String
  armorClass            Int
  hitPoints             Int
  hitDice               String
  speed                 String // JSON
  abilityScores         String // JSON
  savingThrows          String?
  skills                String?
  damageResistances     String?
  damageImmunities      String?
  damageVulnerabilities String?
  conditionImmunities   String?
  senses                String?
  languages             String?
  challengeRating       String
  actions               String // JSON array, each tagged actionType: "action"|"bonus"|"reaction"
  legendaryActions      String?
  description           String?
  extraData             String? // armorClassDetail, lairActions, traits[], spellcasting,
  // proficiencyBonus, legendaryResistances, experiencePoints,
  // category/subcategory

  @@unique([sourceId, slug])
  @@index([challengeRating])
  @@index([monsterType])
}

model ContentFeat {
  id           String  @id @default(cuid())
  slug         String
  sourceId     String
  source       Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name         String
  category     String // "GENERAL" | "ORIGIN" | "FIGHTING_STYLE" | "EPIC_BOON" | "CLASS_SPECIFIC"
  prerequisite String?
  description  String
  extraData    String? // benefits[] (Open5e only), special, modifiers[]

  @@unique([sourceId, slug])
}

model ContentClassOption {
  id           String        @id @default(cuid())
  slug         String
  sourceId     String
  source       Source        @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  classId      String?
  class        ContentClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
  pool         String // "Metamagic" | "Eldritch Invocation" | "Maneuver" | future pools
  name         String
  description  String
  prerequisite String?
  extraData    String?

  @@unique([sourceId, slug])
}

model Language {
  id       String @id @default(cuid())
  name     String @unique
  category String // "common" | "exotic" | "secret"
}
```

Every table's `extraData` is a nullable `String` column holding a JSON
object (or `null`) — SQLite has no native JSON type, so this is
serialized/deserialized at the Prisma boundary via a small
`toJsonString()`/`JSON.parse()` helper (`importers/utils/json.ts`), not a
SQLite JSON1 column type. `json_each`/`json_extract` still work on it at
query time since SQLite's JSON1 extension operates on text.

---

## 3. Per-table field inventory: dedicated columns + import method

For each dedicated (non-`extraData`) column, "method" says how each source
populates it — **passthrough** (near-1:1 copy of one source field),
**composed** (built from ≥2 raw fields, e.g. string concatenation),
**inferred** (a hardcoded lookup table or rule fills a gap the raw data
doesn't state), or **parsed** (extracted from free-text/prose via regex or
markdown-table parsing — inherently best-effort).

### ContentSpell

| Column                           | Open5e method                                       | Compendium method                                                                                                         |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`                           | passthrough (`raw.name`)                            | parsed (name-tag-stripped `tags.name`)                                                                                    |
| `level`                          | passthrough                                         | passthrough (`Number(raw.level)`)                                                                                         |
| `school`                         | passthrough (`raw.school.key`)                      | inferred (single-letter code → full name via `SCHOOL_CODES` map; falls back to lowercased raw value if code unrecognized) |
| `castingTime`/`range`/`duration` | passthrough                                         | passthrough                                                                                                               |
| `components`                     | composed (V/S/M flags → `"V, S, M"` string)         | passthrough (`raw.components` is already a formatted string in the XML)                                                   |
| `material`                       | passthrough (`raw.material_specified`)              | **not populated** (`null` — Compendium's `<components>` doesn't separately break out material text)                       |
| `concentration`                  | passthrough (`raw.concentration` boolean)           | parsed (regex test for `"concentration"` in the duration string)                                                          |
| `ritual`                         | passthrough (`raw.ritual` boolean)                  | parsed (presence of the `<ritual>` element at all, `raw.ritual !== undefined`)                                            |
| `classes`                        | passthrough (mapped from an array of class objects) | parsed (comma-split of the `<classes>` text field)                                                                        |
| `description`                    | passthrough (`raw.desc`)                            | parsed (citation-stripped body text, see `citation.ts`)                                                                   |
| `higherLevels`                   | passthrough (`raw.higher_level`)                    | **not populated** (`null` — no separate field in Compendium XML; upcast text stays embedded in `description`)             |

**Compendium-only content hijacking this same table's schema**: records
whose `<classes>` field matches a `"<Pool> Options"` pattern (Maneuvers,
Metamagic, Eldritch Invocations, and others) are _not_ stored as
`ContentSpell` at all — they're redirected to `ContentClassOption` instead
(see `compendium/spells.ts`'s `detectClassOptionPool`). Open5e has no
equivalent redirection logic since its API has no such records mixed into
its spell endpoint.

### ContentMonster

| Column                                                                   | Open5e method                                                                                           | Compendium method                                                                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                   | passthrough                                                                                             | parsed (name-tag-stripped)                                                                                                                                     |
| `size`/`monsterType`/`alignment`                                         | passthrough (keyed lookup objects)                                                                      | passthrough (plain strings)                                                                                                                                    |
| `armorClass`                                                             | passthrough (`raw.armor_class`)                                                                         | parsed (`Number(raw.ac)`, `raw.ac` is `number \| string` in the raw XML)                                                                                       |
| `hitPoints`/`hitDice`                                                    | passthrough (two separate raw fields)                                                                   | parsed (single `"91 (14d8+28)"`-style string split via regex into both)                                                                                        |
| `speed`                                                                  | passthrough (`raw.speed_all`, already an object)                                                        | parsed (`"30 ft., fly 60 ft."`-style string parsed into `{walk, fly, ...}` via regex)                                                                          |
| `abilityScores`                                                          | passthrough (already an object)                                                                         | composed (6 separate raw scalar fields → one object)                                                                                                           |
| `savingThrows`/`skills`                                                  | passthrough (already keyed objects)                                                                     | parsed (`"Dex +5, Wis +3"`-style comma text parsed into keyed objects)                                                                                         |
| `damageResistances`/`Immunities`/`Vulnerabilities`/`conditionImmunities` | passthrough of a pre-split array (`.key` extracted, qualifiers **discarded**)                           | parsed (free-text semicolon/comma prose → composite object array via `shared/resistance.ts`, qualifiers **preserved**) — **incompatible value shapes, see §4** |
| `senses`                                                                 | composed (darkvision/blindsight/tremorsense/truesight/passive-perception fields joined into one string) | composed (raw `<senses>` + passive-perception joined)                                                                                                          |
| `languages`                                                              | passthrough (`raw.languages.as_string`)                                                                 | passthrough (`raw.languages`)                                                                                                                                  |
| `challengeRating`                                                        | inferred+parsed (`formatChallengeRating()` converts a raw float like `0.25` to `"1/4"`)                 | passthrough (already a fraction-formatted string/number in XML)                                                                                                |
| `actions`                                                                | parsed (filtered by `action_type` enum, dice composed from 3 separate fields via `composeAttackDice()`) | parsed (filtered by name-suffix convention `"(Bonus Action)"`/`"(Reaction)"`, dice parsed from a pipe-delimited `"Label\|ToHit\|Dice"` string)                 |
| `legendaryActions`                                                       | parsed (same action filter/compose as `actions`, `action_type === 'LEGENDARY_ACTION'`)                  | parsed (from a separate `<legendary>` element list, filtered to exclude lair actions and the "Legendary Actions" header entry)                                 |
| `description`                                                            | passthrough (`raw.description`)                                                                         | parsed (citation-stripped body text)                                                                                                                           |

### ContentItem

| Column               | Open5e method                                                                                                           | Compendium method                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`               | passthrough                                                                                                             | parsed (name-tag-stripped)                                                                                                                                                      |
| `itemType`           | inferred (armor category, or `raw.category.key` fallback)                                                               | inferred (single-letter type code → display string via `TYPE_TO_ITEM_TYPE` map; falls back to lowercased code)                                                                  |
| `rarity`             | passthrough (magic items only, `raw.rarity.key`)                                                                        | parsed (extracted from a combined `<detail>` string like `"rare (requires attunement by a warforged)"` via `parseDetail()`)                                                     |
| `requiresAttunement` | passthrough (magic items only)                                                                                          | parsed (regex test for `"attunement"` inside `<detail>`)                                                                                                                        |
| `cost`               | composed (`parseFloat` + `" gp"` suffix)                                                                                | composed (`${raw.value} gp`)                                                                                                                                                    |
| `weight`             | composed (`parseFloat` + `String()`)                                                                                    | passthrough (`String(raw.weight)`)                                                                                                                                              |
| `damage`             | composed (dice + damage-type key joined)                                                                                | composed (`raw.dmg1` + damage-type code lookup via `DAMAGE_TYPE_CODES`)                                                                                                         |
| `armorClass`         | passthrough (`String(a.ac_base)`, armor only)                                                                           | passthrough (`String(raw.ac)`)                                                                                                                                                  |
| `properties`         | parsed (`properties[].property.name` — a real live-data correction, the design doc originally assumed a shallower path) | inferred (comma-split single-letter codes → display names via `PROPERTY_CODES` map; `M` code specifically pulled out into `extraData.isMartial` rather than kept as a property) |
| `description`        | passthrough (`raw.desc`)                                                                                                | parsed (citation-stripped)                                                                                                                                                      |

### ContentClass / ContentSubclass

| Column                     | Open5e method                                                                                                                                                                                | Compendium method                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | passthrough                                                                                                                                                                                  | parsed (name-tag-stripped)                                                                                                                                    |
| `hitDie`                   | inferred, 5-level fallback chain: nested `hit_points.hit_dice` → a parsed `CORE_TRAITS_TABLE` markdown row → top-level `hit_dice` string → a feature-text scan → a hardcoded per-class table | inferred (`Number(raw.hd) \| 8`, direct XML attribute with a static fallback) |
| `primaryAbility`           | parsed (a `CORE_TRAITS_TABLE` markdown-pipe-table row, "and"/"or" logic detected via regex) with a `primary_abilities[]` API-field fallback                                                  | inferred (hardcoded `PRIMARY_ABILITY_BY_CLASS` table — no Compendium XML field states this concept at all, `<spellAbility>` is a different, narrower concept) |
| `savingThrows`             | parsed (same `CORE_TRAITS_TABLE` row)                                                                                                                                                        | parsed (`<proficiency>` text split into ability-name tokens vs. skill-name tokens by matching against a known ability-name set)                               |
| `armorProfs`/`weaponProfs` | parsed (`CORE_TRAITS_TABLE` rows, `"none"` → empty array)                                                                                                                                    | passthrough-ish (`<armor>`/`<weapons>` raw text kept as a single-element array unless `"none"`)                                                               |
| `skillChoices`             | parsed (`CORE_TRAITS_TABLE`'s "Skill Proficiencies" row → `parseProficiencyGrant()`)                                                                                                         | parsed (`<proficiency>`'s non-ability tokens, count from `<numSkills>`)                                                                                       |
| `spellcastingAbility`      | inferred (hardcoded `SPELLCASTING_ABILITY_BY_CLASS` table, gated on caster type)                                                                                                             | passthrough (`raw.spellAbility` — a real dedicated XML field Open5e's API has no equivalent for)                                                              |
| `description`              | passthrough                                                                                                                                                                                  | parsed (joined from the class's first `<trait>` element(s), citation-stripped)                                                                                |

Subclass: `name`/`description` follow the same passthrough/parsed split as
Class. `classId` resolution differs sharply by source — Open5e resolves it
in-process from the same API response's `subclass_of` field (both records
present in one fetch); Compendium resolves it via a **separate DB lookup
after insert**, cross-source-first (see §1).

### ContentRace / ContentSubrace

| Column                     | Open5e method                                                                                                                                                                                                                                                                                                                                    | Compendium method                                                                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | passthrough                                                                                                                                                                                                                                                                                                                                      | parsed (comma-split for parent/subrace name, then name-tag-stripped)                                                                                                                                                                                                                                            |
| `size`                     | parsed (a `"Size"`-named trait's prose text scanned for known size words, default `["medium"]`)                                                                                                                                                                                                                                                  | inferred (single-letter code → array via a lookup map, default `["medium"]`)                                                                                                                                                                                                                                    |
| `speed`                    | parsed (a `"Speed"`-named trait's prose scanned for a `"N feet"` pattern)                                                                                                                                                                                                                                                                        | parsed (`<speed>` + `<speedOther>` text, the latter regex-scanned for `fly`/`swim`/`climb` sub-speeds)                                                                                                                                                                                                          |
| `traits`                   | passthrough-ish (every non-size/speed trait copied as `{name, description, level:1}`) **plus** per-race hardcoded "lineage" sub-parsers (5 races only: Elf/Dragonborn/Gnome/Goliath/Tiefling) that split one combined 2024 lineage-choice trait into synthetic standalone Subrace rows, each with its own bespoke markdown-table or prose parser | composed (every raw field with no dedicated column — `<ability>`, `<resist>`, `<vulnerable>`, `<conditionResist>`, `<conditionImmune>`, `<proficiency>`, `<weapons>`, `<tools>`, `<languages>` — synthesized into `traits[]` entries with a fixed label, **and** kept verbatim in `extraData.raw*` as a backup) |
| `description`              | passthrough                                                                                                                                                                                                                                                                                                                                      | parsed (from a `"Description"`-named trait, citation-stripped; subrace descriptions additionally get a parent-paragraph-dedup pass, see §4)                                                                                                                                                                     |
| `parentRaceId` (Race only) | always `null` — Open5e's 2024 lineage races have no separate parent record                                                                                                                                                                                                                                                                       | always `null` — Race is never itself a subrace                                                                                                                                                                                                                                                                  |
| `raceId` (Subrace only)    | resolved in-process (2014/third-party path: real `is_subspecies:true` API record matched by `subspecies_of` key/name) **or** synthesized in-process (2024 path: no real parent lookup needed, the lineage option is derived from the same base-race record)                                                                                      | resolved via a **separate cross-source DB lookup after insert**, same pattern as Subclass→Class                                                                                                                                                                                                                 |

### ContentBackground

| Column           | Open5e method                                                                                                                                            | Compendium method                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | passthrough                                                                                                                                              | parsed (name-tag-stripped)                                                                                                                      |
| `proficiencies`  | parsed (per-`benefit.type` switch over `skill_proficiency`/`tool_proficiency` benefit prose → `parseProficiencyGrant()`, tagged `category: skill\|tool`) | parsed (`<proficiency>` element + a `"Tool Proficiency:"`-labeled `<trait>`, same `parseProficiencyGrant()` helper reused from Open5e's module) |
| `abilityBonuses` | inferred (hardcoded "distribute 3 points across named abilities, max +2" rule — the actual 2024 SRD rule, not per-record data)                           | inferred (same hardcoded rule, triggered by an `"Ability Scores:"`-labeled `<trait>` instead of a typed benefit)                                |
| `feature`        | passthrough-ish (each `feature`-typed benefit → `{name, description}`)                                                                                   | parsed (any `<trait>` whose name matches `/feature:/i` or `/^talent:/i`)                                                                        |
| `description`    | passthrough (`raw.desc`)                                                                                                                                 | parsed (from a `"Description"`-named trait, citation-stripped)                                                                                  |

### ContentFeat / ContentClassOption / ContentCondition

Open5e currently has **no transform at all** for Feat or ClassOption (0
rows always) — its API has no feat endpoint mapped into this app yet.
Condition is populated on both sides in principle but currently 0 rows on
both (real upstream/file gaps, not transform bugs — see §5).

Compendium ContentFeat: `name` (parsed, name-tag- and category-prefix-
stripped), `category` (inferred, colon-prefix mapped to one of 4 known
buckets or a `CLASS_SPECIFIC` catch-all), `prerequisite` (passthrough),
`description` (parsed, citation-stripped).

Compendium ContentClassOption: `pool` (parsed, from the spell record's
`<classes>` field via `detectClassOptionPool()` — see ContentSpell above),
`name`/`description` (parsed, same as Feat), `classId` — **currently always
`null`**, no resolution logic exists yet to link a Maneuver/Metamagic/etc.
option back to the class that grants it.

---

## 4. Real cross-source shape conflicts (the hard part)

1. **`ContentMonster.damageResistances`/`damageImmunities`/`damageVulnerabilities`/`conditionImmunities`** — a real dedicated column, not extraData, and the two sources write incompatible array-element shapes to it _today_, in production:

   ```json
   // Open5e:      ["acid"]
   // Compendium:  [{"type":"radiant"}]  or  [{"types":["acid","cold","fire"],"nonmagical":true,"bypassedBy":"silvered weapons"}]
   ```

   Open5e's shape is flatter but lossy (no qualifier support at all — "resistant to bludgeoning/piercing/slashing from nonmagical attacks" can't be represented, only the bare type list). Compendium's is richer but never gets simplified back down even for the common single-type case (`{type: "x"}` for the simple case, `{types: [...], nonmagical, bypassedBy}` only for compound cases — see `shared/resistance.ts`). This is the single highest-priority shape decision, because it's already live on a real column both sources write to, not a hypothetical extraData promotion.

2. **`ContentSpell` upcast/scaling data**: Open5e's `extraData.castingOptions` (`{type: "slot_level_N", damage_roll, target_count, duration, range, concentration, shape_size, desc}`, all nullable except `type`) vs. Compendium's `extraData.scalingDice` (`{dice, description, level}`, no room for range/duration/shape changes) are the same real-world fact with zero shared field names. A unified shape needs new design, not a pick-one-side decision.

3. **`ContentClass`/`ContentSubclass.extraData.features`**: Open5e's `{name, description, type, levels: number[]}` (one entry can recur at several levels) vs. Compendium's `{name, description, level: number}` (singular, no type tag — the Compendium's `<autolevel level="N">` structure has no native way to say "this same feature also appears at levels 8/12/16," so it would show up as several separately-named entries instead if that data existed at all).

4. **`ContentItem.isMartial`**: same key, same nominal boolean meaning, but Compendium's is a live bug (constant `false` on all 5,967 rows regardless of real weapon type — the `M` property code doesn't mean what the transform assumed) while Open5e's is trustworthy (real 153/301 split). Needs a Compendium-side fix before either can feed a shared column.

5. **`ContentMonster.extraData.proficiencyBonus`**: same key/shape, but Compendium defaults to `0` on 54.5% of rows instead of falling back to CR-based inference the way Open5e already does (`inferProficiencyBonus(cr)`, `open5e/monsters.ts` — directly reusable for the Compendium side, not new logic).

6. **One-sided concepts** — real on one source, structurally absent (not broken) on the other, so "unify" here really means "decide whether the missing side needs new extraction logic or the column stays source-specific/nullable":
   - Open5e-only: `category`/`subcategory` (Monster), `experiencePoints` (Monster), `targetType`/`targetCount`/shape-AoE cluster/`savingThrow`/`damageRoll`/`damageTypes` (Spell — Compendium's spell prose isn't parsed for any of these), `casterType` (Class).
   - Compendium-only: `ancestry`/`environment`/`telepathyRange` (Monster), `toolProfs`/`slotsReset` (Class), the entire citation/name-tag cluster (`page`, `edition`, `homebrew`, `thirdParty`, `unearthedArcana`, `otherTags`, `additionalCitations` — present on every Compendium content type, absent from every Open5e content type since Open5e has no per-record citation or edition-tagging concept, only a per-`Source` document key).

7. **Clean matches, safe to unify as-is** (included for completeness/contrast — not everything is a conflict): `ContentBackground.grantedFeat` (`{name}`, byte-identical shape both sides), `ContentItem.properties` (`{name, detail?}`, byte-identical, and already a dedicated column), `ContentBackground.equipment` (free text, same intent both sides, only a cosmetic markdown-emphasis difference).

---

## 5. Full extraData catalog, both sources, with examples

### ContentSpell

**Open5e**: `targetType`, `targetCount`, `shapeSizeUnit` (near/fully
constant, low signal), `savingThrow` (real 6-value ability
enum), `castingOptions` (array, see §4 example above), `damageRoll` (dice string,
e.g. `"4d4"`), `damageTypes` (array, e.g. `["acid"]`), `materialConsumed`
(implicit boolean), `shapeType` (`sphere`/`cube`/`cone`/`line`),
`shapeSize` (integer), `attackRoll` (implicit boolean),
`reactionCondition` (rare text), `materialCost` (text).

**Compendium**: `page`, `edition`, `scalingDice` (array, see §4 example),
`thirdParty`, `homebrew`, `otherTags`, `additionalCitations`,
`unearthedArcana`.

### ContentMonster

**Open5e**: `traits` (array `{name, description}`), `proficiencyBonus`
(int, real 2–9), `legendaryResistances` (int), `armorClassDetail` (text,
near-constant `"natural armor"`), `spellcasting` (object, see §4),
`experiencePoints` (int, real range), `category`/`subcategory` (text).

**Compendium**: `traits` (same shape, `Proficiency Bonus`/`Legendary
Resistance` traits pre-extracted out), `proficiencyBonus` (int, **0 on
54.5%** — see §4 item 5), `legendaryResistances` (int), `edition`,
`homebrew`, `thirdParty`, `unearthedArcana`, `otherTags`, `page`,
`additionalCitations`, `lairActions` (array `{name, description}`),
`spellcasting` (object, same nominal shape, lower reliability), `telepathyRange` (int, e.g. 60/120/30),
`environment` (free text), `ancestry` (text grouping key, e.g. `"Hag"`, `"Bulette"`).

### ContentItem

**Open5e**: `size` (constant `"tiny"` — dead, do not use), `isSimple`,
`isMartial` (real, trustworthy), `isImprovised` (constant `false`),
`strRequired`, `stealthDisadvantage`, `maxDexBonus`, `addDexMod`,
`acDisplay` (derived display string), `attunementDetail`, `range` (with
`" ft."` unit suffix).

**Compendium**: `isMartial` (constant `false` — **broken**, see §4 item
4), `edition`, `homebrew`, `thirdParty`, `unearthedArcana`, `otherTags`,
`page`, `additionalCitations`, `attunementDetail`, `range` (no unit
suffix, e.g. `"20/60"`), `strRequired`, `stealthDisadvantage`.

### ContentClass / ContentSubclass

**Open5e**: `features` (array, `{name, description, type, levels[]}`),
`casterType` (`FULL`/`HALF`/`NONE`/`PACT`, Class only).

**Compendium**: `features` (array, `{name, description, level}` —
different shape, see §4 item 3), `edition`, `homebrew`, `thirdParty`,
`unearthedArcana`, `otherTags`, `toolProfs` (text, Class only), `slotsReset`
(`"L"`/`"S"`, Class only), `page`, `unresolvedClassName` (Subclass only,
when parent resolution fails).

### ContentRace / ContentSubrace

**Open5e**: none — `extraData` is `null` on every row; everything routes
through `traits[]` instead (a deliberate Phase 2 design choice, not a gap).

**Compendium**: `edition`, `homebrew`, `thirdParty`, `unearthedArcana`,
`otherTags`, `page`, `creatureType` (text — real variety beyond
"Humanoid": Fiend/Elemental/Dragon/Undead/full-sentence qualifiers),
`rawAbility`/`rawResist`/`rawVulnerable`/
`rawConditionResist`/`rawConditionImmune`/`rawProficiency`/`rawWeapons`/
`rawTools`/`rawLanguages` (raw backup text for each field that's also
synthesized into `traits[]`, per the resolved design question), plus (Subrace only)
`descriptionStrippingSkipped` (boolean, **`true` on literally every one of
142 rows** — the dedup-stripping mechanism has never once actually
stripped anything in live data) and `unresolvedRaceName` (when parent resolution fails —
**60/142 rows, 42%**, mostly because the named parent, e.g. Half-Elf,
Half-Orc, Genasi, Merfolk, isn't a real SRD-2024 race at all, so there's
nothing to resolve to).

### ContentBackground

**Open5e**: `grantedFeat` (`{name}`), `equipment` (free text),
`languages` (free text), `adventures_and_advancement`/
`connection_and_memento` (free text, 2014-style benefit passthrough),
`unrecognizedBenefits` (array, catch-all for any benefit type the switch
doesn't handle).

**Compendium**: `page`, `grantedFeat` (`{name}`, same shape as Open5e's),
`equipment` (free text, same intent), `unrecognizedTraits` (array
`{name, description}` — real, common, 150/223 rows, carrying genuinely
valuable content like `"Suggested Characteristics"` roleplay prompts, not
just malformed data), `edition`, `thirdParty`,
`otherTags`, `homebrew`.

### ContentFeat (Compendium only — Open5e has no Feat data at all)

`edition`, `homebrew`, `thirdParty`, `unearthedArcana`, `otherTags`,
`rawCategory` (text, when the category prefix didn't map to a known bucket
— real values: `"Dragonmark"`, `"Path of the Lich"`, `"Dark Gift"`, etc.),
`page`, `additionalCitations`, `special` (text, sometimes duplicates
category info, e.g. `"Fighting Style: Archery"`), `modifiers` (array
`{category, text}` — structured mechanical modifier entries).

### ContentClassOption (Compendium only)

`page`, `edition` — that's the entire real key set; this table is the
simplest by far, consistent with being newly
synthesized from spell-schema-shaped records rather than a native rich
Compendium record type.

### ContentCondition

No real data on either side currently (0 rows both). The schema comment
documents `descriptionSource`/`requestedSource` (Open5e, when a
document-specific description fallback was used) and `icon` (Open5e) as
the intended keys, never yet exercised with real rows.

---

## 6. Open questions this document exists to support

1. Pick (or design) one shape for monster damage resistance/immunity/
   vulnerability/condition-immunity arrays that can represent both the
   simple Open5e case and the qualifier-bearing Compendium case without
   losing information either way.
2. Pick (or design) one shape for spell scaling-by-level/slot data that
   can hold Compendium's per-character-level dice+description and Open5e's
   per-slot-level dice+range+duration+shape variants.
3. Decide whether class/subclass `features` should normalize to
   Open5e's multi-level-per-entry granularity, Compendium's
   one-entry-per-level granularity, or a third shape — and whether that
   decision should also apply to a real relation table instead of staying
   JSON.
4. Fix `ContentItem.extraData.isMartial` on the Compendium side (the `M`
   property code's real meaning needs to be determined) before treating it
   as a promotable column.
5. Fix `ContentMonster.extraData.proficiencyBonus`'s missing CR-fallback
   on the Compendium side (straightforward — reuse `inferProficiencyBonus`).
6. For every "one-sided" key in §4 item 6: decide per-key whether it's
   worth writing new extraction logic for the source that's currently
   missing it, or whether the column should just stay nullable/
   source-specific.
7. Independent of any column decision: `ContentSubrace.descriptionStrippingSkipped`
   being `true` on 100% of rows suggests the safeguarded stripping
   mechanism itself may need a look, regardless of what happens to the
   surrounding schema.

---

# DragonLedger DatabaseApp — Schema Expansion Design Handoff

> **Purpose of this document:** self-contained handoff from a design session that
> worked through the open questions in the review document above. It contains
> the decisions made, the updated Prisma models, and a checklist for Claude
> Code to implement directly. See the session log below for how each
> decision was reached.

**Session date:** August 5, 2026

## 1. Decisions made

### 1.1 Monster resistances/immunities/vulnerabilities/condition immunities

**Decision:** unified shape for all four dedicated columns:

```json
[{ "types": ["fire"], "nonmagical": false, "bypassedBy": null }]
```

Both sources write to this shape. Open5e maps its flat `["acid"]` array in
losslessly (`types: ["acid"], nonmagical: false, bypassedBy: null`). Compendium's
existing composite output already matches this shape via `shared/resistance.ts`.

**Reasoning:** this is a real, already-shipped column both importers write to
today with genuinely incompatible shapes, not a hypothetical extraData
promotion. The character sheet app needs to know whether a resistance is
conditional (nonmagical attacks, unless silvered) to correctly decide whether
to halve incoming damage, so the qualifier can't be dropped even though display
is plain text. Plain text gets derived from this structure at render time; it
doesn't replace it.

**Fix included:** Open5e's transform currently reads only the flat
`damage_resistances`/etc. arrays and discards the paired `damage_resistances_display`/etc.
string fields the API also returns. Those display strings are standard 5e
stat-block prose and should be run through the same composite parser Compendium
uses, rather than writing separate parsing logic per source.

**Caveat:** the sample record used to confirm this (Aboleth) has all `_display`
fields empty, since it has no resistances. Pull a real monster with a known
qualified resistance (CR 8+) and check the actual populated string shape before
finalizing the parser.

`bypassedBy` stays free text (not an enum) for now. Real Compendium data on it
is too sparse to build a taxonomy from yet.

### 1.2 Spell scaling (upcast damage / cantrip growth)

**Decision:** unified shape, replacing both `extraData.castingOptions` (Open5e)
and `extraData.scalingDice` (Compendium) with one key, `extraData.scaling`:

```json
{ "trigger": "slot_level" | "character_level", "triggerValue": number | null, "dice": string, "description": string | null }
```

**Reasoning:** the character sheet app needs to calculate scaling damage, same
requirement as the resistance case, so the shape has to be queryable, not just
displayable. The `trigger` type is decided from `ContentSpell.level` (an
existing dedicated column) rather than guessed: `level === 0` means character-level
scaling (cantrips), anything else means slot-level scaling (upcasting). This
resolves a real ambiguity found during design: Compendium's `<roll level="N">`
element means different things depending on what kind of spell it's attached to,
and the existing spell-level column already disambiguates it cleanly.

Open5e's `castingOptions` schema anticipates non-damage upcast changes
(duration/range/concentration/shape_size varying per slot), but every sampled
record has these as null. They're intentionally dropped from the unified shape
rather than carried forward unused. If real data ever populates them, that's a
small additive migration later.

`ContentSpell.higherLevels` (free-text "At Higher Levels" prose) stays as its
own column alongside `extraData.scaling` — structured data for calculation,
prose for flavor/edge cases.

**Open item, not resolved here:** Compendium's "Aura of Vitality" case has
`level: null` (a scaling effect not tied to any specific level or slot). Not
enough examples to know if this is common. Worth a manual check once real
queries are running against the new shape, rather than forcing a rule from one
example.

### 1.3 Class/Subclass features

**Decision:** new relation table, not a JSON blob.

```prisma
model ContentClassFeature {
  id          String           @id @default(cuid())
  classId     String?
  class       ContentClass?    @relation(fields: [classId], references: [id], onDelete: Cascade)
  subclassId  String?
  subclass    ContentSubclass? @relation(fields: [subclassId], references: [id], onDelete: Cascade)
  level       Int
  name        String
  description String
  type        String?

  @@index([classId, level])
  @@index([subclassId, level])
}
```

A row belongs to exactly one of `classId`/`subclassId`; the other stays null.
`type` carries Open5e's feature-type tag when known, stays null on Compendium
rows (its XML has no equivalent). Open5e's grouped `{levels: [4,8,12,16]}`
entries explode into one row per level to match Compendium's native
granularity.

**Reasoning:** the character sheet app needs to query features by level ("what
does a level 7 Barbarian have"), and once the data is one-row-per-level anyway,
that's relational data, not blob data. A real table with an indexed `level`
column gives a normal `WHERE classId = X AND level <= 7` instead of a
`json_each` scan on every read, which matters given this gets called on every
level-up and every character sheet render.

**Named tradeoff:** exploding means a recurring feature (e.g. Ability Score
Improvement at levels 4/8/12/16) shows up as multiple same-named rows if
listing "all of a class's features" in one view rather than "features at level
N." Correct for the query pattern described, worth knowing about ahead of time.

### 1.4 Bug fixes (no schema change)

**`ContentItem.extraData.isMartial` (Compendium, constant `false`):**
`Compendium_Structure.md`'s own code tables show a likely root cause: `<item><type>`
uses `M` for "Melee Weapon" while `<item><property>` uses `M` for "Martial" —
same letter, different fields, different meanings. The fix is to split
`<property>` on commas and check for an exact `M` token, then set `isMartial`
from that and `isSimple` as its inverse. Verify against known martial weapons
(Longsword, Greatsword) before trusting. **(Investigated during implementation
and found to be a false premise — see the implementation log below.)**

**`ContentMonster.extraData.proficiencyBonus` (Compendium, defaults to `0` on
54.5% of rows):** add the same `inferProficiencyBonus(cr)` fallback Open5e's
transform already has, for records with no "Proficiency Bonus" trait.

### 1.5 One-sided key decisions

**`ContentMonster.experiencePoints`:** promoted to a real `Int` column (moved
out of `extraData`), computed from `challengeRating` via the standard 5e
CR-to-XP table for both sources, rather than left as a raw passthrough Open5e
has and Compendium structurally can't (its XML has no XP field at all).

**Compendium spell prose-parsing (new):** `savingThrow`, `damageRoll`,
`damageTypes`, `materialConsumed`, `attackRoll` currently exist only for
Open5e (parsed from its structured API response). New extraction is worth
writing against Compendium's spell description prose ("make a Dexterity saving
throw," "the spell consumes the material component"), since the character
sheet app needs these queryable regardless of source. Same best-effort caveat
as every other prose-parsed field in this pipeline — validate against a real
sample before trusting broadly.

**`ContentClass.extraData.casterType` (Compendium, currently absent):**
inferred rather than left Open5e-only:

- `spellcastingAbility` is null → `NONE`
- `slotsReset === "S"` (short rest recovery, the defining trait of Pact
  Magic) → `PACT`
- `slotsReset === "L"` alone cannot distinguish `FULL` from `HALF` (both full
  and half casters reset on long rest), so this needs a new hardcoded
  per-class lookup table for that split — the same pattern the Open5e
  transform already uses for `SPELLCASTING_ABILITY_BY_CLASS`. This is a
  correction to the original framing of "infer from slotsReset +
  spellcastingAbility alone," which can only reliably resolve NONE and PACT.

**`ContentRace`/`ContentSubrace` `creatureType` and related fields (new
Open5e-side parsing):** Open5e's `extraData` is currently `null` on every race
row by original design — everything routes through `traits[]` prose. **Not
implemented — a false premise, see the implementation log below**: verified
against all 9 real SRD-2024 species that none has a trait resembling
"Creature Type"/"Ability Score"/"Proficiency"/"Languages"/"Weapon"/"Tool" at
all — 2024 species restructured these concepts entirely, so writing a parser
against fields that don't exist in the only real dataset available would have
been dead code.

**Left as-is, no action:**

- `ContentMonster.category`/`subcategory` and `ContentSpell.targetType`/`targetCount`/shape
  cluster: already flagged as low-signal/near-constant in the original audits,
  not worth building missing-side extraction for weak data.
- The citation/tag cluster (`page`, `edition`, `homebrew`, `thirdParty`,
  `unearthedArcana`, `otherTags`): not a real gap. Open5e's `sourceId` already
  encodes "which document" — just via a different mechanism (one Source row per
  API document vs. one per cited book).

### 1.6 Known issue, deferred

`ContentSubrace.extraData.descriptionStrippingSkipped` is `true` on all 142
real Compendium subraces — the safeguarded paragraph-dedup mechanism has never
once actually stripped anything in practice. Flagged as a known issue for
separate investigation (either the heuristic is too conservative or the
parent/subrace paragraph-matching assumption doesn't hold in real data).
Explicitly not part of this schema migration. **Still open as of v1.0.0.**

## 2. Updated Prisma models

Only models with schema-level changes are shown in full below. Unchanged at
the schema level: `Source`, `ImportJob`, `ContentItem`, `ContentRace`,
`ContentSubrace`, `ContentBackground`, `ContentCondition`, `ContentFeat`,
`ContentClassOption`, `Language`.

```prisma
model ContentMonster {
  id                    String  @id @default(cuid())
  slug                  String
  sourceId              String
  source                Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name                  String
  size                  String
  monsterType           String
  alignment             String
  armorClass            Int
  hitPoints             Int
  hitDice               String
  speed                 String  // JSON
  abilityScores         String  // JSON
  savingThrows          String?
  skills                String?
  damageResistances     String? // JSON array: [{ types: string[], nonmagical: boolean, bypassedBy: string | null }]
  damageImmunities      String? // same shape as damageResistances
  damageVulnerabilities String? // same shape as damageResistances
  conditionImmunities   String? // same shape as damageResistances (types = condition names)
  senses                String?
  languages             String?
  challengeRating       String
  experiencePoints      Int     // computed from challengeRating at import time, both sources
  actions               String  // JSON array, each tagged actionType: "action"|"bonus"|"reaction"
  legendaryActions      String?
  description           String?
  extraData             String? // armorClassDetail, lairActions, traits[], spellcasting,
  // proficiencyBonus, legendaryResistances, category/subcategory,
  // ancestry, environment, telepathyRange (Compendium only)

  @@unique([sourceId, slug])
  @@index([challengeRating])
  @@index([monsterType])
}

model ContentSpell {
  id            String  @id @default(cuid())
  slug          String
  sourceId      String
  source        Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name          String
  level         Int
  school        String
  castingTime   String
  range         String
  components    String
  material      String?
  duration      String
  concentration Boolean
  ritual        Boolean
  classes       String  // JSON array of class display names
  description   String
  higherLevels  String? // free-text "At Higher Levels" prose, kept alongside extraData.scaling
  extraData     String? // scaling[] (both sources, shape below), damageRoll, damageTypes,
  // savingThrow, attackRoll, materialConsumed (both sources after this pass),
  // targetType/targetCount, shape info, reactionCondition, materialCost
  // scaling entry shape: { trigger: "slot_level" | "character_level",
  //   triggerValue: number | null, dice: string, description: string | null }

  @@unique([sourceId, slug])
  @@index([level])
  @@index([school])
}

model ContentClass {
  id                  String  @id @default(cuid())
  slug                String
  sourceId            String
  source              Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name                String
  hitDie              Int
  primaryAbility      String  // JSON: { abilities: string[], logic: "AND"|"OR" }
  savingThrows        String  // JSON array
  armorProfs          String  // JSON array
  weaponProfs         String  // JSON array
  skillChoices        String  // JSON, Fixed/Choice Grant Shape
  spellcastingAbility String?
  description         String
  extraData           String? // casterType (FULL/HALF/NONE/PACT, both sources after this pass),
  // toolProfs/slotsReset (Compendium only)

  subclasses   ContentSubclass[]
  classOptions ContentClassOption[]
  features     ContentClassFeature[]

  @@unique([sourceId, slug])
}

model ContentSubclass {
  id          String        @id @default(cuid())
  slug        String
  sourceId    String
  source      Source        @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  classId     String? // nullable per Phase 4, was required with onDelete: NoAction originally
  class       ContentClass? @relation(fields: [classId], references: [id], onDelete: SetNull)
  name        String
  description String
  extraData   String? // unresolvedClassName if cross-source resolution (see Compendium docs) fails

  features ContentClassFeature[]

  @@unique([sourceId, slug])
}

model ContentClassFeature {
  id          String           @id @default(cuid())
  classId     String?
  class       ContentClass?    @relation(fields: [classId], references: [id], onDelete: Cascade)
  subclassId  String?
  subclass    ContentSubclass? @relation(fields: [subclassId], references: [id], onDelete: Cascade)
  level       Int
  name        String
  description String
  type        String? // Open5e's feature-type tag when known (e.g. CLASS_LEVEL_FEATURE); null on Compendium rows

  @@index([classId, level])
  @@index([subclassId, level])
}
```

**Relations & FK behavior for the new table:** `ContentClassFeature` has no
direct `sourceId`; it cascades transitively. Deleting a `Source` cascades to
`ContentClass`/`ContentSubclass` rows (existing behavior), which cascade to
their `ContentClassFeature` rows via the `onDelete: Cascade` on both FKs above.
A feature row must have exactly one of `classId`/`subclassId` set; this isn't
enforceable at the Prisma schema level and should be validated in the transform
layer before insert.

## 3. Implementation Instructions for Claude Code (historical — already executed)

1. Add the `ContentClassFeature` model to `schema.prisma`. Add
   `features ContentClassFeature[]` to `ContentClass` and `ContentSubclass`.
2. Add `experiencePoints Int` to `ContentMonster`; remove it from that model's
   `extraData` comment.
3. Run `prisma migrate dev --name schema-expansion-phase-1`.
4. Update the Open5e monster transform to write `experiencePoints` to the new
   column (existing passthrough value, just relocated).
5. Update the Compendium monster transform to compute `experiencePoints` from
   `challengeRating` via the standard 5e CR-to-XP table (Compendium's XML has
   no XP field, so this is a new computed value, not a passthrough).
6. Update the Open5e monster transform to read `damage_resistances_display`/`damage_immunities_display`/`damage_vulnerabilities_display`/`condition_immunities_display`
   and parse them through the same composite parser Compendium uses in
   `shared/resistance.ts`, replacing the current flat-array passthrough. Pull
   one real monster with a known qualified resistance and check the actual
   `_display` string format before finalizing the regex.
7. Update the Compendium spell transform to output `extraData.scaling` in the
   unified shape (rename from `scalingDice`), setting `trigger` from
   `spell.level` (`0` → `character_level`, else `slot_level`).
8. Update the Open5e spell transform to output `extraData.scaling` in the
   unified shape (rename from `castingOptions`), dropping the unused
   duration/range/concentration/shape_size fields.
9. Write new Compendium spell prose-parsers for `savingThrow`, `damageRoll`,
   `damageTypes`, `materialConsumed`, `attackRoll`. Validate output against a
   representative sample of real spells before merging.
10. Build `ContentClassFeature` population logic in both transforms: explode
    Open5e's grouped `levels[]` features into one row per level; write
    Compendium's already-one-row-per-level features directly. Remove
    `features` from both models' `extraData` comments once migrated.
11. Fix the Compendium item transform's `isMartial` derivation: check for an
    exact `M` token in the comma-split `<property>` list (not `<type>`), set
    `isSimple` as the inverse. Verify against known martial weapons (Longsword,
    Greatsword) in a real import before trusting.
12. Add the `inferProficiencyBonus(cr)` fallback (already written for Open5e)
    to the Compendium monster transform's `proficiencyBonus` derivation.
13. Add `casterType` inference to the Compendium class transform:
    `spellcastingAbility === null` → `NONE`; `slotsReset === "S"` → `PACT`;
    otherwise consult a new hardcoded per-class `FULL`/`HALF` lookup table.
14. Write a new Open5e race trait parser to extract `creatureType` (and other
    fields Compendium already captures) from `traits[]` prose into
    `extraData`, matching Compendium's existing key names where the concept
    lines up.
15. File `ContentSubrace.extraData.descriptionStrippingSkipped` being `true`
    on 100% of real subraces as a separate known-issue ticket. Not part of
    this migration; do not attempt to fix inline.
16. After implementation, re-run all three extraData frequency audits
    against fresh imports to confirm the shapes actually converge and the two
    bug fixes (`isMartial`, `proficiencyBonus`) produced real, sane
    distributions rather than a different constant value.

---

# Session Log — Schema Expansion Design Conversation

**Date:** August 5, 2026
**Participants:** project owner, Claude (Sonnet 5)
**Purpose:** work through the open questions in the design review above and
decide how to unify the Open5e/Compendium extraData shapes.
**Output:** the handoff document above

## Session flow

**1. Context gathering.** Reviewed the four uploaded documents (both audits,
the combined audit, and the design review) plus the project's schema brief and
API reference docs to understand the two import pipelines, the current
`schema.prisma`, and every documented shape conflict between Open5e and
Compendium.

**2. Resistance/immunity/vulnerability shape.**

- Asked how the read side should display resistances (badges vs. full
  qualifiers vs. hybrid), and how to sequence the two known Compendium bugs.
- Answer: display is plain text, but the real goal is the character sheet app
  needing to programmatically determine whether a hit should be halved.
- This reframed the decision from a display question to a data-contract
  question. Proposed a unified `{types, nonmagical, bypassedBy}` shape;
  confirmed.
- Follow-up: asked whether Open5e's side of the qualifier data could be
  recovered via regex. Found that Open5e's API already returns
  `_display` string fields alongside the flat arrays, currently unused by the
  transform, rather than requiring new extraction from nothing.
- **Decision locked.**

**3. Spell scaling shape.**

- Asked three questions: whether Heroes needs to calculate scaling damage,
  whether cantrip vs. slot-level scaling should be tagged explicitly, and
  whether structured data should replace or supplement the existing
  `higherLevels` prose column.
- Answers: needs to be calculable; tag explicitly; keep both structured data
  and prose.
- While mapping the two source shapes, found a real ambiguity: Compendium's
  `<roll level="N">` element means character level for cantrips but spell slot
  level for leveled spells — same field, context-dependent meaning. Resolved
  using the existing `ContentSpell.level` column to disambiguate rather than
  guessing.
- Proposed `{trigger, triggerValue, dice, description}`, flagged two edge
  cases (unobserved non-damage upcast fields, a `level: null` outlier) as
  explicit assumptions rather than silently deciding them.
- **Decision locked.**

**4. Class/Subclass features shape.**

- Asked whether Heroes needs to query by level, whether this should become a
  real relation table instead of JSON, and which granularity to normalize to.
- Answers: needs to be queryable; wanted a recommendation on the table
  question; chose to explode to one-row-per-level.
- Recommended a real `ContentClassFeature` relation table given the query
  pattern and the now-settled one-row-per-level granularity, with reasoning
  (indexed queries vs. JSON scans on a hot path). Named the tradeoff
  (duplicate-looking rows for recurring features) explicitly.
- **Decision locked.**

**5. Remaining smaller items.** Asked how to handle the rest (walk through
each vs. bundle as implementation notes vs. defer). Chose to walk through
each.

- **isMartial bug (Compendium):** identified a likely root cause directly from
  the project's own `Compendium_Structure.md` — an `M` code collision between
  `<item><type>` (Melee) and `<item><property>` (Martial). Proposed as an
  implementation fix, confirmed.
- **proficiencyBonus bug (Compendium):** straightforward reuse of Open5e's
  existing CR-inference helper. Confirmed.
- **One-sided keys batch:** sorted into "no action needed" (low-signal fields
  already flagged weak in the audits, and the citation/tag cluster which
  isn't a real gap), one proposed free win (compute `experiencePoints` from
  `challengeRating` instead of treating it as source-dependent), and three
  real decisions (Compendium spell prose-parsing for
  savingThrow/damageRoll/damageTypes/materialConsumed/attackRoll; casterType
  inference for Compendium classes; and, raised separately afterward, Open5e
  race trait parsing for creatureType). All confirmed yes.
  - Correction made during casterType design: the originally-proposed
    inference method (`slotsReset` + `spellcastingAbility` presence alone)
    can only reliably resolve `NONE` and `PACT`. Flagged that `FULL`/`HALF`
    needs an additional hardcoded per-class table, since both caster tiers
    reset on long rest and nothing in the raw data distinguishes them.
- **descriptionStrippingSkipped (100% true on all subraces):** confirmed as a
  known issue, filed for separate investigation, explicitly kept out of this
  migration's scope.

**6. Handoff.** Produced the handoff document above and this log.

## Decisions at a glance

| # | Item | Outcome |
| --- | --- | --- |
| 1 | Monster damage resistance/immunity/vulnerability shape | Unified `{types, nonmagical, bypassedBy}`; Open5e switches to its unused `_display` fields |
| 2 | Spell scaling shape | Unified `{trigger, triggerValue, dice, description}`; trigger decided from `spell.level` |
| 3 | Class/Subclass features | New `ContentClassFeature` relation table, one row per level |
| 4 | Compendium `isMartial` bug | Fix: check `<property>` list for exact `M`, not `<type>` — **found to be a false premise during implementation** |
| 5 | Compendium `proficiencyBonus` bug | Fix: reuse existing `inferProficiencyBonus(cr)` fallback |
| 6 | Monster `experiencePoints` | Promoted to real column, computed from CR for both sources |
| 7 | Spell savingThrow/damageRoll/damageTypes/materialConsumed/attackRoll | New Compendium-side prose-parsing |
| 8 | Class `casterType` | New Compendium-side inference (spellcastingAbility + slotsReset + new per-class table) |
| 9 | Race/Subrace `creatureType` and related | New Open5e-side parsing — **found to be a false premise during implementation, not built** |
| 10 | `descriptionStrippingSkipped` at 100% | Filed as known issue, deferred |
| — | Monster category/subcategory, spell target/shape cluster, citation/tag cluster | No action, low signal or not a real gap |

## Open items carried into the handoff doc, not resolved this session

- Whether Compendium's `level: null` scaling entries (e.g. "Aura of Vitality")
  represent a real pattern or a one-off — needs checking against more real
  data.
- Whether Open5e's `castingOptions` non-damage upcast fields
  (duration/range/concentration/shape_size) ever actually populate anywhere
  in the wild; currently assumed unused and dropped from the unified shape.
- Root-cause investigation of `descriptionStrippingSkipped`, deferred to a
  separate ticket by design.
