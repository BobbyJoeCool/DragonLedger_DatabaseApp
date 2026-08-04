# DragonLedger DatabaseApp — Compendium Import: Final Design Export

This covers the `Complete_Compendium_5.5e.xml` import pipeline, designed as a second transform pipeline feeding the same schema Phase 2 built for Open5e. Where a decision applies to both sources (schema additions, shared conventions), that's noted explicitly — this isn't a fully separate schema, just a second set of transform functions.

## 1. Structural Decisions

### 1.1 Source Strategy

Per-book `Source` rows, parsed from the citation text embedded at the end of a record's `<text>`/`<description>` field (format: `"Source:\t<Book Title> p. <page>"`). The book title (everything before the page number) is the source's identity; the page number is incidental, optionally kept in `extraData.page` per record, not part of source identity.

A single fallback source (`id: "fc5-compendium-uncredited"`) catches any record with no parseable citation.

**Known wrinkle, not yet resolved:** some records cite **multiple** source books in one citation line (e.g. `"Curse of Strahd p. 209, Van Richten's Guide to Ravenloft p. 34"`). The current design assumes one book per record; this needs a decision (primary book only? first-listed? both, with a secondary-citations list?) before implementation — flagged, not answered.

### 1.2 Naming Suffix Handling

`[5.5e]` (2024 official) and `(HB)` (homebrew/third-party) suffixes are stripped from `name` and tagged structurally: `extraData.edition` / `extraData.homebrew`.

**Important correction found via real data (Cleric 2024 XML):** this suffix convention isn't only a top-level, once-per-record thing. Individual `<feature>` elements *within* a Class can each carry their own trailing year independently of the parent record — e.g. the same-named Domain feature appears twice in one Cleric file, once tagged `2024` and once `2014`. Edition detection must run **per-feature inside Class/Subclass processing**, not just once at the top of each record.

### 1.3 Duplicate Detection Against Open5e

Before an import job starts writing data, it checks whether the incoming source has a known Open5e equivalent via a hardcoded lookup table (`COMPENDIUM_TO_OPEN5E_SOURCE`, many-to-one — e.g. all three 2024 core rulebooks map to Open5e's single `srd-2024` document). If a mapping exists, records are name-matched (post-suffix-stripping) against that specific Open5e source only — not scanned against every source in the database. If no mapping exists (presumed homebrew), no check runs at all; the record imports directly.

`ImportJob` gains a new status, `AWAITING_CONFIRMATION`, entered when matches are found. The job reports a single batch-level summary (*"N records match content that already exists — import as duplicates, or skip?"*) rather than prompting per record. The user's single answer applies to the whole batch:
- **Duplicates**: proceeds normally, creating everything including matches (intentionally — the same content now exists under two sources, by design, per the Heroes-facing edition toggle below).
- **Skip**: matched records are filtered out before the real import runs.

There is no "overwrite" option — it was deliberately ruled out, since overwriting an Open5e-sourced entry's data would be silently discarded the next time that source gets refreshed (Phase 2's delete-and-replace).

### 1.4 Edition Toggle (Heroes-Facing)

