# Schema Expansion Design Review

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

Companion documents (same repo, more granular per-source detail, not
required reading to use this one — everything load-bearing is repeated
here): `extradata-key-frequency-audit.md` (Open5e only),
`extradata-key-frequency-audit-compendium.md` (Compendium only),
`extradata-key-frequency-audit-combined.md` (side-by-side + shape-conflict
detail this document summarizes in §4).

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
     source, *and* this record's cited book has a known mapping to an
     Open5e document key — see `COMPENDIUM_TO_OPEN5E_SOURCE` in
     `sourceBooks.ts`) → pause the whole job as `AWAITING_CONFIRMATION`
     the first time this happens, surfacing every pending match to the
     user; the caller resumes with `duplicateDecision: 'duplicate' |
     'skip'`, applied to the *entire batch* at once, not per-record.
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

## 2. Full current Prisma schema

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

| Column | Open5e method | Compendium method |
|---|---|---|
| `name` | passthrough (`raw.name`) | parsed (name-tag-stripped `tags.name`) |
| `level` | passthrough | passthrough (`Number(raw.level)`) |
| `school` | passthrough (`raw.school.key`) | inferred (single-letter code → full name via `SCHOOL_CODES` map; falls back to lowercased raw value if code unrecognized) |
| `castingTime`/`range`/`duration` | passthrough | passthrough |
| `components` | composed (V/S/M flags → `"V, S, M"` string) | passthrough (`raw.components` is already a formatted string in the XML) |
| `material` | passthrough (`raw.material_specified`) | **not populated** (`null` — Compendium's `<components>` doesn't separately break out material text) |
| `concentration` | passthrough (`raw.concentration` boolean) | parsed (regex test for `"concentration"` in the duration string) |
| `ritual` | passthrough (`raw.ritual` boolean) | parsed (presence of the `<ritual>` element at all, `raw.ritual !== undefined`) |
| `classes` | passthrough (mapped from an array of class objects) | parsed (comma-split of the `<classes>` text field) |
| `description` | passthrough (`raw.desc`) | parsed (citation-stripped body text, see `citation.ts`) |
| `higherLevels` | passthrough (`raw.higher_level`) | **not populated** (`null` — no separate field in Compendium XML; upcast text stays embedded in `description`) |

