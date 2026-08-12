# Phase 2.5 — Compendium Import: Design Notes

> Part of the `Documentation/v1.0.0/` phase-document set — see
> `v1.0.0-Roadmap.md` for the build-plan checklist and task log this design
> rationale supports. Consolidated from `compendium-import-final-export.md`
> and `compendium-race-subrace-reimport-safety-export.md`. Implementation
> log, including everything the real 32MB `Complete_Compendium_5.5e.xml`
> file overturned from the documents below: `DevTools/Notes/v0.2.notes.md`.

---

# DragonLedger DatabaseApp — Compendium Import: Final Design Export

This covers the `Complete_Compendium_5.5e.xml` import pipeline, designed as a second transform pipeline feeding the same schema Phase 2 built for Open5e. Where a decision applies to both sources (schema additions, shared conventions), that's noted explicitly — this isn't a fully separate schema, just a second set of transform functions.

## 1. Structural Decisions

### 1.1 Source Strategy

Per-book `Source` rows, parsed from the citation text embedded at the end of a record's `<text>`/`<description>` field (format: `"Source:\t<Book Title> p. <page>"`). The book title (everything before the page number) is the source's identity; the page number is incidental, optionally kept in `extraData.page` per record, not part of source identity.

A single fallback source (`id: "fc5-compendium-uncredited"`) catches any record with no parseable citation.

**Known wrinkle, not yet resolved (at time of writing):** some records cite **multiple** source books in one citation line (e.g. `"Curse of Strahd p. 209, Van Richten's Guide to Ravenloft p. 34"`). The current design assumes one book per record; this needed a decision (primary book only? first-listed? both, with a secondary-citations list?) before implementation. **Resolved during implementation:** first-listed book only for `sourceId`; the rest preserved raw in `extraData.additionalCitations`. Real multi-book citations turned out to be genuinely rare (12 of 8,033).

**Real bug found post-launch (v1.0.0):** the page-number extraction regex was anchored to the end of the citation string, so any trailing annotation after the page number (`" (Homebrew)"`, `" (Third Party)"` — both real, common formats) made the match fail and let the whole `"<title> p. <n> (<tag>)"` string become the book title, producing one duplicate `Source` row per cited page instead of per book (~1,148 spurious rows). Fixed, and the existing bad data merged back into 38 correct per-book sources — see `DevTools/Notes/v1.0.notes.md`.

### 1.2 Naming Suffix Handling

`[5.5e]` (2024 official) and `(HB)` (homebrew/third-party) suffixes are stripped from `name` and tagged structurally: `extraData.edition` / `extraData.homebrew`.

**Important correction found via real data (Cleric 2024 XML):** this suffix convention isn't only a top-level, once-per-record thing. Individual `<feature>` elements *within* a Class can each carry their own trailing year independently of the parent record — e.g. the same-named Domain feature appears twice in one Cleric file, once tagged `2024` and once `2014`. Edition detection must run **per-feature inside Class/Subclass processing**, not just once at the top of each record.

### 1.3 Duplicate Detection Against Open5e

Before an import job starts writing data, it checks whether the incoming source has a known Open5e equivalent via a hardcoded lookup table (`COMPENDIUM_TO_OPEN5E_SOURCE`, many-to-one — e.g. all three 2024 core rulebooks map to Open5e's single `srd-2024` document). If a mapping exists, records are name-matched (post-suffix-stripping) against that specific Open5e source only — not scanned against every source in the database. If no mapping exists (presumed homebrew), no check runs at all; the record imports directly.

`ImportJob` gains a new status, `AWAITING_CONFIRMATION`, entered when matches are found. The job reports a single batch-level summary (*"N records match content that already exists — import as duplicates, or skip?"*) rather than prompting per record. The user's single answer applies to the whole batch:
- **Duplicates**: proceeds normally, creating everything including matches (intentionally — the same content now exists under two sources, by design, per the Heroes-facing edition toggle below).
- **Skip**: matched records are filtered out before the real import runs.

There is no "overwrite" option — it was deliberately ruled out, since overwriting an Open5e-sourced entry's data would be silently discarded the next time that source gets refreshed (Phase 2's delete-and-replace).