`edition` lives primarily on `Source` (Open5e's sources already cleanly map 1:1 to an edition). A per-record `extraData.edition` override exists for sources that mix editions internally — notably any Compendium source, and per 1.2's correction, potentially even within a single Class record's individual features.

### 1.5 Feature vs. Feat vs. ContentClassOption — Three Different Things

Established early in this session and load-bearing for several later decisions:

- **A Feature** is automatic, granted by an existing choice (class, race, background) — stays embedded inline JSON on its parent, never independently browsable. No change from Phase 2.
- **A Feat** is a standalone, independently-selectable resource, gated only by a prerequisite (not by class) — gets its own top-level table (`ContentFeat`, new this session — see Section 2).
- **A `ContentClassOption`** (Metamagic, Eldritch Invocations, Maneuvers) is a themed pool gated behind *one specific class*, paid for with that class's own resource — structurally distinct from both of the above, gets its own shared table (Section 2).

Feature searchability (finding "Evasion" across all classes that grant it) is handled by **application-layer filtering over the embedded JSON**, not a synced index table — deliberately avoiding a second copy of the data that could drift out of sync with the source of truth.

## 2. Schema Additions

```prisma
model ContentFeat {
  id           String  @id @default(cuid())
  slug         String
  sourceId     String
  source       Source  @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  name         String
  category     String  // "GENERAL" | "ORIGIN" | "FIGHTING_STYLE" | "EPIC_BOON" | "CLASS_SPECIFIC"
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
  pool         String        // "Metamagic" | "Eldritch Invocation" | "Maneuver" | future pools
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

`ImportJob.status` enum gains one value:

```prisma
enum ImportJobStatus {
  PENDING
  AWAITING_CONFIRMATION  // new — duplicate-check results pending user decision
  RUNNING
  COMPLETED
  FAILED
  PARTIAL
}
```

**`Language` seed data** (static 5e rules content, not source-dependent):

- **common**: Common, Dwarvish, Elvish, Giant, Gnomish, Goblin, Halfling, Orc
- **exotic**: Abyssal, Celestial, Deep Speech, Draconic, Infernal, Primordial (+ dialects Aquan, Auran, Ignan, Terran), Sylvan, Undercommon
- **secret**: Druidic, Thieves' Cant

Grows via upsert whenever either importer encounters an unrecognized language name. Every place a language is referenced across the schema (`ContentMonster.languages`, `ContentBackground.extraData.languages`, race/subrace trait `grant` fields) stores a plain name string matching `Language.name` by convention — not a strict foreign key, consistent with how `ContentSpell.classes` already works.

## 3. Standing Conventions (Apply to Both Sources)

### 3.1 Composite Resistance/Immunity/Vulnerability Parser

A recurring 5e template — "bludgeoning, piercing, and slashing damage from nonmagical attacks [that aren't X]" — gets recognized as one atomic entry rather than being split on commas (which would garble the qualifying condition) or left as one opaque blob (which would lose the fact that it's specifically three physical damage types).

```json
[
  { "type": "cold" },
  { "types": ["bludgeoning","piercing","slashing"], "nonmagical": true, "bypassedBy": "silvered" }
]
```

`bypassedBy` is `null` when the immunity/resistance has no loophole at all. Applies uniformly to `damageResistances`, `damageImmunities`, `damageVulnerabilities`, `conditionImmunities`.

**Source-specific application:** for Open5e, this parses the `_display` string, not the array — verified via a live Adult Earth Dragon record that the array already cleanly splits the three damage types but silently discards the qualifier, keeping it only in `_display`. For the Compendium, this is the *only* form the data takes at all (`<resist>`/`<immune>`/`<vulnerable>`/`<conditionImmune>` are plain free text), so the parser does full duty there.

### 3.2 Language + Telepathy Extraction

Verified against real data (Aboleth) that Open5e's structured `languages.data` array omits telepathy entirely — `"telepathy 120 ft."` only exists in the unstructured `languages.as_string`. Both sources' language text gets parsed for a `"telepathy X ft."`-shaped phrase into `extraData.telepathyRange`, separate from the language name list itself.

### 3.3 Fixed/Choice Grant Shape — Extended for Compendium Use

Unchanged in shape from Phase 2's original design (`{ fixed, choices: [{ type: "select"|"distribute", count, from, amount? }] }`, with `category`-tagged entries for mixed-type choices). Applied here to Compendium Background proficiency bullets and Class colon-style sub-choices (e.g. Cleric's "Divine Order: Protector or Thaumaturge").

## 4. Per-Content-Type Mapping

### 4.1 Feat (new — both sources)

| Open5e Field | This App's Field | Notes |
|---|---|---|
| `key` | `slug` | |
| `name` | `name` | |
| `type` | `category` | Direct copy. |
| `prerequisite` | `prerequisite` | `null` if `has_prerequisite: false`. |
| `desc` | `description` | |
| `benefits[]` | `extraData.benefits` | Itemized array — **this structure has no Compendium equivalent, see below.** |
| `document.key` | `sourceId` | |

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (prefix + suffix stripped) | `name` | |
| `<name>`'s category prefix | `category` | `"Origin:"`→`ORIGIN`, `"Fighting Style:"`→`FIGHTING_STYLE`, `"Epic Boon:"`→`EPIC_BOON`; unprefixed → `GENERAL` (**unverified against real data — flagged**). |
| `<prerequisite>` | `prerequisite` | |
| `<text>` (citation stripped) | `description` | Continuous prose — **no `extraData.benefits` array**, since the Compendium has no itemized-benefit equivalent. |
| `<modifier category="bonus">` | `extraData.modifiers` | Only reliably structured mechanical data available. |
| `<special>` | `extraData.special` | Unparsed. |

**Stretch goal, not required for v1:** parse pseudo-benefits out of Compendium `<text>` if it turns out to be consistently bulleted — unconfirmed.

### 4.2 Spell (Compendium addendum — Open5e mapping unchanged from Phase 2)

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>`, when `<classes>` = "Maneuver Options" | **Rerouted to `ContentClassOption`**, `pool: "Maneuver"` | Not a real spell — reuses the `<spell>` schema in the source file only for convenience. Detection: check `<classes>` before processing as a Spell at all. |
| `<name>` (suffix stripped, non-Maneuver) | `name` | |
| `<level>` | `level` | |
| `<school>` (code) | `school` | Code lookup: A/C/D/EN/EV/I/N/T. |
| `<classes>` (comma text) | `classes` | Split into name array. |
| `<time>` | `castingTime` | |
| `<range>` | `range` | |
| `<components>` | `components` | Stored verbatim, including non-standard cases (e.g. `"(1 sorcery point)"`). |
| `<duration>` | `duration` | |
| `<ritual/>` presence | `ritual` | Boolean. |
| `<text>` (citation stripped) | `description` | |
| `<roll>` (repeatable) | `extraData.scalingDice` | Array of `{description, dice, level}`. |

### 4.3 Background (Compendium — verified against a 6-record sample)

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (suffix stripped) | `name` | |
| Description trait's bulleted lines (`"• Skill Proficiencies: ..."` etc.) | `proficiencies` | **Primary source of truth** — parsed via Fixed/Choice Grant Shape. Takes precedence over standalone `<proficiency>` tag. |
| `<proficiency>` (standalone) | `proficiencies` (fallback only) | Used only if Description has no parseable bullet. **If both exist and disagree** (confirmed real case: Investigator's tag says "Insight, Investigation," its bullet says "Athletics, Insight") → don't silently pick one, log both to `extraData.proficiencyMismatch`. |
| Description's `"• Languages: ..."` | `extraData.languages` | Fixed/Choice shape. |
| Description's `"• Equipment: ..."` | `extraData.equipment` | Raw text. |
| Description's `"• Ability Score..."` (if present) | `abilityBonuses` | **Not confirmed present in the 6-record sample** — apply if a fuller sample confirms the pattern; otherwise stays unset. |
| Remaining Description text (above the bullets) | `description` | |
| Trait whose name **contains** (not just starts with) `"Feature:"` | `feature` | Confirmed real case (`"Baldur's Gate Feature: Smuggler's Sense"`) needed "contains," not "starts with." |
| Any other trait | `extraData.unrecognizedTraits` | Raw, unparsed — includes genuinely mechanical content the naming heuristic can't catch (confirmed real case: Selesnya Initiate's `"Selesnya Guild Spells"` trait grants real spells with no "Feature:" label at all). Never silently dropped. |

**🚩 VERIFICATION FLAG:** this entire mapping is built from a 6-record sample. Needs re-verification against a larger, more representative sample before implementation — specifically whether the bullet-label set is exhaustive, whether "Feature:" substring-matching still misses cases like Selesnya's, and whether ability-score bullets exist anywhere in the real data.

### 4.4 Item (Compendium)

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (suffix stripped) | `name` | |
| `<type>` (code, `$` **excluded entirely** — no Currency content type, and Open5e doesn't surface these either) | `itemType` | Code lookup normalized to match Open5e's values: M/R→weapon, LA/MA/HA/S→armor (subtype in `extraData.armorCategory`), G→adventuring-gear, P→potion, SC→scroll, W→wondrous-item, ST→staff, RD→rod, WD→wand, RG→ring, A→ammunition. |
| `<text>` (citation + rarity/attunement parsed out) | `description` | |
| `<text>` (parsed opening line) | `rarity` / `requiresAttunement` | **Best-effort text parsing** — no dedicated field exists in the documented Compendium item structure at all, unlike Open5e's explicit `rarity.key`/`requires_attunement`. Not guaranteed reliable. |
| `<weight>` | `weight` | |
| `<value>` | `cost` | Composed `"N gp"`. |
| `<detail>` | `extraData.detail` | |
| `<dmgType>` + `<dmg1>` | `damage` | Composed `"1d8 slashing"`. |
| `<dmg2>` | `properties` (paired with Versatile entry) | The Compendium has no generic per-property detail field — `dmg2` only pairs with the `V` property code specifically. |
| `<range>` | `extraData.range` | |
| `<property>` (codes) | `properties` | Code lookup: 2H/H/L/F/V/R/LD/S/A/T → `{name, detail?}`. |
| `<property>` containing `M` | `extraData.isMartial` | Presence/absence flag, not itself a named property. |
| `<ac>` | `armorClass` | Base number only, same rule as Open5e. |
| `<stealth>` | `extraData.stealthDisadvantage` | Boolean. |
| `<strength>` | `extraData.strRequired` | |

### 4.5 Class/Subclass (Compendium — verified against one real file, Cleric 2024)

**Base class fields:**

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (suffix stripped) | `name` | |
| `<hd>` | `hitDie` | Direct — no inference chain needed, unlike Open5e. |
| `<spellAbility>` | `spellcastingAbility` | Direct — no hardcoded lookup table needed, unlike Open5e. |
| `<proficiency>` (comma text, mixing saves + skill pool) | `savingThrows` + `skillChoices` | **Parsed**: entries matching one of the six ability names → `savingThrows`; everything else → the skill pool for `skillChoices` (Fixed/Choice shape, `count` from `<numSkills>`). |
| `<armor>` | `armorProfs` | |
| `<weapons>` | `weaponProfs` | |
| `<tools>` | `extraData.toolProfs` | No dedicated column. |
| `<slotsReset>` | `extraData.slotsReset` | |
| `<autolevel><slots>` (per level) | `extraData.spellSlotTable` | No dedicated column — composed into a level→slots map. |
| — | `primaryAbility` | **No Compendium field exists for this at all** (`<spellAbility>` is casting ability, not primary/multiclassing ability) — requires the same hardcoded lookup table already built for Open5e, or stays unset. |
| Non-subclass `<feature>` entries (see detection rule below) | `extraData.features` | `{name, description, level, edition}` — `edition` now tracked **per-feature**, not just once per record (Section 1.2). |

**Subclass detection rule (🚩 verified against exactly one file — needs a broader sample before trusting as general):**

1. Any `<feature>` whose `<n>` ends in a parenthetical, optionally followed by a trailing year (e.g. `"Avatar Of Battle (War Domain) 2024"`) → strip both, route to a synthesized `ContentSubclass` named after the parenthetical contents (`"War Domain"`), with `edition` tagged from the trailing year.
2. Colon-style in-base-class choices (e.g. `"Divine Order: Protector"` / `"Divine Order: Thaumaturge"`) are **not** subclasses — they stay on the base class, represented via a `grant` field (Fixed/Choice shape) on the parent "Divine Order" feature, since every Cleric picks one regardless of which Domain they later choose.
3. `<counter>` elements have no subclass tag anywhere in the real file checked. Attempt a cross-reference: does any subclass-routed feature's `<text>` mention this counter's name? If a confident match exists, attach the counter to that subclass; otherwise, the counter stays on the base class, flagged in `extraData.unassignedCounters` rather than guessed at.
4. This mirrors, not improves on, how FC5's own tooling handles subclass identity — confirmed via that ecosystem's public documentation that subclasses are literally separate source files merged by matching `<class><name>`, with no structural feature-to-subclass tag surviving into the merged output either.

### 4.6 Condition — Not Available From the Compendium

The Compendium's top-level element set (class/race/background/feat/item/spell/monster) has no `<condition>` equivalent at all. Conditions can only ever be sourced from Open5e; this is a hard limitation of the source file, not a mapping gap.

### 4.7 Race/Subrace, Monster — Status

**Monster** was fully mapped this session for both sources (see the running master schema doc / prior session output — not restated here for length, but includes the composite resistance parser and telepathy extraction from Section 3).

**Race/Subrace was not covered in this Compendium session** — it was offered repeatedly as an option but the session prioritized Feat, Monster, Spell, Item, Background, and Class/Subclass instead. This remains open for a future session, using the same size/speed name-matching and subrace-synthesis groundwork already built for Open5e in Phase 2 as a starting point.

## 5. Consolidated Verification Flags

Everything below needs checking against a broader real-data sample before implementation should treat it as settled:

1. Multi-book citations (Section 1.1) — no resolution strategy decided yet at all.
2. Feat category default (`GENERAL` for unprefixed names) — unconfirmed.
3. Background bullet-parsing (Section 4.3) — 6-record sample only.
4. Class/Subclass detection rule (Section 4.5) — 1-record sample only (Cleric 2024).
5. Item rarity/attunement text-parsing (Section 4.4) — no confirmed reliable pattern yet, attempted anyway per your decision.

## 6. Implementation Instructions for Claude Code

1. Add the schema changes from Section 2 (`ContentFeat`, `ContentClassOption`, `Language`, `ImportJobStatus.AWAITING_CONFIRMATION`) to `prisma/schema.prisma`. Run `prisma migrate dev --name compendium-import-additions`.
2. Seed the `Language` table per Section 2's list.
3. Build the shared composite resistance/immunity parser (Section 3.1) as a standalone utility function — used by both the Open5e and Compendium Monster importers, not duplicated.
4. Build the `COMPENDIUM_TO_OPEN5E_SOURCE` lookup table (Section 1.3) — this is a real research task (cross-referencing book titles against Open5e's `document.key` list), not a design decision; do this as part of implementation, not before.
5. Build the XML parsing layer first (a real XML parser, not string-splitting) before any per-content-type transform logic, since every mapping in Section 4 depends on it.
6. Implement content types in this order: Feat and Spell (simplest, establish the citation-parsing and suffix-stripping utilities other types reuse), Item, Background (flagged as needing sample verification — implement conservatively, log unrecognized traits liberally), Monster (reuses the Section 3 parsers), Class/Subclass last (hardest — implement the detection rule from Section 4.5 defensively, logging every subclass-routing decision so real output can be spot-checked against the actual file before trusting it at scale).
7. Before running a full Compendium import, do NOT skip Section 5's verification items — each represents a real, flagged uncertainty, not a settled design.
8. Wire the `AWAITING_CONFIRMATION` duplicate-check flow into the same import orchestrator Phase 2 built, as an early phase before the delete-and-replace step begins.
