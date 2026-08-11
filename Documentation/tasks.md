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

> Full rationale and every resolved decision: `DevTools/Claude/phase-4.md`.

1. [x] **Already applied from Phase 1's schema build** — `ContentSubclass.classId`/
       `ContentSubrace.raceId` were already nullable with `onDelete: SetNull` in
       the very first migration; no new migration needed for this item.
2. [x] **Already seeded from Phase 1** — the `homebrew` Source row exists and
       is exercised by every write test.
3. [x] Extended each content type's Zod schema file with `<Type>CorrectableSchema`,
       original per-type field list (superseded, see item 3a below).
3a. [ ] **RULE CHANGED (2026-08-08)** — Correctable Fields is no longer a
       per-type curated list; it's source-type-based (`v1-roadmap-open-decisions.md`
       §4.1, `phase-4-write-api-final-export.md` §4). `API`-sourced entries:
       nothing correctable. `FILE`-sourced entries: everything correctable
       except `name`/`slug`/`sourceId`/parent FK. `MANUAL`: unchanged. Needs:
       (a) regenerate every `<Type>CorrectableSchema` via `.omit()` instead
       of the old `.pick()` lists, (b) reorder `createPatchHandler` in
       `server/src/routes/content/writeHandlers.ts` so the source-type check
       gates the correctable check instead of running unconditionally.
       **Not yet implemented — pending go-ahead to edit source files.**
4. [x] Built `server/src/utils/errorResponse.ts` — `{ error: { code, message, ...extra } }`
5. [x] Implemented `POST /api/<type>` for all 11 routers via a shared
       `createPostHandler` factory (`server/src/routes/content/writeHandlers.ts`)
6. [x] Implemented `PATCH /api/<type>/:id` for all 11 routers via a shared
       `createPatchHandler` factory — Correctable-Fields check first (runs
       unconditionally, before the source-type lookup — **see item 3a above,
       needs reordering to gate on source type**), then MANUAL
       passthrough, then `saveAs`. `sourceId` stripped from every PATCH body
       (a raw edit would bypass `saveAs`/`targetSourceId`, the mechanism meant
       to model that move).
7. [x] Implemented `DELETE /api/<type>/:id` — Class and Race get a custom
       dependent-aware handler (9 other types use a shared simple-delete
       factory, nothing references them). Class's dependent lookup joins
       **both** `ContentSubclass` and `ContentClassOption` per the
       reconciliation note. Race's lookup additionally covers the
       `ContentRace.parentRaceId` self-relation (subspecies) — not literally
       named in §1.7's table (an oversight predating that table's own
       ClassOption reconciliation), but structurally required since that FK
       is `onDelete: NoAction`, not `SetNull`.
       **`confirm` semantics resolved:** `confirm !== true` → 409 with the
       dependents list if any exist, else 400 `CONFIRM_REQUIRED`;
       `confirm === true` → always proceeds regardless of dependents (a
       client that already knows to send `confirm: true` can delete in one
       round trip).
8. [x] Implemented `DELETE /api/sources/:id/entries` (bulk-clear) —
       `server/src/utils/sourceContent.ts`'s `clearContentForSource`, table
       order mirrors orchestrator.ts's already-proven per-type refresh order.
       `confirmName` gate.
9. [x] **Already satisfied from Phase 1.2** — `DELETE /api/sources/:id`
       already returned the post-delete `warnings` array; refactored to reuse
       the new shared `findOrphanWarnings` helper (behavior-preserving — same
       pre-existing tests still pass).
10. [x] Updated `importSource`'s `importClasses`/`importRaces` to call
        `findClassDependentWarnings`/`findRaceDependentWarnings` right before
        their existing delete-then-reinsert step, aggregated and written to
        the new `ImportJob.warnings` column. **Split into two functions, not
        one combined check** — a combined version would double-count/report
        prematurely, since RACE and CLASS are separate content types each
        running their own delete independently.
        **Schema gap found and resolved with the user:** `ImportJob.warnings`
        didn't exist (only `errorLog`) — added as a new nullable column,
        migrated (`20260807192530_phase4_write_api`).
11. [x] Updated `dragonledger-master-schema.md`'s `ImportJob` block with the
        new `warnings` column. (The nullable-FK reconciliation this item
        originally anticipated had already been done in an earlier pass.)
12. [x] End-to-end verified via `content-write.test.ts` (real HTTP requests
        against the live app + db, not mocked): delete an official class with
        both an official and homebrew subclass attached → official subclass
        gone, homebrew subclass `null`-parented and listed in the 409/204
        response; a follow-up `deleteMany` reproducing exactly what a source
        refresh would run doesn't throw. Same coverage for Race, including
        the subspecies self-relation path.