**Implemented (a simplification from this document's original design):** the cross-source duplicate check searches by name across all `API`-type sources, not "that specific Open5e source" — there's no stored mapping from a `Source` row back to which Open5e document key it was originally imported under, so the precise per-document check described here wasn't buildable without a schema change. Conservative — more likely to ask for confirmation than to silently duplicate.

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

**`pool` widened during implementation** from the 3-value enum shown above to a free string — real class-gated option pools go well beyond Maneuver/Metamagic (Arcane Shot, Channeling, Psionic Discipline all showed up live), matching this doc's own `| future pools` hedge.

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

**Source-specific application:** for Open5e, this parses the `_display` string, not the array — verified via a live Adult Earth Dragon record that the array already cleanly splits the three damage types but silently discards the qualifier, keeping it only in `_display`. For the Compendium, this is the *only* form the data takes at all (`<resist>`/`<immune>`/`<vulnerable>`/`<conditionImmune>` are plain free text), so the parser does full duty there. **Retrofitted onto Open5e's own monster transform in Phase 2.6** (originally deferred out of this phase's scope) — see `Phase-2.6-Schema-Expansion.md`.

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
| `<name>`'s category prefix | `category` | `"Origin:"`→`ORIGIN`, `"Fighting Style:"`→`FIGHTING_STYLE`, `"Epic Boon:"`→`EPIC_BOON`; unprefixed → `GENERAL`. **Verified during implementation:** 461 of 580 real feats are unprefixed, confirming the default; real prefixes go well beyond these three, routed to `CLASS_SPECIFIC` with the raw prefix preserved. |
| `<prerequisite>` | `prerequisite` | |
| `<text>` (citation stripped) | `description` | Continuous prose — **no `extraData.benefits` array**, since the Compendium has no itemized-benefit equivalent. |
| `<modifier category="bonus">` | `extraData.modifiers` | Only reliably structured mechanical data available. |
| `<special>` | `extraData.special` | Unparsed. |

