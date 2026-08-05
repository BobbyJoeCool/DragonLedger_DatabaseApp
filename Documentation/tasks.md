# DragonLedger DatabaseApp — Task List

Concrete, actionable implementation tasks per phase, extracted from each
design session's "Implementation Instructions for Claude Code" section. This
is the working checklist — `outline.md` is the design/decisions reference,
this file is "what to actually do, in what order."

Tasks are ordered within each phase; later tasks generally depend on earlier
ones in the same phase. Items marked **[DECISION NEEDED]** block on an item in
outline.md's Open Questions appendix — resolve that first rather than guessing.

---

## Phase 0 — Scaffold (mostly done)

- [x] Update `prisma/schema.prisma` `datasource` block: `provider = "sqlite"`, `url = "file:./dev.db"`
- [x] Re-run `prisma generate` / `prisma db push` against the SQLite file, confirm connection
- [x] **RESOLVED — no auth needed locally.** Disable/no-op the auth requirement
      on write routes for this build; keep the middleware code and tests in
      place (don't delete) so it's easy to re-enable when Heroes integration
      introduces a real reachability scenario worth gating again

---

## Phase 0.7 — Desktop Packaging (Electron) — build up front

> **RESOLVED: build this now, immediately after Phase 0, not deferred to the
> end.** Kept under the "Phase 8" label elsewhere in the docs (design-export
> naming); this is the same work, just sequenced early. See outline.md §Phase
> 0.7 for the full checklist — the concrete tasks are:

- [x] Build single-process production mode: `npm run build` + `express.static()`
      serving the compiled client alongside API routes
- [x] Set up `concurrently`-based `npm run dev` for the two-process dev mode
- [x] Scaffold `/electron` — main process entry, `electron-builder` config
- [x] Point the Electron window at the local Express server (no server rewrite)
- [x] Configure the SQLite DB path to `app.getPath('userData')`, never inside the app bundle
- [x] Bundle Prisma migration files into the packaged app
- [x] Run `prisma migrate deploy` against the `userData` DB path on every app launch
- [x] Confirm hot-reload/dev workflow through Electron doesn't block normal
      phase-by-phase development — fall back to plain-browser dev flow if it does
- [ ] Smoke test once Phase 1's schema exists: fresh install → schema migrates → empty Browse screen → relaunch → data persists
- [ ] Produce a signed/notarized `.dmg` via `electron-builder` for macOS (can happen later, once there's something worth packaging)
- [ ] Full smoke test (re-run after Phases 2–7 ship): import Open5e → import Compendium → browse → edit → delete → relaunch → data persists
- [ ] Test a migration-bearing update against a real prior-version `userData` DB copy, confirm no data loss

---

## Phase 1 — Schema & Sources

- [x] Update `schema.prisma` with the full current model set (Source, ImportJob,
      ContentSpell, ContentClass, ContentSubclass, ContentRace, ContentSubrace,
      ContentBackground, ContentCondition, ContentItem, ContentMonster,
      ContentFeat, ContentClassOption, Language) per Appendix A
- [x] Set correct `onDelete` behavior per relation: `Cascade` (Source → content),
      `SetNull` (ContentSubclass.classId, ContentSubrace.raceId, ContentClassOption.classId),
      `NoAction` (ContentRace.parentRaceId self-relation)
- [x] Run `prisma migrate dev --name init`
- [x] Seed script: `homebrew` Source row (`isDeletable: false`) + `Language` table
      (common: Common, Dwarvish, Elvish, Giant, Gnomish, Goblin, Halfling, Orc;
      exotic: Abyssal, Celestial, Deep Speech, Draconic, Infernal, Primordial +
      Aquan/Auran/Ignan/Terran, Sylvan, Undercommon; secret: Druidic, Thieves' Cant)
- [x] Build `GET/POST /api/sources`, `GET /api/sources/:id`, `DELETE /api/sources/:id`
      (400 if `isDeletable: false`; include `warnings` array for orphaned dependents)
- [x] Write Phase 1 tests (source CRUD, cascade delete, protected-source delete rejection)

---

## Phase 2 — Open5e Import

1. [x] Add `ImportJob` model + `ImportJobType`/`ImportJobStatus` enums to schema (if not already done in Phase 1); migrate
       — already fully present from Phase 1's schema build; no new migration needed
2. [x] Create `server/src/schemas/content/*.ts` — one Zod schema per content type,
       each exporting a full schema and a `.partial()` variant (reused by Phase 4)
3. [x] Create `server/src/importers/open5e/*.ts` — one file per content type. Build order:
   - [x] `conditions.ts`, `spells.ts` (simplest, no cross-references)
   - [x] `races.ts` — `transformRace`, `synthesizeSubracesFromLineageTrait` (5 per-race
         parsers: Elf, Dragonborn, Gnome, Goliath, Tiefling — **not** one generic
         parser, each has a genuinely different table/prose shape), `transformSubspecies`
         for real `is_subspecies: true` records. Import base races before subraces.
   - [x] `classes.ts` — `transformClass`, `transformSubclass`, `inferHitDie`
         (priority: nested `hit_points.hit_dice` > CORE_TRAITS_TABLE's "Hit Point Die"
         row > "Hit Dice" feature scan > hardcoded SRD table — the CORE_TRAITS_TABLE
         layer is a real-data addition, see item 7 below), `lookupSpellcastingAbility`,
         `lookupMulticlassLogic`. Import classes before subclasses.
   - [x] `items.ts` — `transformItem`, `transformMagicItem`
   - [x] `monsters.ts` — last (needs Spells to exist for spellcasting name-matching;
         name-resolution against `ContentSpell.slug` not implemented this pass — spell
         names are parsed into `extraData.spellcasting` as plain strings, not
         cross-referenced. Low-stakes per the original design doc ("a lookup hint
         only, not a real FK") — deferred, not forgotten).
         `composeAttackDice`, `inferProficiencyBonus`, `parseSpellcastingBlock`
4. [x] `server/src/importers/utils/fetchWithRetry.ts` — 3 attempts, 500ms base
       exponential backoff, honor `Retry-After` on 429
5. [x] `server/src/importers/orchestrator.ts` — `importSource({ sourceId, sourceName,
       documentKey?, contentTypes, jobId })`: upsert Source → per-content-type
       transaction (delete existing rows for sourceId, fetch+transform+chunk+`createMany`)
       → update `ImportJob` progress/status per type → update `Source.lastUpdated` on
       completion. Validation (Zod `.parse()`) happens during the fetch+transform step,
       *before* the transaction opens — a bad record fails fast without ever touching
       existing DB rows for that type, which satisfies the rollback-isolation goal more
       simply than a delete-then-reinsert-then-rollback transaction would.
   - [x] **Chunk size recalculated**, not just re-verified: `computeChunkSize(columnCount)`
         = `floor(900 / columnCount)`, per-model column counts declared in the orchestrator.
6. [x] Wire endpoints: `POST /api/import/open5e`, `GET /api/import/progress/:jobId` (SSE),
       `GET /api/import/history`. **`POST /api/import/file` deliberately not built this
       pass** — it belongs to the JSON-file import path (Phase 6's Import Wizard Step 2c),
       has no defined request/file shape anywhere in the design docs, and the user's ask
       for this session was specifically the Open5e import. Not forgotten, out of scope.
7. [x] Verified against real live API responses (not just docs) — several real
       corrections found, documented in `DevTools/Claude/phase-2.md`. Highlights: Classes'
       skill/armor/weapon proficiencies and primary-ability rule all live in one
       `CORE_TRAITS_TABLE`-typed feature (a markdown table), not scattered named-feature
       prose as assumed; Monster `challenge_rating` is a raw float, not a fraction string;
       Monster `saving_throws` includes all six abilities, not proficient-only;
       `Spellcasting` lives in a Monster's `actions[]`, not `traits[]`, for 2024 content;
       Item weapon `properties[].name` is actually nested at `properties[].property.name`;
       Background `benefits[]` are free prose requiring parsing, not pre-structured, and
       2024 SRD backgrounds grant a `type: "feat"` benefit not in the original mapping at
       all (routed to `extraData.grantedFeat`); Open5e's v2 API currently has **zero**
       Conditions tagged under `srd-2024` (confirmed real upstream data gap, not a bug —
       importing Conditions for this source correctly yields 0 rows today).
8. [x] Hardcoded lookup tables confirmed to cover all 12 SRD 2024 classes — cross-checked
       live against Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue,
       Sorcerer, Warlock, Wizard via a full live import (see below).
9. [ ] `dragonledger-master-schema.md`'s ER diagram — no field-shape changes were needed
       this phase (Phase 1's schema already matched what Phase 2 needed), so nothing to update.
10. [x] FK constraints verified — all already correct from Phase 1's schema build.
11. [x] Phase 2 tests written: `server/src/__tests__/importers/*.test.ts` (59 tests —
        pagination following, retry/backoff incl. Retry-After and fail-fast-on-404,
        chunk sizing, and per-content-type transform field mapping against real captured
        API fixtures) plus `orchestrator.test.ts` (replace-not-duplicate on re-import,
        per-type rollback isolation with other types unaffected). **Beyond the original
        scope:** a full real (non-mocked) import against live Open5e SRD 2024 data was
        run end-to-end and spot-checked by hand, and a Playwright E2E suite
        (`e2e/open5e-import.spec.ts`) drives the real HTTP API to do the same thing as an
        automated, repeatable test — spot-checking a simple and a complex row in every
        table the importer writes to. The equivalent Compendium-import suite will follow
        once Phase 2.5 exists to test.

---

## Phase 2.5 — Compendium Import

1. [ ] Add `ContentFeat`, `ContentClassOption`, `Language` models +
       `ImportJobStatus.AWAITING_CONFIRMATION` to schema; migrate
       (skip if already done in Phase 1/2)
2. [ ] Build the real XML parsing layer first — every mapping below depends on it
3. [ ] Build `COMPENDIUM_TO_OPEN5E_SOURCE` lookup table — real research task:
       cross-reference Compendium book titles against Open5e's `document.key` values
4. [ ] Build the shared composite resistance/immunity/vulnerability parser
       (recognizes "B/P/S from nonmagical, unless silvered"-shaped phrases as
       one atomic entry) as a standalone utility — used by **both** Open5e and
       Compendium Monster importers, not duplicated
5. [ ] Build the shared telepathy-range extractor (parses `"telepathy X ft."`
       out of free language text) — same both-sources reuse
6. [ ] Implement content types in this order:
   - [ ] Feat & Spell first — establishes citation-parsing and suffix-stripping
         utilities other types reuse. Watch for the Maneuver-reroute case
         (`<classes>` = "Maneuver Options" → `ContentClassOption`, not `ContentSpell`)
   - [ ] Item — best-effort rarity/attunement text parsing, flag as unreliable
   - [ ] Background — **6-record sample only**; implement conservatively, log
         unrecognized traits to `extraData.unrecognizedTraits` liberally; handle
         the tag-vs-bullet disagreement case (`extraData.proficiencyMismatch`)
   - [ ] Monster — reuses the Section-3-equivalent shared parsers from step 4/5
   - [ ] **🚩 BLOCKING PREREQUISITE — do this before writing Class/Subclass or
         Race/Subrace at all:** confirmed by the project owner that the
         current design has only been checked against **one class file**
         (Cleric 2024) and **two race files** (Elf/Wood Elf, Dwarf). Pull a
         much larger real sample first — multiple classes across both 2014
         and 2024 editions, multiple race families with real subraces, at
         least one genuine third-party/homebrew example of each — and
         manually re-verify the parenthetical-suffix subclass rule and the
         comma-separated subrace-naming convention against it. This is a
         required step, not optional polish to do "later."
   - [ ] Class/Subclass (hardest) — implement the parenthetical-suffix
         subclass-detection rule defensively even after the broader sample
         above; log every subclass-routing decision so real output can be
         spot-checked; handle per-feature (not per-record) edition tagging;
         don't misroute colon-style in-base-class choices (e.g. "Divine
         Order: Protector") as subclasses
   - [ ] Race/Subrace — comma-separated `"ParentRace, SubraceName"` detection;
         subraces import as complete standalone records (no lineage synthesis
         needed here, unlike Open5e); implement the safeguarded description-
         stripping mechanism (paragraph-match against parent, skip stripping
         entirely on low confidence or missing parent, set
         `extraData.descriptionStrippingSkipped` when skipped)
     - [ ] **RESOLVED:** `<ability>`/`<resist>`/`<vulnerable>`/`<conditionResist>`/
           `<conditionImmune>`/`<proficiency>`/`<weapons>`/`<tools>`/`<languages>`
           (no dedicated `ContentRace`/`ContentSubrace` column for any of
           these) — synthesize each into a `traits[]` entry, **and** also
           store the original raw value in `extraData` (e.g.
           `extraData.rawAbility`) as a backup/cross-check
7. [ ] Implement cross-source parent resolution for Compendium-derived
       Subclass/Subrace: prefer Open5e-sourced match → Compendium-sourced match
       → `null` + `extraData.unresolvedClassName`/`unresolvedRaceName`
8. [ ] Implement the two-layer duplicate-resolution/re-import-safety check as a
       **distinct code path** from Open5e's `importSource` (same-source+slug →
       skip unconditionally; cross-source via lookup table → `AWAITING_CONFIRMATION`
       batch prompt; neither → import fresh)
9. [ ] Seed the `Language` table (if not already done in Phase 1)
10. [ ] **RESOLVED — build the book-priority ranking:** when a record cites
        multiple source books, resolve to whichever cited source has the
        higher priority (rule is settled; the ranking data isn't built yet).
        Define this as either a `priority: Int` field on `Source`, or a
        hardcoded ranking table alongside `COMPENDIUM_TO_OPEN5E_SOURCE` — a
        real research/data task (which books outrank which), not a design
        question. Needed before any citation-parsing logic can fully resolve a
        multi-book record.
11. [ ] Wire the `AWAITING_CONFIRMATION` flow into the same import orchestrator
        as an early phase before any writes begin
12. [ ] **Do not skip verification before a full production import** (the
        Class/Subclass and Race/Subrace sample-size check is now a blocking
        prerequisite in step 6 above, not listed again here):
    - [ ] **[VERIFY]** Feat's `GENERAL` category default for unprefixed names
    - [ ] **[VERIFY]** Item rarity/attunement text-parsing reliability
13. [ ] Write Phase 2.5 tests (re-import never overwrites an edited row;
        `AWAITING_CONFIRMATION` triggers and respects batch choice; parent
        resolution prefers Open5e; composite resistance parser output shape)

---

## Phase 3 — Read API

- [ ] Confirm/add `?fields=name` lightweight mode to the shared query pattern
      (returns `{id, name}[]` only) — **blocks Phase 5's name-index hook**
- [ ] Build/verify all 8 content types' list + detail endpoints (Spell, Class,
      Subclass, Race, Subrace, Background, Condition, Item, Monster, **Feat**)
- [ ] **[DECISION NEEDED]** Decide whether `ContentClassOption` gets its own
      `GET /api/class-options?classId=` endpoint or is only ever nested under
      a Class's detail response, before building either
- [ ] Write Phase 3 tests (shape, filter combination, pagination totals,
      `?fields=name` shape, 404 on unknown id)

---

## Phase 4 — Write API

1. [ ] Add schema changes: `ContentSubclass.classId`/`ContentSubrace.raceId`
       nullable + `onDelete: SetNull` (if not already applied in Phase 1); migrate
2. [ ] Add/confirm the `homebrew` Source seed
3. [ ] Extend each content type's Zod schema file with a third export:
       `<Type>CorrectableSchema` (`.pick().strict()`) — **decide the real field
       list per type as part of this step, don't copy Monster's list blindly**.
       Monster's list is the only one defined so far (savingThrows, skills,
       damageResistances, damageImmunities, damageVulnerabilities, conditionImmunities)
4. [ ] Build shared error envelope helper (`server/src/utils/errorResponse.ts`)
       — `{ error: { code, message } }` — use for every error path in this phase
5. [ ] Implement `POST /api/:type` (400 `SOURCE_NOT_MANUAL`, 409 `SLUG_CONFLICT`, 400 `VALIDATION_ERROR`)
6. [ ] Implement `PATCH /api/:type/:id` — Correctable-Fields check first, then
       fall through to the `saveAs` flow (`SAVE_AS_REQUIRED`, `original`, `homebrew`)
7. [ ] Implement `DELETE /api/:type/:id` — class/race dependent pre-check branch;
       join the dependent-lookup query through **both** `ContentSubclass` and
       `ContentClassOption` (same dependency shape, per the reconciliation note)
       to split `willDelete` (non-MANUAL) vs. `willOrphan` (MANUAL)
8. [ ] Implement `DELETE /api/sources/:id/entries` (bulk-clear) — reuse Phase 2's
       delete-all-content-for-sourceId logic; `confirmName` gate
9. [ ] Update `DELETE /api/sources/:id` to include the post-delete `warnings` array
10. [ ] Update Phase 2's `importSource` orchestrator to run a post-refresh orphan
        check (any subclass/subrace/classOption with a `null` parent) and attach to `ImportJob.warnings`
11. [ ] Update `dragonledger-master-schema.md` if any nullable-FK details drift during implementation
12. [ ] End-to-end verify before considering Phase 4 complete: delete an
        official class with both an official and homebrew subclass attached →
        official subclass gone, homebrew subclass `null`-parented and listed,
        subsequent refresh of that class's source doesn't error
13. [ ] Write Phase 4 tests per outline §4.8

---

## Phase 5 — Browse UI

1. [ ] `npm install @tanstack/react-query @tanstack/react-virtual` in `client/`
2. [ ] Set up `QueryClientProvider` at the app root
3. [ ] Confirm Phase 3's `?fields=name` support exists before building the name-index hook
4. [ ] Build `useContentList`, `useContentNameIndex`, `useContentDetail` under `client/src/hooks/`
5. [ ] Build `SourceMultiSelect` (all-checked default) and `NameSearchInput` — shared across all 8 filter bars
6. [ ] Build the 8 `<Type>FilterBar` components under `client/src/components/filters/`
       (Spell, Class, Race, Background, Condition, Item, Monster, **Feat**)
7. [ ] Build `ResultsTable` + `PositionBar` (revised from a card grid — see
       `phase-5-browse-ui-final-export.md` §1.7) — the most involved piece of
       this phase; budget real time for scroll-math/jank. Placeholder `<Type>Row` for now.
8. [ ] Build `BrowseScreen` — sidebar, per-type `BrowseState`, filter bar, results table
9. [ ] Build `DetailScreen` — `Breadcrumb`, `SourceBadge`, placeholder
       `<Type>DetailFields`, auth-gated Edit/Delete (Delete wired to Phase 4's `{ confirm: true }` contract)
10. [ ] Verify: all 8 content types preserve independent filter state within a
        session; position-bar drag shows live names without full-record
        fetches; jump-to-position renders correctly without fetching everything in between
11. [ ] **Do not consider Phase 5 fully complete** until the dedicated
        table-row column design and the `<Type>DetailFields` ("card") design
        session both happen — data reference for the latter:
        `Documentation/card-design-spec.md`

---

## Phase 6 — Import UI

> No dedicated design session yet — build against outline.md §Phase 6 as
> written, but do not skip the two items below; they're known requirements,
> not optional polish.

- [ ] Source list (`/sources`) — table, actions (Re-import, Delete, **Clear
      entries** wired to Phase 4's bulk-clear endpoint), "Add Source" dialog
- [ ] Import wizard Step 1 — **three** import-type options: Open5e API,
      Compendium XML *(new)*, JSON file
- [ ] Import wizard Step 2b (Compendium) — file picker + the
      `AWAITING_CONFIRMATION` duplicate-summary step before the real import runs
- [ ] Progress view — per-content-type progress, live counts, error list
- [ ] Write Phase 6 tests including the Compendium `AWAITING_CONFIRMATION` flow

---

## Phase 7 — Edit & Create UI

1. [ ] Set up `@dragonledger/content-types` workspace package — move Zod
       schemas here first; both client and server code depend on it going forward
2. [ ] `npm install react-hook-form` + its Zod resolver in `client/`
3. [ ] Build `FixedChoiceGrantWidget` first — most-reused, several other widgets compose it
4. [ ] Build remaining shared widgets: `AbilityScoreGrid`, `SpeedWidget`,
       `ActionListWidget`, `PropertyListWidget`, `TraitListWidget`,
       `ComponentsWidget`, `ResistanceListWidget`, `SpellcastingWidget`
5. [ ] Build `SourcePicker` (defaults to `homebrew`), `SaveButton`/`SaveAsPrompt`
       (wired to each type's Correctable Fields subset), `UnsavedChangesGuard`, `CreateSourceInlineDialog`
6. [ ] **Do not attempt all 8 (or 10, counting Subclass/Subrace) forms in one
       pass.** Each needs its own short design session (field layout,
       required/nullable off the Zod schema, Correctable Fields review,
       extraData-to-form-field decisions) before being built.
7. [ ] Per content type, before considering its form complete: Correctable
       Fields list is real and reviewed (not copied from another type),
       required/nullable matches the Zod schema, unsaved-changes guard and
       Save/Save-as behavior both verified against that type's actual field set
8. [ ] **[DECISION NEEDED]** Resolve `ContentClassOption`'s form treatment
       (own form vs. edited within its parent Class) before or during whichever
       future session covers Class's form

---

## Phase 8 — Desktop Packaging (Electron) — *moved to Phase 0.7, see above*

**RESOLVED:** this was moved up front per decision — build it right after
Phase 0, not deferred to the end. The task list now lives under **Phase 0.7**
near the top of this document. Only two items remained genuinely tied to
*later* phases (they need Phases 2.5/5–7 to exist first) and are listed here
for reference:

- [ ] Document the "back up your `userData` DB file before installing an
      update with new migrations" recommendation somewhere user-visible
- [ ] Full smoke test with real content once Phases 2.5–7 ship: import Open5e
      → import Compendium → browse → edit → delete → close → relaunch → data persists

---

## Cross-Phase / Housekeeping

- [ ] Keep `dragonledger-master-schema.md` in sync any time a field shape or
      relation changes during implementation — it's the one running source of truth
- [ ] Per the CLAUDE.md dev-log convention: write/update `DevTools/Claude/phase-X.Y.md`
      after completing each phase above, before asking to commit
- [ ] Re-run the full Vitest suite after each phase to catch regressions in earlier phases