13. [x] Wrote Phase 4 tests — `server/src/__tests__/content-write.test.ts`,
        23 tests, run against live `dev.db`. Full suite: 172/172 passing.

---

## Phase 5 — Browse UI

> Full rationale and every resolved decision: `DevTools/Claude/phase-5.md`.

1. [x] `npm install @tanstack/react-query @tanstack/react-virtual` in `client/`
2. [x] Set up `QueryClientProvider` at the app root
3. [x] Confirm Phase 3's `?fields=name` support exists before building the name-index hook
4. [x] Build `useContentList`, `useContentNameIndex`, `useContentDetail` under `client/src/hooks/`
5. [x] Build `SourceMultiSelect` (all-checked default) and `NameSearchInput` — shared across all 8 filter bars.
       **Extended beyond the original design:** the live db has 1,265 `Source`
       rows (one per Compendium book), so `SourceMultiSelect` also got an
       in-popover search filter — a plain unfiltered checkbox list at that
       scale would be unusable. Pure rendering-scope addition, doesn't touch
       the query shape.
6. [x] Build the 8 `<Type>FilterBar` components under `client/src/components/filters/`
       (Spell, Class, Race, Background, Condition, Item, Monster, **Feat**)
7. [x] Build `ResultsTable` + `PositionBar` (revised from a card grid — see
       `phase-5-browse-ui-final-export.md` §1.7) — the most involved piece of
       this phase; budget real time for scroll-math/jank. Placeholder `<Type>Row` for now.
       **Real bug found and fixed via manual browser verification** (not just
       typecheck): jump-to-position initially snapped back to the top instead
       of landing on the target, because changing the query's anchor page
       transiently collapsed `total` to 0 mid-transition. Fixed with
       `placeholderData: keepPreviousData`.