### 4.2 Spell (Compendium addendum — Open5e mapping unchanged from Phase 2)

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>`, when `<classes>` = "Maneuver Options" (or, per implementation, several other pool names — see Section 1.5/2's `pool` widening) | **Rerouted to `ContentClassOption`** | Not a real spell — reuses the `<spell>` schema in the source file only for convenience. Detection: check `<classes>` before processing as a Spell at all. Eldritch Invocations use a completely different `<classes>` shape (`"Eldritch Invocations [5.5e]"`, no `"Options"` suffix) — found during implementation. |
| `<name>` (suffix stripped, non-reroute) | `name` | |
| `<level>` | `level` | |
| `<school>` (code) | `school` | Code lookup: A/C/D/EN/EV/I/N/T. |
| `<classes>` (comma text) | `classes` | Split into name array. |
| `<time>` | `castingTime` | |
| `<range>` | `range` | |
| `<components>` | `components` | Stored verbatim, including non-standard cases (e.g. `"(1 sorcery point)"`). |
| `<duration>` | `duration` | |
| `<ritual/>` presence | `ritual` | Boolean. |
| `<text>` (citation stripped) | `description` | |
| `<roll>` (repeatable) | `extraData.scalingDice` | Array of `{description, dice, level}`. (**Renamed to `extraData.scaling`, unified with Open5e's shape, in Phase 2.6.**) |

### 4.3 Background (Compendium — verified against a 6-record sample at time of writing)

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (suffix stripped) | `name` | |
| Description trait's bulleted lines (`"• Skill Proficiencies: ..."` etc.) | `proficiencies` | **Primary source of truth** — parsed via Fixed/Choice Grant Shape. Takes precedence over standalone `<proficiency>` tag. |
| `<proficiency>` (standalone) | `proficiencies` (fallback only) | Used only if Description has no parseable bullet. **If both exist and disagree** (confirmed real case: Investigator's tag says "Insight, Investigation," its bullet says "Athletics, Insight") → don't silently pick one, log both to `extraData.proficiencyMismatch`. |
| Description's `"• Languages: ..."` | `extraData.languages` | Fixed/Choice shape. |
| Description's `"• Equipment: ..."` | `extraData.equipment` | Raw text. |
| Description's `"• Ability Score..."` (if present) | `abilityBonuses` | Not confirmed present in the original 6-record sample. |
| Remaining Description text (above the bullets) | `description` | |
| Trait whose name **contains** (not just starts with) `"Feature:"` | `feature` | Confirmed real case (`"Baldur's Gate Feature: Smuggler's Sense"`) needed "contains," not "starts with." |
| Any other trait | `extraData.unrecognizedTraits` | Raw, unparsed. |

**🚩 VERIFICATION FLAG (as of original writing) — RESOLVED during implementation.** This mapping was built from a 6-record sample and flagged as needing re-verification against the full real file before being trusted. **What implementation found against the full 223-record set:** the real shape is actually *simpler* than documented — each category (`Ability Scores: X, Y, Z`, `Feat: Name`, `Tool Proficiency: Detail`) is its own colon-labeled `<trait>` element, not bulleted lines inside one Description trait. A `Talent:`-labeled trait (555 real occurrences, a third-party "Profession Die" homebrew mechanic) turned out more common than the documented `Feature:` mechanism (126) and needed the same feature-array routing.

### 4.4 Item (Compendium)

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (suffix stripped) | `name` | |
| `<type>` (code, `$` **excluded entirely** — no Currency content type, and Open5e doesn't surface these either) | `itemType` | Code lookup normalized to match Open5e's values: M/R→weapon, LA/MA/HA/S→armor (subtype in `extraData.armorCategory`), G→adventuring-gear, P→potion, SC→scroll, W→wondrous-item, ST→staff, RD→rod, WD→wand, RG→ring, A→ammunition. |
| `<text>` (citation + rarity/attunement parsed out) | `description` | |
| `<text>` (parsed opening line) | `rarity` / `requiresAttunement` | Originally flagged as best-effort text parsing with no confirmed reliable pattern. **Resolved during implementation:** a dedicated `<detail>` tag (e.g. `"rare (requires attunement by a warforged)"`) turned out to exist and is reliable — confirmed on 98.7% of 5,317 magic items. |
| `<weight>` | `weight` | |
| `<value>` | `cost` | Composed `"N gp"`. |
| `<detail>` | `extraData.detail` | |
| `<dmgType>` + `<dmg1>` | `damage` | Composed `"1d8 slashing"`. |
| `<dmg2>` | `properties` (paired with Versatile entry) | The Compendium has no generic per-property detail field — `dmg2` only pairs with the `V` property code specifically. |
| `<range>` | `extraData.range` | |
| `<property>` (codes) | `properties` | Code lookup: 2H/H/L/F/V/R/LD/S/A/T → `{name, detail?}`. A weapon property's real name is nested at `properties[].property.name`, matching the same nesting Open5e uses. |
| `<property>` containing `M` | `extraData.isMartial` | Presence/absence flag, not itself a named property. |
| `<ac>` | `armorClass` | Base number only, same rule as Open5e. |
| `<stealth>` | `extraData.stealthDisadvantage` | Boolean. |
| `<strength>` | `extraData.strRequired` | |

### 4.5 Class/Subclass (Compendium — originally verified against one real file, Cleric 2024; broadened during implementation to the full real file, 25 classes)

**Base class fields:**

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (suffix stripped) | `name` | |
| `<hd>` | `hitDie` | Direct — no inference chain needed, unlike Open5e. |
| `<spellAbility>` | `spellcastingAbility` | Direct — no hardcoded lookup table needed, unlike Open5e. |
| `<proficiency>` (comma text, mixing saves + skill pool) | `savingThrows` + `skillChoices` | **Parsed**: entries matching one of the six ability names → `savingThrows`; everything else → the skill pool for `skillChoices` (Fixed/Choice shape, `count` from `<numSkills>`). |
| `<armor>` | `armorProfs` | |
| `<weapons>` | `weaponProfs` | |
| `<tools>` | `extraData.toolProfs` | No dedicated column. **Stored as `[raw.tools]`** — a single-element array wrapping the raw comma-separated text, matching the same convention as `armorProfs`/`weaponProfs` (a real bug that stored this as a bare string instead of an array, crashing `ClassCard`, was found and fixed post-launch — see `DevTools/Notes/v1.0.notes.md`). |
| `<slotsReset>` | `extraData.slotsReset` | |
| `<autolevel><slots>` (per level) | `extraData.spellSlotTable` | No dedicated column — composed into a level→slots map. |
| — | `primaryAbility` | No Compendium field exists for this at all. |
| Non-subclass `<feature>` entries (see detection rule below) | `extraData.features` | `{name, description, level, edition}` — `edition` tracked **per-feature**, not just once per record (Section 1.2). (**Superseded in Phase 2.6** by the real `ContentClassFeature` relation table.) |

**Subclass detection rule — originally flagged as verified against exactly one file, needing a broader sample before trusting as general:**

1. Any `<feature>` whose `<n>` ends in a parenthetical, optionally followed by a trailing year (e.g. `"Avatar Of Battle (War Domain) 2024"`) → strip both, route to a synthesized `ContentSubclass` named after the parenthetical contents (`"War Domain"`), with `edition` tagged from the trailing year.
2. Colon-style in-base-class choices (e.g. `"Divine Order: Protector"` / `"Divine Order: Thaumaturge"`) are **not** subclasses — they stay on the base class, represented via a `grant` field (Fixed/Choice shape) on the parent "Divine Order" feature, since every Cleric picks one regardless of which Domain they later choose.
3. `<counter>` elements have no subclass tag anywhere in the real file checked. Attempt a cross-reference: does any subclass-routed feature's `<text>` mention this counter's name? If a confident match exists, attach the counter to that subclass; otherwise, the counter stays on the base class, flagged in `extraData.unassignedCounters` rather than guessed at.
4. This mirrors, not improves on, how FC5's own tooling handles subclass identity — confirmed via that ecosystem's public documentation that subclasses are literally separate source files merged by matching `<class><name>`, with no structural feature-to-subclass tag surviving into the merged output either.

**🚩 RESOLVED during implementation, against the full real file (25 classes):** rule 1 above produces false positives — a lore-only feature like `"Veilmark Information (Zamanora)"` isn't a subclass at all. The real, reliable signal turned out to be a dedicated marker feature literally named `"<Class> Subclass: <Name>"`. Subclass names also carry more tags than documented: `(Legacy)` = 2014 edition, `(TP)` = third-party, `(UA)` = Unearthed Arcana, alongside the documented `(HB)`. Matching a child feature to its subclass must use the marker's raw, tag-unstripped suffix as the key — two same-named variants cited from different books (`"Knowledge Domain (Legacy)"` vs. `"Knowledge Domain (UA)"`) both exist under Cleric alone.

### 4.6 Condition — Not Available From the Compendium

The Compendium's top-level element set (class/race/background/feat/item/spell/monster) has no `<condition>` equivalent at all. Conditions can only ever be sourced from Open5e; this is a hard limitation of the source file, not a mapping gap.

### 4.7 Race/Subrace, Monster — Status at time of this document

**Monster** was fully mapped for both sources (includes the composite resistance parser and telepathy extraction from Section 3).

**Race/Subrace was not covered in this session** — offered repeatedly as an option but the session prioritized Feat, Monster, Spell, Item, Background, and Class/Subclass instead. **Covered in the follow-up session below** (Race/Subrace + Re-Import Safety).

## 5. Consolidated Verification Flags (as of original writing — see notes inline above and the implementation log for resolutions)

1. Multi-book citations (Section 1.1) — **resolved:** first-listed book only.
2. Feat category default (Section 4.1) — **resolved:** confirmed, 461/580 unprefixed.
3. Background bullet-parsing (Section 4.3) — **resolved:** real shape simpler than documented.
4. Class/Subclass detection rule (Section 4.5) — **resolved:** replaced with marker-feature detection.
5. Item rarity/attunement text-parsing (Section 4.4) — **resolved:** a real, reliable `<detail>` tag exists.

## 6. Implementation Instructions for Claude Code (historical — already executed)

1. Add the schema changes from Section 2 (`ContentFeat`, `ContentClassOption`, `Language`, `ImportJobStatus.AWAITING_CONFIRMATION`) to `prisma/schema.prisma`. Run `prisma migrate dev --name compendium-import-additions`.
2. Seed the `Language` table per Section 2's list.
3. Build the shared composite resistance/immunity parser (Section 3.1) as a standalone utility function — used by both the Open5e and Compendium Monster importers, not duplicated.
4. Build the `COMPENDIUM_TO_OPEN5E_SOURCE` lookup table (Section 1.3) — this is a real research task (cross-referencing book titles against Open5e's `document.key` list), not a design decision; do this as part of implementation, not before.
5. Build the XML parsing layer first (a real XML parser, not string-splitting) before any per-content-type transform logic, since every mapping in Section 4 depends on it.
6. Implement content types in this order: Feat and Spell (simplest, establish the citation-parsing and suffix-stripping utilities other types reuse), Item, Background (flagged as needing sample verification — implement conservatively, log unrecognized traits liberally), Monster (reuses the Section 3 parsers), Class/Subclass last (hardest — implement the detection rule from Section 4.5 defensively, logging every subclass-routing decision so real output can be spot-checked against the actual file before trusting it at scale).
7. Before running a full Compendium import, do NOT skip Section 5's verification items — each represents a real, flagged uncertainty, not a settled design.
8. Wire the `AWAITING_CONFIRMATION` duplicate-check flow into the same import orchestrator Phase 2 built, as an early phase before the delete-and-replace step begins.

---

# DragonLedger DatabaseApp — Compendium Race/Subrace + Re-Import Safety: Final Design Export

This session closes the one content type left open from the main Compendium session above — Race/Subrace — and, in the course of doing so, surfaces two decisions that apply to the **entire Compendium pipeline**, not just races: a re-import safety rule, and a cross-source resolution rule for subclass/subrace parent-linking. Read alongside the main Compendium export above, not as a replacement for it.

## 1. Race/Subrace Mapping (Compendium)

Verified against two real files: `Elf, Wood Elf 2024.xml` and `Dwarf 2024.xml`. (**Broadened during implementation** to the full real file, 273 races — see the implementation log and Section 5 below for what changed.)

### 1.1 Key structural finding: `<ancestry>` doesn't appear in either real file, despite being documented

The actual subrace signal is in the **name** itself: a comma-separated `"ParentRace, SubraceName Edition"` convention (`"Elf, Wood Elf 2024"` vs. a base race's plain `"Dwarf 2024"`). Detection rule: if `<name>` contains a comma, everything before it is the parent race name (used for cross-source resolution, Section 3), everything after is the subrace name.

### 1.2 Key structural finding: subraces are complete, standalone records — not a lineage choice to synthesize

Unlike Open5e's SRD-2024 shape (one Elf record, a "lineage" trait containing an embedded choice table for Wood Elf/Drow/High Elf), the Compendium's Wood Elf file contains **every** Elf trait — Darkvision, Fey Ancestry, Keen Senses, Trance — not just its own Wood Elf–specific trait. **No lineage-table-synthesis parser is needed for the Compendium at all** — each "ParentRace, SubraceName" file imports directly as one complete `ContentSubrace` row with its own full `traits` array.

### 1.3 Field mapping

| Compendium Field | This App's Field | Notes |
|---|---|---|
| `<name>` (parsed per 1.1, suffix stripped) | `name` (or subrace `name`) | Comma-split determines base-race vs. subrace routing. |
| `<size>` | `size` | **Direct field, confirmed real** — no trait name-matching needed (unlike Open5e). |
| `<speed>` | `speed` | Direct field, plain number — same. |
| `<speedOther>` | `speed` (merged) | Additional movement types (e.g. `"swim 30 ft."`), merged into the same `{walk, swim?, fly?}` object. Not present in either sample file, but documented. |
| `<ability>` | synthesized trait + `extraData` backup | See Section 1.4 — resolved. |
| `<resist>` / `<vulnerable>` / `<conditionResist>` / `<conditionImmune>` | Same | Resolved per Section 1.4. |
| `<proficiency>` / `<weapons>` / `<tools>` / `<languages>` | Same | Resolved per Section 1.4. |
| Trait named `"Description"` (edition-suffixed) | `description` | Subrace's version gets the shared-opening-paragraph stripped per Section 2's safeguarded mechanism. |
| Trait named `"Creature Type"` | `extraData.creatureType` | Real field found in both samples (always "Humanoid" for player races). |
| All other traits (per-trait edition suffix stripped, e.g. `"Darkvision 2024"`) | `traits` | `{name, description, level, grant?}`, same shape as Open5e-sourced traits. |

### 1.4 `<ability>`/resistance/proficiency fields — RESOLVED: synthesize as trait, and preserve raw

**Resolved (confirmed with the user before implementation):** synthesize each into a `traits[]` entry (keeps `traits[]` the one canonical place a race's grants live, consistent regardless of source — matches how Open5e represents everything, even Dwarven Resilience, as trait prose) **and** preserve the original raw field value in `extraData` (e.g. `extraData.rawAbility`, `extraData.rawResist`) as a backup/cross-check, rather than choosing one option exclusively.

## 2. Description Text: Stripping the Duplicated Parent Content (Safeguarded)

Subrace Description traits open with the parent race's general lore verbatim before their own specific content (Wood Elf's Description repeats Elf's origin story before reaching Wood Elf–specific material). Given real transcription artifacts already visible in the sample files (`"fores ts"`, stray characters from an OCR-like process), naive prefix-stripping is too risky.

**Mechanism:**
1. Compare the subrace's Description against its already-imported parent's Description, paragraph by paragraph from the start, tolerant of minor whitespace/punctuation noise.
2. Strip only paragraphs that match closely; stop at the first paragraph that doesn't match, keeping everything from that point forward.
3. **Mandatory safeguard:** if the parent hasn't been imported yet, or no confident paragraph-level match is found, **strip nothing** — keep the full duplicated text intact, and set `extraData.descriptionStrippingSkipped: true` rather than guess and risk cutting real subrace-specific content.
4. Never strip down to an empty description.

**Real result confirmed at full scale during implementation:** `descriptionStrippingSkipped` is `true` on 100% of real subraces — filed as a known issue in the Phase 2.6 log, not fixed inline (out of scope for that pass).

## 3. Cross-Source Parent Resolution (Applies to Both Subclass AND Subrace)

This is a pipeline-wide mechanism, not race-specific — it exists because the Compendium's own base Class/Race record for a given name might get **skipped** (Section 4's re-import safety rule, or a first-import cross-source duplicate skip) even while its subclasses/subraces still need to resolve to *some* real parent row.

**Resolution order, when a Compendium-derived Subclass/Subrace needs to attach to a parent:**
1. Search for an existing Class/Race matching the parent name, **preferring an Open5e-sourced match first** — Open5e's version is presumed the more complete/authoritative record, and the one everything else (including a future Heroes) will already be pointing at.
2. If none found, fall back to a Compendium-sourced match (covers homebrew parents with no Open5e equivalent at all).
3. If neither exists, import the subclass/subrace anyway with `classId`/`raceId` set to `null`, flagged via `extraData.unresolvedClassName` / `extraData.unresolvedRaceName` — never silently dropped.

**Why this matters concretely:** if the Compendium's own Fighter file gets skipped as a duplicate of Open5e's Fighter, Battle Master (extracted from that same file via the parenthetical-detection rule) still needs a real class to point at — this rule ensures it finds Open5e's Fighter rather than being orphaned just because its own source's copy of the parent was never created.

**Confirmed at full scale during implementation:** all 382 real subclasses resolved successfully — either to an existing Open5e class or a freshly-imported Compendium one; none were left orphaned by mistake.

## 4. Re-Import Safety: The Compendium Is Additive-Only, Never Overwrites

**This is a new, distinct import behavior — not a variant of Phase 2's delete-and-replace refresh.** Established because Compendium content is meant to be corrected locally when its text is wrong (a static file has no upstream maintainer to fix it and re-pull from, unlike Open5e), and any refresh-style overwrite would silently destroy those local corrections.

**Two-layer duplicate resolution, applied in order, for every incoming Compendium record on every import (first-run or re-run alike):**

1. **Same-source check (new this session):** does a matching record already exist from a *prior* Compendium import (same `sourceId` + `slug`)? → **skip unconditionally, no exceptions, never re-evaluated.** This is what makes local text corrections durable — a corrected row is never touched by a later re-run of the same file.
2. **Cross-source check (from the main Compendium session):** only reached if step 1 didn't match. Does a matching record exist under a source mapped via `COMPENDIUM_TO_OPEN5E_SOURCE`? → the existing batch-level "N records match — import as duplicates, or skip?" prompt applies, as originally designed.
3. Neither → import fresh.

**Practical implication:** a Compendium import job is expected to run essentially once per database lifetime (first setup, or after a full database wipe/disaster recovery) — not on the recurring cadence Open5e refreshes use. Editing a Compendium-sourced record's text is expected to work like editing any other content (subject to Phase 4's normal write-API rules, later revised to a broad source-type-based correctability rule — see `Phase-4-Write-API.md`), with confidence that a later re-run of the same file will never overwrite that edit.

## 5. Elevated Validation Requirement (Not a Standard Verification Flag) — RESOLVED

Given how much this session's real-file checks overturned documentation-based assumptions — twice in a row, independently (Cleric's per-feature editions and parenthetical naming; these two race files' absent `<ancestry>` field and standalone-subrace structure) — **Class/Subclass and Race/Subrace import specifically needed a dedicated, elevated validation pass before being trusted at scale**, distinct from and higher-priority than the general verification-flags list in the main Compendium export.

**Resolved during implementation:** a much larger real sample was pulled (the full 32MB `Complete_Compendium_5.5e.xml`, 25 classes, 273 races) and manually verified. Results: the parenthetical-suffix subclass-detection rule was found to produce false positives and was replaced by the marker-feature-based rule (see the main export's Section 4.5 update above); the comma-separated race-naming convention held but real data also has an equally-common undocumented parenthetical campaign-setting pattern (`"Human (Zendikar)"`) that the strict-comma-only scope decision deliberately excludes rather than mishandles; the cross-source `classId`/`raceId` resolution order and the description-stripping safeguard both worked correctly at scale.

## 6. Implementation Note

Section 4's re-import safety layer is implemented as a distinct code path in the import orchestrator (`compendiumOrchestrator.ts`) — a Compendium-specific `jobType` behavior, separate from Open5e's delete-and-replace `importSource` logic from Phase 2 — rather than a conditional branch bolted onto the existing refresh function. The two mechanisms are different enough (additive-only vs. destructive-replace) that sharing one function risks a mistake where a future edit to Open5e's refresh logic accidentally leaks into Compendium's supposedly-safe re-import path, or vice versa.