**Compendium-only content hijacking this same table's schema**: records
whose `<classes>` field matches a `"<Pool> Options"` pattern (Maneuvers,
Metamagic, Eldritch Invocations, and others) are *not* stored as
`ContentSpell` at all — they're redirected to `ContentClassOption` instead
(see `compendium/spells.ts`'s `detectClassOptionPool`). Open5e has no
equivalent redirection logic since its API has no such records mixed into
its spell endpoint.

### ContentMonster

| Column | Open5e method | Compendium method |
|---|---|---|
| `name` | passthrough | parsed (name-tag-stripped) |
| `size`/`monsterType`/`alignment` | passthrough (keyed lookup objects) | passthrough (plain strings) |
| `armorClass` | passthrough (`raw.armor_class`) | parsed (`Number(raw.ac)`, `raw.ac` is `number \| string` in the raw XML) |
| `hitPoints`/`hitDice` | passthrough (two separate raw fields) | parsed (single `"91 (14d8+28)"`-style string split via regex into both) |
| `speed` | passthrough (`raw.speed_all`, already an object) | parsed (`"30 ft., fly 60 ft."`-style string parsed into `{walk, fly, ...}` via regex) |
| `abilityScores` | passthrough (already an object) | composed (6 separate raw scalar fields → one object) |
| `savingThrows`/`skills` | passthrough (already keyed objects) | parsed (`"Dex +5, Wis +3"`-style comma text parsed into keyed objects) |
| `damageResistances`/`Immunities`/`Vulnerabilities`/`conditionImmunities` | passthrough of a pre-split array (`.key` extracted, qualifiers **discarded**) | parsed (free-text semicolon/comma prose → composite object array via `shared/resistance.ts`, qualifiers **preserved**) — **incompatible value shapes, see §4** |
| `senses` | composed (darkvision/blindsight/tremorsense/truesight/passive-perception fields joined into one string) | composed (raw `<senses>` + passive-perception joined) |
| `languages` | passthrough (`raw.languages.as_string`) | passthrough (`raw.languages`) |
| `challengeRating` | inferred+parsed (`formatChallengeRating()` converts a raw float like `0.25` to `"1/4"`) | passthrough (already a fraction-formatted string/number in XML) |
| `actions` | parsed (filtered by `action_type` enum, dice composed from 3 separate fields via `composeAttackDice()`) | parsed (filtered by name-suffix convention `"(Bonus Action)"`/`"(Reaction)"`, dice parsed from a pipe-delimited `"Label\|ToHit\|Dice"` string) |
| `legendaryActions` | parsed (same action filter/compose as `actions`, `action_type === 'LEGENDARY_ACTION'`) | parsed (from a separate `<legendary>` element list, filtered to exclude lair actions and the "Legendary Actions" header entry) |
| `description` | passthrough (`raw.description`) | parsed (citation-stripped body text) |

### ContentItem

| Column | Open5e method | Compendium method |
|---|---|---|
| `name` | passthrough | parsed (name-tag-stripped) |
| `itemType` | inferred (armor category, or `raw.category.key` fallback) | inferred (single-letter type code → display string via `TYPE_TO_ITEM_TYPE` map; falls back to lowercased code) |
| `rarity` | passthrough (magic items only, `raw.rarity.key`) | parsed (extracted from a combined `<detail>` string like `"rare (requires attunement by a warforged)"` via `parseDetail()`) |
| `requiresAttunement` | passthrough (magic items only) | parsed (regex test for `"attunement"` inside `<detail>`) |
| `cost` | composed (`parseFloat` + `" gp"` suffix) | composed (`${raw.value} gp`) |
| `weight` | composed (`parseFloat` + `String()`) | passthrough (`String(raw.weight)`) |
| `damage` | composed (dice + damage-type key joined) | composed (`raw.dmg1` + damage-type code lookup via `DAMAGE_TYPE_CODES`) |
| `armorClass` | passthrough (`String(a.ac_base)`, armor only) | passthrough (`String(raw.ac)`) |
| `properties` | parsed (`properties[].property.name` — a real live-data correction, the design doc originally assumed a shallower path) | inferred (comma-split single-letter codes → display names via `PROPERTY_CODES` map; `M` code specifically pulled out into `extraData.isMartial` rather than kept as a property) |
| `description` | passthrough (`raw.desc`) | parsed (citation-stripped) |

### ContentClass / ContentSubclass

| Column | Open5e method | Compendium method |
|---|---|---|
| `name` | passthrough | parsed (name-tag-stripped) |
| `hitDie` | inferred, 5-level fallback chain: nested `hit_points.hit_dice` → a parsed `CORE_TRAITS_TABLE` markdown row → top-level `hit_dice` string → a feature-text scan → a hardcoded per-class table | inferred (`Number(raw.hd) || 8`, direct XML attribute with a static fallback) |
| `primaryAbility` | parsed (a `CORE_TRAITS_TABLE` markdown-pipe-table row, "and"/"or" logic detected via regex) with a `primary_abilities[]` API-field fallback | inferred (hardcoded `PRIMARY_ABILITY_BY_CLASS` table — no Compendium XML field states this concept at all, `<spellAbility>` is a different, narrower concept) |
| `savingThrows` | parsed (same `CORE_TRAITS_TABLE` row) | parsed (`<proficiency>` text split into ability-name tokens vs. skill-name tokens by matching against a known ability-name set) |
| `armorProfs`/`weaponProfs` | parsed (`CORE_TRAITS_TABLE` rows, `"none"` → empty array) | passthrough-ish (`<armor>`/`<weapons>` raw text kept as a single-element array unless `"none"`) |
| `skillChoices` | parsed (`CORE_TRAITS_TABLE`'s "Skill Proficiencies" row → `parseProficiencyGrant()`) | parsed (`<proficiency>`'s non-ability tokens, count from `<numSkills>`) |
| `spellcastingAbility` | inferred (hardcoded `SPELLCASTING_ABILITY_BY_CLASS` table, gated on caster type) | passthrough (`raw.spellAbility` — a real dedicated XML field Open5e's API has no equivalent for) |
| `description` | passthrough | parsed (joined from the class's first `<trait>` element(s), citation-stripped) |

Subclass: `name`/`description` follow the same passthrough/parsed split as
Class. `classId` resolution differs sharply by source — Open5e resolves it
in-process from the same API response's `subclass_of` field (both records
present in one fetch); Compendium resolves it via a **separate DB lookup
after insert**, cross-source-first (see §1).

### ContentRace / ContentSubrace

| Column | Open5e method | Compendium method |
|---|---|---|
| `name` | passthrough | parsed (comma-split for parent/subrace name, then name-tag-stripped) |
| `size` | parsed (a `"Size"`-named trait's prose text scanned for known size words, default `["medium"]`) | inferred (single-letter code → array via a lookup map, default `["medium"]`) |
| `speed` | parsed (a `"Speed"`-named trait's prose scanned for a `"N feet"` pattern) | parsed (`<speed>` + `<speedOther>` text, the latter regex-scanned for `fly`/`swim`/`climb` sub-speeds) |
| `traits` | passthrough-ish (every non-size/speed trait copied as `{name, description, level:1}`) **plus** per-race hardcoded "lineage" sub-parsers (5 races only: Elf/Dragonborn/Gnome/Goliath/Tiefling) that split one combined 2024 lineage-choice trait into synthetic standalone Subrace rows, each with its own bespoke markdown-table or prose parser | composed (every raw field with no dedicated column — `<ability>`, `<resist>`, `<vulnerable>`, `<conditionResist>`, `<conditionImmune>`, `<proficiency>`, `<weapons>`, `<tools>`, `<languages>` — synthesized into `traits[]` entries with a fixed label, **and** kept verbatim in `extraData.raw*` as a backup) |
| `description` | passthrough | parsed (from a `"Description"`-named trait, citation-stripped; subrace descriptions additionally get a parent-paragraph-dedup pass, see §4) |
| `parentRaceId` (Race only) | always `null` — Open5e's 2024 lineage races have no separate parent record | always `null` — Race is never itself a subrace |
| `raceId` (Subrace only) | resolved in-process (2014/third-party path: real `is_subspecies:true` API record matched by `subspecies_of` key/name) **or** synthesized in-process (2024 path: no real parent lookup needed, the lineage option is derived from the same base-race record) | resolved via a **separate cross-source DB lookup after insert**, same pattern as Subclass→Class |

### ContentBackground

| Column | Open5e method | Compendium method |
|---|---|---|
| `name` | passthrough | parsed (name-tag-stripped) |
| `proficiencies` | parsed (per-`benefit.type` switch over `skill_proficiency`/`tool_proficiency` benefit prose → `parseProficiencyGrant()`, tagged `category: skill\|tool`) | parsed (`<proficiency>` element + a `"Tool Proficiency:"`-labeled `<trait>`, same `parseProficiencyGrant()` helper reused from Open5e's module) |
| `abilityBonuses` | inferred (hardcoded "distribute 3 points across named abilities, max +2" rule — the actual 2024 SRD rule, not per-record data) | inferred (same hardcoded rule, triggered by an `"Ability Scores:"`-labeled `<trait>` instead of a typed benefit) |
| `feature` | passthrough-ish (each `feature`-typed benefit → `{name, description}`) | parsed (any `<trait>` whose name matches `/feature:/i` or `/^talent:/i`) |
| `description` | passthrough (`raw.desc`) | parsed (from a `"Description"`-named trait, citation-stripped) |

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

Full detail and more examples live in `extradata-key-frequency-audit-combined.md`
§ per-table; summarized here for self-containedness.

1. **`ContentMonster.damageResistances`/`damageImmunities`/`damageVulnerabilities`/`conditionImmunities`** — a real dedicated column, not extraData, and the two sources write incompatible array-element shapes to it *today*, in production:
   ```json
   // Open5e:      ["acid"]
   // Compendium:  [{"type":"radiant"}]  or  [{"types":["acid","cold","fire"],"nonmagical":true,"bypassedBy":"silvered weapons"}]
   ```
   Open5e's shape is flatter but lossy (no qualifier support at all — "resistant to bludgeoning/piercing/slashing from nonmagical attacks" can't be represented, only the bare type list). Compendium's is richer but never gets simplified back down even for the common single-type case... actually it does (`{type: "x"}` for the simple case, `{types: [...], nonmagical, bypassedBy}` only for compound cases) — see `shared/resistance.ts`. This is the single highest-priority shape decision, because it's already live on a real column both sources write to, not a hypothetical extraData promotion.

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

This section is the complete inventory — every key seen in `extraData`
across every table and both sources, regardless of frequency (unlike the
audit reports, no >5-row threshold is applied here, since a column
decision needs to know about real-but-rare fields too).

### ContentSpell

**Open5e**: `targetType`, `targetCount`, `shapeSizeUnit` (near/fully
constant, low signal — see audit), `savingThrow` (real 6-value ability
enum: wisdom/dexterity/constitution/charisma/strength/intelligence),
`castingOptions` (array, see §4 example above), `damageRoll` (dice string,
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
`spellcasting` (object, same nominal shape, lower reliability — see §4
Monster spellcasting example), `telepathyRange` (int, e.g. 60/120/30),
`environment` (free text, e.g. `"mountain, planar (elemental plane of
fire)"`), `ancestry` (text grouping key, e.g. `"Hag"`, `"Bulette"`).

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
"Humanoid": Fiend/Elemental/Dragon/Undead/full-sentence qualifiers, see
combined report), `rawAbility`/`rawResist`/`rawVulnerable`/
`rawConditionResist`/`rawConditionImmune`/`rawProficiency`/`rawWeapons`/
`rawTools`/`rawLanguages` (raw backup text for each field that's also
synthesized into `traits[]`, per the resolved `v1-roadmap-open-decisions.md
§2.5.1` design question), plus (Subrace only)
`descriptionStrippingSkipped` (boolean, **`true` on literally every one of
142 rows** — the dedup-stripping mechanism has never once actually
stripped anything in live data, worth investigating independent of any
column decision) and `unresolvedRaceName` (when parent resolution fails —
**60/142 rows, 42%**, mostly because the named parent, e.g. Half-Elf,
Half-Orc, Genasi, Merfolk, isn't a real SRD-2024 race at all, so there's
nothing to resolve to).

### ContentBackground

**Open5e**: `grantedFeat` (`{name}`), `equipment` (free text),
`languages` (free text), `adventures_and_advancement`/
`connection_and_memento` (free text, 2014-style benefit passthrough),
`unrecognizedBenefits` (array, catch-all for any benefit type the switch
doesn't handle — empty in the current 4-row sample, but the mechanism
exists).

**Compendium**: `page`, `grantedFeat` (`{name}`, same shape as Open5e's),
`equipment` (free text, same intent), `unrecognizedTraits` (array
`{name, description}` — real, common, 150/223 rows, carrying genuinely
valuable content like `"Suggested Characteristics"` roleplay prompts, not
just malformed data — see combined report), `edition`, `thirdParty`,
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
simplest by far (see combined report), consistent with being newly
synthesized from spell-schema-shaped records rather than a native rich
Compendium record type.

### ContentCondition

No real data on either side currently (0 rows both). The schema comment
documents `descriptionSource`/`requestedSource` (Open5e, when a
document-specific description fallback was used) and `icon` (Open5e) as
the intended keys, never yet exercised with real rows.

---

## 6. Open questions this document exists to support

Not proposals — just the concrete decisions that need making, in the
order §4's items are ranked:

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
