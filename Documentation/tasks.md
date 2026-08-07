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
5. [x] `server/src/importers/orchestrator.ts` — `importSource(options)` (sourceId,
       sourceName, optional documentKey, contentTypes, jobId): upsert Source → per-content-type
       transaction (delete existing rows for sourceId, fetch+transform+chunk+`createMany`)
       → update `ImportJob` progress/status per type → update `Source.lastUpdated` on
       completion. Validation (Zod `.parse()`) happens during the fetch+transform step,
       _before_ the transaction opens — a bad record fails fast without ever touching
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

1. [x] `ContentFeat`, `ContentClassOption`, `Language` models + `ImportJobStatus.AWAITING_CONFIRMATION`
       — already fully present from Phase 1's schema build; no new migration needed
2. [x] Real XML parsing layer built first (`fast-xml-parser`, not string-splitting) — every
       transform depends on it
3. [x] `COMPENDIUM_TO_OPEN5E_SOURCE` lookup table built from real citation data (~140
       distinct cited books surveyed) — only SRD core books plus Tal'Dorei Campaign
       Setting: Reborn and Creature Codex have any real Open5e mapping; everything else
       (Xanathar's, Tasha's, Eberron books, Critical Role modules, all homebrew/TP/UA
       content) correctly has none
4. [x] Shared composite resistance/immunity/vulnerability parser built as a standalone
       utility (`server/src/importers/shared/resistance.ts`) — used by the Compendium
       Monster importer. **Not yet retrofitted onto Open5e's monster transform** as the
       doc also asks for — deliberately deferred (see phase-2.5 dev log); `ContentMonster`'s
       resistance columns intentionally hold two valid shapes depending on source today
5. [x] Shared telepathy-range extractor built (`server/src/importers/shared/telepathy.ts`)
6. [x] Content types implemented, in the specified order, with real corrections found at
       every step (full list in `DevTools/Claude/phase-2.5.md` — too long to duplicate here):
   - [x] Feat & Spell — Maneuver-reroute case implemented, plus real pool types beyond
         Maneuver/Metamagic (Arcane Shot, Channeling, Psionic Discipline, Eldritch
         Invocation — the last uses a completely different `<classes>` shape with no
         "Options" suffix at all)
   - [x] Item — rarity/attunement turned out to have a dedicated, reliable `<detail>` tag
         (confirmed on 98.7% of 5,317 magic items) — **not** best-effort text parsing as
         the doc assumed
   - [x] Background — re-verified against the full 223-record set, not just 6. Real shape
         is simpler than documented (colon-labeled `<trait>` elements, not prose bullets)
   - [x] Monster — reuses the shared resistance/telepathy parsers from steps 4/5
   - [x] **Blocking prerequisite resolved**: verified against the full real file (25
         classes, 273 races) rather than 1 class / 2 race files. Found the documented
         parenthetical-suffix subclass rule produces false positives and replaced it with
         a marker-feature-based rule (see dev log) — a materially different mechanism,
         not a refinement of the original
   - [x] Class/Subclass — marker-feature detection (`"<Class> Subclass: <Name>"`)
         implemented defensively (per-subclass try/catch — real source data has several
         genuinely blank markers); per-feature edition tagging handled; colon-style
         in-base-class choices (e.g. "Divine Order: Protector") correctly not misrouted
   - [x] Race/Subrace — **strict comma-only** parent-linking (scope decision, confirmed
         with the user given real data has an equally-common undocumented parenthetical
         campaign-setting pattern the docs never anticipated); subraces import as complete
         standalone records; safeguarded description-stripping implemented exactly as
         specified (`extraData.descriptionStrippingSkipped` when skipped)
     - [x] Un-columned race fields (`<ability>`/`<resist>`/etc.) synthesized into
           `traits[]` _and_ preserved raw in `extraData`, per the outline's resolution
7. [x] Cross-source parent resolution implemented for Subclass **and** Subrace — prefer
       Open5e-sourced match → Compendium-sourced match → `null` + `extraData.unresolvedClassName`/
       `unresolvedRaceName`. All 382 real subclasses resolved successfully in the live import.
