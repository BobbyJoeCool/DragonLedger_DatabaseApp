# DragonLedger DatabaseApp — Compendium Race/Subrace + Re-Import Safety: Final Design Export

This session closes the one content type left open from the main Compendium session (`compendium-import-final-export.md`) — Race/Subrace — and, in the course of doing so, surfaces two decisions that apply to the **entire Compendium pipeline**, not just races: a re-import safety rule, and a cross-source resolution rule for subclass/subrace parent-linking. Read alongside the main Compendium export, not as a replacement for it.

## 1. Race/Subrace Mapping (Compendium)

Verified against two real files: `Elf, Wood Elf 2024.xml` and `Dwarf 2024.xml`.

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
| `<ability>` | `extraData.abilityBonus` OR a synthesized trait | **Needs a decision — see Section 1.4.** |
| `<resist>` / `<vulnerable>` / `<conditionResist>` / `<conditionImmune>` | Same open question as `<ability>` | No dedicated `ContentRace` columns exist for any of these (only Monster has resistance columns). Open5e doesn't have these as dedicated race fields either — it only ever expresses them as trait prose. |
| `<proficiency>` / `<weapons>` / `<tools>` / `<languages>` | Same open question | Ditto — Open5e precedent is trait-prose, not dedicated fields. |
| Trait named `"Description"` (edition-suffixed) | `description` | Subrace's version gets the shared-opening-paragraph stripped per Section 2's safeguarded mechanism. |
| Trait named `"Creature Type"` | `extraData.creatureType` | Real field found in both samples (always "Humanoid" for player races) — no equivalent column in this schema, low value but preserved rather than dropped. |
| All other traits (per-trait edition suffix stripped, e.g. `"Darkvision 2024"`) | `traits` | `{name, description, level, grant?}`, same shape as Open5e-sourced traits. |

### 1.4 Open decision: `<ability>`/resistance/proficiency fields — extraData or synthesized trait?

Not resolved this session — flagged for the next pass. Two options, matching how this exact question got resolved once already for something else (Monster's `<save>`/`<skill>` free text): **synthesize as a trait entry** (keeps `traits[]` the one canonical place a race's grants live, consistent regardless of source — matches how Open5e represents everything, even Dwarven Resilience, as trait prose) vs. **`extraData`** (a dedicated, structured location, but a second place besides `traits` where a race's mechanical grants can live, which the rest of this schema has generally tried to avoid).

## 2. Description Text: Stripping the Duplicated Parent Content (Safeguarded)

Subrace Description traits open with the parent race's general lore verbatim before their own specific content (Wood Elf's Description repeats Elf's origin story before reaching Wood Elf–specific material). Given real transcription artifacts already visible in the sample files (`"fores ts"`, stray characters from an OCR-like process), naive prefix-stripping is too risky.

**Mechanism:**
1. Compare the subrace's Description against its already-imported parent's Description, paragraph by paragraph from the start, tolerant of minor whitespace/punctuation noise.
2. Strip only paragraphs that match closely; stop at the first paragraph that doesn't match, keeping everything from that point forward.
3. **Mandatory safeguard:** if the parent hasn't been imported yet, or no confident paragraph-level match is found, **strip nothing** — keep the full duplicated text intact, and set `extraData.descriptionStrippingSkipped: true` rather than guess and risk cutting real subrace-specific content.
4. Never strip down to an empty description.

## 3. Cross-Source Parent Resolution (Applies to Both Subclass AND Subrace)

This is a pipeline-wide mechanism, not race-specific — it exists because the Compendium's own base Class/Race record for a given name might get **skipped** (Section 4's re-import safety rule, or a first-import cross-source duplicate skip) even while its subclasses/subraces still need to resolve to *some* real parent row.

**Resolution order, when a Compendium-derived Subclass/Subrace needs to attach to a parent:**
1. Search for an existing Class/Race matching the parent name, **preferring an Open5e-sourced match first** — Open5e's version is presumed the more complete/authoritative record, and the one everything else (including a future Heroes) will already be pointing at.
2. If none found, fall back to a Compendium-sourced match (covers homebrew parents with no Open5e equivalent at all).
3. If neither exists, import the subclass/subrace anyway with `classId`/`raceId` set to `null`, flagged via `extraData.unresolvedClassName` / `extraData.unresolvedRaceName` — never silently dropped.

**Why this matters concretely:** if the Compendium's own Fighter file gets skipped as a duplicate of Open5e's Fighter, Battle Master (extracted from that same file via the parenthetical-detection rule) still needs a real class to point at — this rule ensures it finds Open5e's Fighter rather than being orphaned just because its own source's copy of the parent was never created.

## 4. Re-Import Safety: The Compendium Is Additive-Only, Never Overwrites

**This is a new, distinct import behavior — not a variant of Phase 2's delete-and-replace refresh.** Established because Compendium content is meant to be corrected locally when its text is wrong (a static file has no upstream maintainer to fix it and re-pull from, unlike Open5e), and any refresh-style overwrite would silently destroy those local corrections.

**Two-layer duplicate resolution, applied in order, for every incoming Compendium record on every import (first-run or re-run alike):**

1. **Same-source check (new this session):** does a matching record already exist from a *prior* Compendium import (same `sourceId` + `slug`)? → **skip unconditionally, no exceptions, never re-evaluated.** This is what makes local text corrections durable — a corrected row is never touched by a later re-run of the same file.
2. **Cross-source check (from the main Compendium session):** only reached if step 1 didn't match. Does a matching record exist under a source mapped via `COMPENDIUM_TO_OPEN5E_SOURCE`? → the existing batch-level "N records match — import as duplicates, or skip?" prompt applies, as originally designed.
3. Neither → import fresh.

**Practical implication:** a Compendium import job is expected to run essentially once per database lifetime (first setup, or after a full database wipe/disaster recovery) — not on the recurring cadence Open5e refreshes use. Editing a Compendium-sourced record's text is expected to work like editing any other content (subject to Phase 4's normal write-API rules), with confidence that a later re-run of the same file will never overwrite that edit.

## 5. Elevated Validation Requirement (Not a Standard Verification Flag)

Given how much this session's real-file checks overturned documentation-based assumptions — twice in a row, independently (Cleric's per-feature editions and parenthetical naming; these two race files' absent `<ancestry>` field and standalone-subrace structure) — **Class/Subclass and Race/Subrace import specifically need a dedicated, elevated validation pass before being trusted at scale**, distinct from and higher-priority than the general verification-flags list in the main Compendium export.

**Before implementation is considered production-ready for these two content types:** pull a meaningfully larger sample — multiple classes spanning both editions, multiple race families with real subraces, ideally at least one genuine third-party/homebrew example of each — and manually verify: the parenthetical-suffix subclass-detection rule, the comma-separated race-naming convention, the cross-source `classId`/`raceId` resolution order (Section 3), and the description-stripping safeguard (Section 2) all behave correctly against records nobody has inspected yet. Everything settled in both Compendium sessions rests on exactly one real file per content type — sufficient to design against, not sufficient to trust blindly.

## 6. Implementation Note

Section 4's re-import safety layer should be implemented as a distinct code path in the import orchestrator — a Compendium-specific `jobType` behavior, separate from Open5e's delete-and-replace `importSource` logic from Phase 2 — rather than a conditional branch bolted onto the existing refresh function. The two mechanisms are different enough (additive-only vs. destructive-replace) that sharing one function risks a mistake where a future edit to Open5e's refresh logic accidentally leaks into Compendium's supposedly-safe re-import path, or vice versa.