8. [x] Build `BrowseScreen` — sidebar, per-type `BrowseState`, filter bar, results table
9. [x] Build `DetailScreen` — `Breadcrumb`, `SourceBadge`, placeholder
       `<Type>DetailFields`, auth-gated Edit/Delete (Delete wired to Phase 4's `{ confirm: true }` contract,
       full two-step confirm flow including Class/Race's dependents preview)
10. [x] Verified via Playwright screenshots against the real dev server (no
        client-side automated test runner exists yet — flagged as a real gap,
        not addressed this phase): all 8 content types preserve independent
        filter state within a session; position-bar drag shows live names
        (from the name index, confirmed via screenshot) without full-record
        fetches; jump-to-position renders correctly without fetching
        everything in between (confirmed after the bug fix above).
11. [ ] **Do not consider Phase 5 fully complete** until the dedicated
        table-row column design and the `<Type>DetailFields` ("card") design
        session both happen — data reference for the latter:
        `Documentation/card-design-spec.md`. **Still open** — this phase
        intentionally built everything around these two placeholders per
        this item's own instruction, not an oversight.
12. [x] **RESOLVED — Class-detail only, no 9th tab.** The design doc's own
        "leaning toward" default for `ContentClassOption`'s Browse placement,
        confirmed with the user before building `BrowseScreen`'s sidebar.
13. [x] **Real Phase 3/4 gap found and fixed:** the `?source=` filter only
        ever supported a single value — Phase 5's multi-select requires
        filtering by several sources at once. Extended to accept repeated
        `?source=` params (`sourceId: { in: [...] }`), backwards compatible
        with every existing single-value usage. New test in `content.test.ts`.

---

## Phase 6 — Import UI

> Full rationale and every resolved decision: `DevTools/Claude/phase-6.md`.
> Design doc: `Documentation/Phase-6-Import-UI-Design-Decisions.md`.

- [x] Source list (`/sources`) — table, actions (Re-import for `type: 'API'`
      sources only, Delete, **Clear entries** wired to Phase 4's bulk-clear
      endpoint), "Add Source" dialog
- [x] Import wizard Step 1 — **three** import-type options: Open5e API,
      Compendium XML _(new)_, JSON file
- [x] Import wizard Step 2b (Compendium) — file picker + the
      `AWAITING_CONFIRMATION` duplicate-summary step before the real import runs
- [x] Progress view — per-content-type progress, live counts, error list.
      Shared across all three import kinds via one `Step3Progress` component.
- [x] Write Phase 6 tests including the Compendium `AWAITING_CONFIRMATION`
      flow — `server/src/__tests__/importRoutes.test.ts` (8 tests) and
      `server/src/__tests__/importers/jsonFileImporter.test.ts` (6 tests).
      The SSE stream-persistence fix itself (see below) has no automated
      regression test — verified manually, flagged as a real coverage gap.
- [x] **Four real bugs found and fixed, none visible from the design doc or
      typecheck alone:**
      1. SSE route closed the stream on any `DONE` event, including the one
         `AWAITING_CONFIRMATION` uses — contradicted the design doc's own
         requirement that the stream stay open through a Compendium pause.
      2. Nothing let the client see *what* matched when a Compendium job
         paused — added `GET /api/import/:jobId`.
      3. **The Electron file-picker was completely non-functional** — the
         preload script's `import` syntax compiled to real ESM, but
         Electron's sandboxed preload loader can't parse `import` at all
         regardless of `"type": "module"`. Only caught by actually launching
         Electron (Playwright `_electron`); no typecheck or plain-browser
         test could have found it. Fixed via TypeScript's `.cts` extension
         (forces CommonJS output for just that one file).
      4. **The server test suite silently double-ran itself** whenever
         `server/dist/` was populated by a real build — Vitest 4's default
         `exclude` no longer covers `**/dist/**`, so compiled
         `dist/__tests__/*.test.js` duplicates raced the real `src/` sources
         against the same live `dev.db`. Fixed with an explicit exclude in
         `server/vitest.config.ts`; this had been silently latent since
         Phase 1 (never triggered before because a full `tsc` build of the
         server workspace hadn't run mid-session until now).
- [x] New backend, not in the original outline: `POST /api/import/file`
      (JSON import, Appendix B shape) and `ImportJobType` extended to
      `OPEN5E | FILE | COMPENDIUM | JSON_FILE`.

---

## Phase 7 — Edit & Create UI

1. [x] Set up `@dragonledger/content-types` workspace package — move Zod
       schemas here first; both client and server code depend on it going forward
2. [x] `npm install react-hook-form` + its Zod resolver in `client/`
3. [x] Build `FixedChoiceGrantWidget` first — most-reused, several other widgets compose it
4. [x] Build remaining shared widgets: `AbilityScoreGrid`, `SpeedWidget`,
       `ActionListWidget`, `PropertyListWidget`, `TraitListWidget`,
       `ComponentsWidget`, `ResistanceListWidget`, `SpellcastingWidget`
5. [x] Build `SourcePicker` (defaults to `homebrew`), `SaveButton`/`SaveAsPrompt`
       (wired to each type's Correctable Fields subset), `UnsavedChangesGuard`, `CreateSourceInlineDialog`.
       Also applied, as a prerequisite: the source-type-based Correctable
       Fields rule from `v1-roadmap-open-decisions.md` §4.1 (regenerated
       every `<Type>CorrectableSchema`, reordered `createPatchHandler` to
       check source type first) — SaveButton needed the real rule, not the
       stale per-type curated lists.
6. [ ] **Do not attempt all 8 (or 10, counting Subclass/Subrace) forms in one
       pass.** Each needs its own short design session (field layout,
       required/nullable off the Zod schema, Correctable Fields review,
       extraData-to-form-field decisions) before being built.
7. [ ] Per content type, before considering its form complete: Correctable
       Fields list is real and reviewed (not copied from another type),
       required/nullable matches the Zod schema, unsaved-changes guard and
       Save/Save-as behavior both verified against that type's actual field set
8. [x] **RESOLVED (2026-08-08, see `v1-roadmap-open-decisions.md` §0.1):**
       `ContentClassOption` gets no standalone form — edited inline within
       `ClassForm` when that type's form session happens

---

**Note on Desktop Packaging:** originally labeled "Phase 8" in early design
docs; that work was moved up front and actually lives at **Phase 0.7** near
the top of this document (see there for the full task list). The "Phase 8"
numeral itself is now used below for a different, later phase. Two items
tied to _later_ phases (they need Phases 2.5/5–7 to exist first) are listed
here for reference:

- [ ] Document the "back up your `userData` DB file before installing an
      update with new migrations" recommendation somewhere user-visible
- [ ] Full smoke test with real content once Phases 2.5–7 ship: import Open5e
      → import Compendium → browse → edit → delete → close → relaunch → data persists

---

## Phase 8 — Card Component Theming System

**COMPLETE (2026-08-10)** — design RESOLVED (2026-08-09) via `Documentation/phase-8-card-theming-final-export.md`
— a full handoff from a separate design-only session, no open decisions.
Deliberately sequenced *after* Phase 7: every content type gets a plain,
functional `<Type>Form`/`<Type>Card` first (Phase 7); this phase applies
real theming/print layout on top of all of them at once, rather than
styling each type twice. See the final-export doc for full detail — task
list per its §6:

1. [x] Build the shared component layer (`src/components/cards/shared/`):
       `Shell` (`.page`/`.document` targets, `PAGE_INNER_MAX` constant),
       `ThemeProvider` (Parchment/Scribe's Copy/Grimoire presets + the 5-slot
       custom theme builder, app-wide scope), `Divider` (major/minor +
       `suppressEdgeDividers()`), `Subcard` (corner-tab, shared across
       Race/Class/Monster-packet uses), `useFitToPage` hook (`monster` and
       `document` modes, shared `0.55` floor constant exported once). Done
       2026-08-09 — see `DevTools/Claude/phase-8.md`. Custom theme builder
       is data-model only (`ThemeProvider` accepts custom tokens); the
       actual settings UI is out of scope per item 5 below.
2. [x] Port the 5 shared utilities as pure functions with unit tests
       against the real example rows named in the doc: `grantShapeToText`,
       `parseFeatDescription`, `parseDescriptionBlocks`/`splitSentences`/
       segment-pagination trio, `groupFeatures`, `spellFooterFromExtraData`.
       Done 2026-08-09, 23/23 tests passing — see `DevTools/Claude/phase-8.md`.
3. [x] Build the orphaned-parent fallback (Subclass/Subrace) as one shared
       presentational pattern, not two separate implementations. Done
       2026-08-09/10 (`OrphanedParentFallback.tsx`) — wired into
       `SubclassCard`/`SubraceCard` as part of item 4 below.
4. [x] Build each per-type card component (§3 of the final-export doc)
       composing the shared pieces. Done 2026-08-10 for: Condition/Feat/
       Background/Item/Spell (List/`.page` mode), Race/Class (List +
       Expanded `.document` mode with Subcard-nested Subrace/Subclass),
       Monster (own width/scale logic via `useFitToPage`, per-section
       independent multi-column), Subclass/Subrace (orphaned-parent
       fallback wired in), **and, completed later the same day: Spell/
       Item's 2.5x3.5in trading-card sheet** (greedy pagination via
       `buildSegments`, "(cont.)" spillover, dashed cut guides, named-page
       print CSS, triggered as a bulk "Print as Trading Cards" action from
       Browse against whatever the current filters match) **and the
       Monster+Spellcasting packet** (`.document` flow: MonsterCard at top
       keeping its own fit-to-page scaling, then a spell appendix grouped
       by frequency/level as Subcards) — see `DevTools/Claude/phase-8.md`
       for both. All 10 render targets named in §3 of the handoff doc are
       now built.
5. [x] `ContentClassOption` card and the app-wide custom-theme-builder's
       real settings surface remain explicitly out of scope, unchanged.
       **Reconciled 2026-08-10:** the monster-spell-matching read API was
       originally on this out-of-scope list too, but the user explicitly
       asked for it to be built this session (case-insensitive name match,
       Open5e > Compendium > homebrew source-priority default, unresolved
       names render as plain text) — a deliberate scope decision made with
       full awareness of the doc's own caution here, not an oversight. The
       *reorderable, user-configurable* source-priority settings UI itself
       (letting someone change the default ranking) is still unbuilt and
       still out of scope — only the fixed-default matching logic exists.
6. [x] Visual pass against all 3 theme presets, done 2026-08-10 for every
       type built in item 4, including the trading-card sheet (Fireball +
       Delayed Blast Fireball, both editions, spilling across 2 sheets with
       working "(cont.)" pagination) and the Monster+Spellcasting packet
       (Adult Black Dragon's At Will/1-Day-Each spells all correctly
       resolved to real ContentSpell records with full descriptions) —
       verified live in the browser against real `dev.db` data. Subcard tab
       vertical clearance and the Grimoire print fallback both confirmed
       visually correct.

**Phase 8 is now complete** — every render target in the handoff doc's §3
is built, and every item in its own §6 task list is done. The only things
intentionally left unbuilt are the two items still flagged out of scope in
item 5 above (`ContentClassOption`'s card, and the real settings UI for
theme-building/source-priority-reordering), both of which need their own
upstream design decisions this phase never had scope to make.

---

## Cross-Phase / Housekeeping

- [ ] Keep `dragonledger-master-schema.md` in sync any time a field shape or
      relation changes during implementation — it's the one running source of truth
- [ ] Per the CLAUDE.md dev-log convention: write/update `DevTools/Claude/phase-X.Y.md`
      after completing each phase above, before asking to commit
- [ ] Re-run the full Vitest suite after each phase to catch regressions in earlier phases