8. [x] Two-layer duplicate-resolution/re-import-safety check implemented as a distinct
       orchestrator (`compendiumOrchestrator.ts`, not a branch on Open5e's `importSource`)
9. [x] `Language` table already seeded in Phase 1
10. [x] Multi-book citation handling resolved by scope decision (confirmed with the
        user): first-listed book only for `sourceId`; the rest preserved raw in
        `extraData.additionalCitations`, never used for priority ranking. Real multi-book
        citations are genuinely rare (12 of 8,033, ~0.15%) — a full priority-ranking table
        was not needed for this scope.
11. [x] `AWAITING_CONFIRMATION` flow wired as a real two-phase mechanism: the initial
        request pauses the job and writes nothing for the matched records; a separate
        `POST /api/import/compendium/:jobId/resume` completes it once a decision is given
12. [x] Verification completed against the full real file, not deferred:
    - [x] **[VERIFIED]** Feat's `GENERAL` category default for unprefixed names — 461 of
          580 real feats are unprefixed, confirming the default; real prefixes go well
          beyond Origin/Fighting Style/Epic Boon (Dragonmark, Path of the Lich, etc.),
          routed to `CLASS_SPECIFIC` with the raw prefix preserved
    - [x] **[VERIFIED]** Item rarity/attunement — reliable via `<detail>`, see step 6
13. [x] Phase 2.5 tests written: `server/src/__tests__/compendium/*.test.ts` (34 tests
        against real captured fixtures) covering name-tag stripping, citation extraction,
        source-book resolution, the composite resistance parser, and every content-type
        transform's novel mechanism, plus a mocked-file orchestrator suite covering
        additive-only re-import (never overwrites a locally-edited row),
        `AWAITING_CONFIRMATION` triggering and resuming, and cross-source parent
        preference. **Beyond the original scope:** a full real (non-mocked) import
        against the live 32MB Compendium file was run end-to-end (multiple times, fixing
        real bugs found along the way) and spot-checked by hand — final state: 580 feats,
        1,004 spells, 126 class options, 5,967 items, 223 backgrounds, 4,847 monsters, 25
        classes, 382/382 subclasses correctly parent-resolved, 131 races, 166 subraces.

---

## Phase 2.6 — Schema Expansion (extraData → columns unification)

> Decisions, updated Prisma models, and full reasoning:
> `schema-expansion-design-handoff.md` (session narrative:
> `schema-expansion-session-log.md`). Resolves the open questions in
> `schema-expansion-design-review.md`, informed by the three extraData
> frequency audits. Every item below is a direct copy of the handoff's
> "Implementation Instructions for Claude Code" — see that doc for the _why_
> behind each one before starting.

1. [x] Add `ContentClassFeature` model to `schema.prisma`; add
       `features ContentClassFeature[]` to `ContentClass` and `ContentSubclass`
2. [x] Add `experiencePoints Int` to `ContentMonster`; remove it from that
       model's `extraData` comment
3. [x] Run `prisma migrate dev --name schema-expansion-phase-1` — hand-edited
       the generated migration to backfill `0` during the SQLite table-rebuild
       copy (no `NOT NULL` default possible on ALTER TABLE with existing rows);
       safe since a full wipe-and-reimport followed immediately in this same pass
4. [x] Open5e monster transform: write `experiencePoints` to the new column
       (existing passthrough value, relocated out of `extraData`)
5. [x] Compendium monster transform: compute `experiencePoints` from
       `challengeRating` via the standard 5e CR-to-XP table (no XML field
       exists for it — a new computed value, not a passthrough)
6. [x] Open5e monster transform: read `damage_resistances_display`/`damage_immunities_display`/
       `damage_vulnerabilities_display`/`condition_immunities_display` and run
       them through the same composite parser Compendium uses
       (`shared/resistance.ts`), replacing the current flat-array passthrough.
       **Verified live** (not just Aboleth): pulled all 331 real SRD-2024
       creatures — `_display` is a plain comma-joined list on every one, no
       real monster in this dataset ever uses a qualified/nonmagical template,
       so parsing is forward-compatible rather than fixing a live discrepancy
       today. Falls back to reconstructing a comma string from the flat array
       if `_display` is ever empty while the array isn't (never observed live).
7. [x] Compendium spell transform: rename `extraData.scalingDice` →
       `extraData.scaling` in the unified shape (`{trigger, triggerValue,
       dice, description}`), setting `trigger` from `spell.level` (`0` →
       `character_level`, else `slot_level`)
8. [x] Open5e spell transform: rename `extraData.castingOptions` →
       `extraData.scaling` in the same unified shape, dropping the unused
       duration/range/concentration/shape_size fields — confirmed live
       (cantrip _and_ leveled-spell samples) these are always null; real
       finding: cantrips use `type: "player_level_N"`, leveled spells use
       `"slot_level_N"` — same trailing `_N` extracted as `triggerValue` either way
9. [x] Write new Compendium spell prose-parsers for `savingThrow`,
       `damageRoll`, `damageTypes`, `materialConsumed`, `attackRoll`.
       Validated against real Fireball text (`extractSavingThrow`/`extractDamage`
       find "Dexterity saving throw"/"8d6 Fire damage" correctly) plus
       synthetic cases for the flat-number damage variant and consumption clause
10. [x] Build `ContentClassFeature` population logic in both transforms:
        explode Open5e's grouped `levels[]` features into one row per level;
        write Compendium's already-one-row-per-level features directly.
        Removed `features` from both models' `extraData`. Live count after
        reimport: 2,881 rows (861 class-level, 2,020 subclass-level)
11. [x] **[FALSE PREMISE — no fix applied]** Investigated the described
        `isMartial` bug (an `M` code collision between `<item><type>` and
        `<item><property>`) before touching code. Verified against the live
        DB and raw XML first: `isMartial` already has real, correct variation
        (known simple weapons false, known martial weapons true — the
        transform already reads `<property>`, not `<type>`). Applying the
        prescribed fix would have broken working logic, so it was skipped.
        One much smaller real gap remains and is out of scope: a handful of
        named magic-weapon variants (e.g. `Flail [5.5e]`) have no
        `<property>` tag in the source XML at all
12. [x] Add the existing `inferProficiencyBonus(cr)` fallback (already written
        for Open5e) to the Compendium monster transform's `proficiencyBonus`
        derivation. Live result: monsters with `proficiencyBonus: 0` dropped
        from 2,641 to 35 (the residual 35 are CR-0 summoned/template stat
        blocks — e.g. a Ranger's Beast of the Land/Sea/Sky — where a real
        "Proficiency Bonus" trait _is_ present but its text is contextual
        prose, not a number, so the CR-fallback path correctly never fires;
        a separate, much smaller residual, not the bug this item targeted)
13. [x] Add `casterType` inference to the Compendium class transform:
        `spellcastingAbility === null` → `NONE`; `slotsReset === "S"` →
        `PACT`; otherwise consult a new hardcoded per-class `FULL`/`HALF`
        lookup table (slotsReset alone can't distinguish these two — both
        reset on long rest). Live distribution: FULL=5, HALF=5, NONE=5,
        PACT=2, unset=8 (unrecognized/homebrew classes, correctly left unset
        rather than guessed)
14. [x] **[FALSE PREMISE — not implemented]** Checked all 9 real SRD-2024
        species' trait names live before writing any parser: none has a
        "Creature Type," "Ability Score," "Proficiency," "Languages,"
        "Weapon," or "Tool" trait — 2024 species restructured these concepts
        entirely (ability scores moved to Background, languages are no
        longer species-granted, proficiencies appear as named ability traits
        like "Skillful" instead of a generic grant). A parser against fields
        that don't exist in the only real dataset available would be dead
        code, so none was written
15. [x] Filed `ContentSubrace.extraData.descriptionStrippingSkipped` being
        `true` on 100% of real subraces as a known issue in the Phase 2.6 dev
        log — **not** fixed inline, out of scope as specified
16. [ ] Re-run all three extraData frequency audits
        (`extradata-key-frequency-audit.md`, `-compendium.md`, `-combined.md`)
        against fresh imports to confirm the shapes actually converge —
        **not done this session**, flagged as a real follow-up (spot-checks
        in the dev log confirm the new shapes/values are populating
        correctly, but a full audit re-run is separate, substantial work)
17. [x] Wrote/updated Phase 2.6 tests: 18 new tests (unified resistance shape
        from both sources including the multi-condition-collapse fix; unified
        spell scaling shape from both sources with the `level === 0` vs.
        slot-level trigger split, against real Fireball fixtures on both
        sides; `ContentClassFeature` population/explosion at both the
        transform and orchestrator-integration level; the `proficiencyBonus`
        fix producing a real CR-based value instead of a different constant).
        122/122 tests passing (104 pre-existing + 18 new)

---

## Phase 3 — Read API

- [x] Confirm/add `?fields=name` lightweight mode to the shared query pattern
      (returns `{id, name}[]` only) — **blocks Phase 5's name-index hook**.
      Bare array, not wrapped in the pagination envelope; ignores `page`/`limit`
      and returns every filtered match (the position bar needs names across
      the whole result set, not just one page).
- [x] Build/verify all 8 content types' list + detail endpoints (Spell, Class,
      Subclass, Race, Subrace, Background, Condition, Item, Monster, **Feat**)
      — 11 routers total counting Subclass/Subrace/ClassOption
      (`server/src/routes/content/*.ts`), all mounted in `app.ts`, all public
      (no auth, per outline.md §PHASE 3). `Class`/`Subclass` detail responses
      also embed their `ContentClassFeature` rows (ordered by level) — not a
      top-level browsable type, so nested rather than given its own endpoint.
- [x] **RESOLVED — dedicated endpoint.** `GET /api/class-options` (filters:
      `classId`, `pool`, `source`, `q`) — mirrors the Subclass/Subrace pattern.
      Chosen over class-nesting since most live rows have `classId: null`
      (general options not yet linked to a class) and still need to be
      independently listable/searchable.
- [x] Write Phase 3 tests (shape, filter combination, pagination totals,
      `?fields=name` shape, 404 on unknown id) — `server/src/__tests__/content.test.ts`,
      27 tests, run against live `dev.db` (same convention as `sources.test.ts`)

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
      Compendium XML _(new)_, JSON file
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

## Phase 8 — Desktop Packaging (Electron) — _moved to Phase 0.7, see above_

**RESOLVED:** this was moved up front per decision — build it right after
Phase 0, not deferred to the end. The task list now lives under **Phase 0.7**
near the top of this document. Only two items remained genuinely tied to
_later_ phases (they need Phases 2.5/5–7 to exist first) and are listed here
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
