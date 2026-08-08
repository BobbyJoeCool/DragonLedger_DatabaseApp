# DragonLedger Database App — Build Outline

> **Purpose:** A local, single-user application for storing, searching, and managing
> D&D 5e content (spells, classes, races, backgrounds, conditions, items, monsters,
> feats) from multiple named sources. Content can be bulk-imported from the Open5e
> API or the `Complete_Compendium_5.5e.xml` file, manually entered, or edited and
> saved as homebrew. Sources can be refreshed (old data deleted, new data
> re-imported) without affecting other sources.
>
> **Philosophy:** One vertical slice at a time — schema → API → UI — with working
> tests before moving on. This app is intentionally simpler than DragonLedger Heroes;
> it is a content management tool, not a character sheet. It is genuinely a
> single-user, local-only tool — Heroes (a separate, planned mobile app) will
> eventually be the primary consumer and will handle its own cross-device sync.
>
> **Testing convention:** After completing each phase, run the full Vitest suite
> (`npm test`) to confirm no regressions before moving on. The phase test sections
> below define new tests; the regression run catches breakage in earlier phases.
>
> **Document map:** This outline is the build plan. Detailed design rationale for
> phases that have already been through a dedicated design session lives in
> `Documentation/*-final-export.md`; this file summarizes and checklists those
> decisions rather than repeating every worked example. The single current source
> of truth for the Prisma schema is `Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`
> — if this outline's Appendix A ever disagrees with that document, the master
> schema doc wins.

---

## ⚠️ Architecture Pivot (read this first)

Mid-build, a cross-cutting decision superseded every tech-stack line written
before it. Full reasoning: `Documentation/architecture-addendum-local-sqlite.md`.

- **Database:** SQLite (local file via Prisma's `sqlite` provider), not Azure SQL.
  No schema/field/JSON-as-`String` decision changes — only the `datasource` block.
- **Hosting:** None. This is not a hosted web app. It runs entirely on the user's
  own machine, eventually packaged as a desktop app via **Electron**.
- **Why:** The app is genuinely single-user with no scenario requiring shared,
  simultaneously-reachable data. Heroes (a companion app, built separately) will
  supersede this app's role long-term and handle its own sync; this app's real
  job is producing and curating content for later export, not running as an
  always-on service.
- **Auth middleware status — RESOLVED:** not needed for a local-only app. Retire
  it (or leave it disabled/no-op) for this build. **Revisit when integrating
  with Heroes** — that integration may reintroduce a real reachability
  scenario the gate was originally meant for.
- **Electron packaging timeline — RESOLVED:** build the Electron shell up
  front, right after Phase 0's scaffold — not deferred until Phases 5–7 are
  done. See Phase 8 below, which is now sequenced early despite its number
  (kept as "Phase 8" for continuity with the design-export doc naming).

---

## TECH STACK

| Layer       | Technology                         | Purpose                              |
| ----------- | ----------------------------------- | ------------------------------------ |
| Frontend    | React 19 + Vite + TypeScript       | SPA UI                               |
| UI          | Tailwind CSS v4 + shadcn/ui         | Styling and components               |
| API server  | Node.js + Express 5 + TypeScript    | Local API, auth gate, import logic   |
| ORM         | Prisma 6 (SQLite provider)          | Type-safe DB access + migrations     |
| Database    | **SQLite** (local file, in OS `userData` dir once packaged) | Persistent content storage |
| Validation  | Zod, shared between server routes and (via workspace package) the client | Import + write-API validation |
| Forms       | react-hook-form + Zod resolver       | Edit/Create UI (Phase 7)             |
| Data fetching | TanStack Query + TanStack Virtual | Browse UI list/detail fetching + virtualized results (Phase 5) |
| Shared types | `@dragonledger/content-types` workspace package | Zod schemas shared by client + server (Phase 7) |
| Auth        | Shared password (env var) — **priority under review** post-pivot | Single password gate; no user accounts |
| Testing     | Vitest + Supertest                  | Unit + integration tests             |
| Packaging   | **Electron** + `electron-builder`   | Desktop `.app`/`.dmg`, no hosting needed |
| CI/CD       | GitHub Actions (build/test only — no deploy target anymore) | Regression safety net |

Rejected packaging alternatives (see architecture addendum §4): Tauri (backend is
Rust — would require running Express as a separate sidecar process) and Node
SEA/pkg (bundles only the server, not a real window — user would still open a
browser tab manually).

---

## REPO STRUCTURE

```
/
  /client               ← Vite + React frontend
    /src
      /api              ← Typed fetch wrappers
      /components        ← Reusable UI primitives (shadcn extended)
      /screens           ← Full page views (Browse, Detail, Import, Sources)
      /hooks              ← Custom React hooks (useContentList, useContentNameIndex, useContentDetail)
  /server               ← Node.js + Express API
    /src
      /routes            ← Express routers (content, sources, import, auth)
      /middleware        ← Password auth guard, error handler
      /db                ← Prisma client + query helpers
      /importers
        /open5e          ← One transform file per content type + orchestrator
        /compendium      ← XML parser + one transform file per content type + orchestrator
        /utils           ← fetchWithRetry, shared composite-resistance/telepathy parsers
      /schemas/content   ← Zod schema per content type (full / .partial() / Correctable)
  /packages
    /content-types       ← Shared Zod schemas (client + server), Phase 7
  /prisma
    schema.prisma        ← Single source of truth for DB schema (provider = "sqlite")
    /migrations          ← Prisma-generated migration files (bundled into the Electron app)
  /electron               ← Electron main process + electron-builder config (Phase 8)
```

---

## DATA MODEL OVERVIEW

Every content entry belongs to a **Source**. A source has a name, a type, and
can be refreshed. **Refresh semantics now differ by source type** — this is a
deliberate, load-bearing distinction, not an oversight:

- **`API` sources (Open5e):** delete-and-replace. Re-running a refresh deletes all
  of that source's entries and re-imports fresh data.
- **`FILE` sources (Compendium XML):** **additive-only, never-overwrite.** A
  same-source, same-slug match is skipped unconditionally on every re-run — this
  is what makes local text corrections to Compendium-sourced entries durable,
  since a static XML file has no upstream to re-pull a fix from. A Compendium
  import is expected to run once per database lifetime, not on a recurring cadence.
- **`MANUAL` sources (homebrew):** never touched by any import job.

```
Source
  id          String  (e.g. "open5e-srd-2024", "homebrew", a parsed per-book id)
  name        String  (display name)
  type        Enum    API | FILE | MANUAL
  description String?
  lastUpdated DateTime
  isDeletable Boolean (false for "homebrew" and other built-in placeholder sources)

ContentType  Enum: SPELL | CLASS | SUBCLASS | RACE | SUBRACE | BACKGROUND
                   | CONDITION | ITEM | MONSTER | FEAT
```

A seeded, non-deletable `Source` row (`id: "homebrew"`, `type: MANUAL`) always
exists from app start — there is no "zero MANUAL sources" edge case.

**Content tables, current (8 browsable types, plus 2 satellite tables):**

```
ContentSpell   ContentClass   ContentSubclass   ContentRace   ContentSubrace
ContentBackground   ContentCondition   ContentItem   ContentMonster
ContentFeat                              ← new: standalone, prerequisite-gated, not class-locked
ContentClassOption                       ← new: class-gated pool (Metamagic / Eldritch Invocations / Maneuvers)
Language                                 ← new: seeded + grows via upsert; not a strict FK anywhere
ImportJob                                ← new: DB-backed job/progress record, not in-memory only
```

**Feature vs. Feat vs. ContentClassOption** — three genuinely different things,
established during the Compendium sessions:
- **Feature** — automatic, granted by an existing choice (class/race/background).
  Stays embedded inline JSON on its parent; never independently browsable.
- **Feat** — standalone, independently selectable, gated only by a prerequisite
  (not by class). Gets its own top-level table and Browse tab.
- **ContentClassOption** — a themed pool gated behind one specific class
  (Metamagic, Eldritch Invocations, Maneuvers). Its own table; **not** decided
  to be its own Browse tab (see Open Questions).

Each content table has `sourceId` (FK → Source) so a source refresh/clear is a
`DELETE WHERE sourceId = X` (Open5e) or an additive skip-check (Compendium).
Full current Prisma schema, ER diagram, and worked examples:
`Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`.

---

## PHASE 0 — Project Scaffold

### 0.1 Repo & Tooling

- [x] `npm workspaces` configured (`client`, `server`)
- [x] TypeScript strict mode in both packages
- [X] ESLint + Prettier across both packages
- [x] Vitest configured in `server`
- [x] `.env` setup: `DATABASE_URL`, `APP_PASSWORD`, `CLIENT_ORIGIN`, `PORT`
- [x] `.gitignore` covers node_modules, .env, dist, *.db

### 0.2 Server Setup

- [x] Express + TypeScript
- [x] `tsx` for local dev (`npm run dev` watches and restarts)
- [x] Global error handler middleware
- [x] Health check: `GET /api/health → { status: 'ok' }`
- [x] CORS configured for client origin

### 0.3 Client Setup

- [X] Vite + React 19 + TypeScript
- [x] Tailwind CSS configured
- [x] shadcn/ui initialized (`npx shadcn@latest init`)
- [x] React Router — placeholder routes:
  - `/` → redirect to `/browse`
  - `/browse` — search/filter content
  - `/browse/:type/:id` — detail view
  - `/sources` — source management
  - `/sources/import` — import wizard
- [x] Base layout: sidebar nav + main content area

### 0.4 Database Setup — ⚠️ target changed to SQLite

- [x] Prisma installed (originally against Azure SQL — **superseded**)
- [x] Update `datasource` block to `provider = "sqlite"`, `url = "file:./dev.db"`
- [x] Confirm Prisma 6.2+ enum/JSON support on SQLite (verified fact, not
      re-research — see architecture addendum §2): enums enforced at the Prisma
      Client layer, not a DB `CHECK` constraint, since SQLite has no native enum type
- [x] `server/src/db/client.ts` exports the shared Prisma client

### 0.5 Auth Middleware — RESOLVED: not needed locally, revisit for Heroes

**Decision:** the app is local-only, so the password gate's original threat
model (a hosted API reachable by anyone with the URL) doesn't apply. **Retire
or disable this middleware for the local build.** Revisit if/when Heroes
integration introduces a real reachability scenario.

- [x] `server/src/middleware/auth.ts` (exists, built in Phase 0)
- [x] Reads `x-app-password` header (or `Authorization: Bearer <password>`)
- [x] Compares to `APP_PASSWORD` env var
- [x] Returns 401 if missing or wrong
- [x] All non-read routes (POST, PATCH, PUT, DELETE) are protected
- [x] GET (browse/read) routes are **public** — no password required to view content
- [x] Client: password stored in `sessionStorage`; injected into every mutating request
- [x] Login screen: single password input, redirects to `/browse` on success
- [x] Remove (or no-op) the auth requirement across all write routes for the
      local build; keep the middleware file/tests in place rather than
      deleting the code outright, so it's easy to re-enable for Heroes
- [x] Update every later phase's "*(auth)*" annotations mentally to "no-op
      locally, real again for Heroes" — not rewritten line-by-line throughout
      this document, since the endpoint contracts themselves don't change

### 0.6 Phase 0 Tests

- [x] Health check returns 200
- [x] Auth middleware: correct password → 200, wrong → 401, missing → 401
- [x] Prisma client connects without error

---

## PHASE 0.7 — Desktop Packaging (Electron) — build up front

> **Decided:** since Electron is happening regardless, build the shell now,
> right after the scaffold, instead of bolting it on at the end. This is the
> same content that was originally scoped as "Phase 8" in the design session
> (`Documentation/architecture-addendum-local-sqlite.md` §4–6) — kept under
> that label for cross-reference, just moved earlier in the build order.
> Replaces the original outline's Azure Deployment phase entirely; there is no
> hosted target anymore.

### 0.7.1 Single-Process Production Mode

- [x] `npm run build` compiles the React app to static files
- [x] Express serves those files directly (`express.static()`) alongside its
      own API routes, all on one port — the target mode for the packaged app
- [x] Dev mode keeps two processes (Vite dev server + Express), unified under
      one root `npm run dev` via `concurrently`, Vite proxying `/api/...` to Express

### 0.7.2 Electron Shell

- [x] Electron opens a window pointed at the local Express server — no rewrite
      of server code, no separate server binary; Express runs directly inside
      Electron's own Node environment
- [x] `electron-builder` packages the compiled frontend + Express server +
      bundled Node runtime into a double-clickable `.app`
- [ ] Signed/notarized `.dmg` for macOS distribution — **deferred**, needs an
      Apple Developer certificate not yet available; current build is unsigned
      (`identity: null`), triggers a Gatekeeper warning on first open

### 0.7.3 Data Persistence Across App Updates

- [x] **The SQLite database file must live in the OS-managed `userData`
      directory** (`app.getPath('userData')` — macOS:
      `~/Library/Application Support/DragonLedger/`), **never** inside the app
      bundle's own Resources folder — an `electron-builder` update replaces the
      bundle wholesale, wiping anything stored inside it

### 0.7.4 Migrations Against an Existing Local Database

- [x] Bundle Prisma migration files with the app (negligible size) — mechanism
      wired via `extraResources`; `prisma/migrations/` is currently empty since
      Phase 1 hasn't run yet
- [x] On every app launch, run `prisma migrate deploy` (non-interactive,
      production-safe) against the `userData` DB path — applies only
      not-yet-applied migrations via the `_prisma_migrations` tracking table
- [ ] Be aware: SQLite's limited `ALTER TABLE` support means Prisma's migration
      engine falls back to create-copy-drop-rename for anything beyond a simple
      column add — automatic, not hand-written, and effectively instantaneous
      at this app's data scale
- [ ] Document the recommended habit: back up the `userData` SQLite file (plain
      file copy) before installing any version that includes new migrations

### 0.7.5 Checklist (revised for local packaging, building this early)

- [x] Since every later phase (1 through 7) will build on top of whatever's
      running inside this Electron shell, confirm early that hot-reload / dev
      workflow through Electron doesn't get in the way of normal phase-by-phase
      development — if it does, keep using the plain browser dev flow for
      day-to-day work and only verify inside Electron periodically, rather than
      let packaging friction slow down every subsequent phase — confirmed:
      `dev:electron` is a secondary/optional script, `npm run dev` (plain
      browser) remains the primary day-to-day workflow
- [ ] Smoke test once Phase 1's schema exists: fresh install → schema migrates
      → app opens to an empty Browse screen → close and relaunch → data persists
- [ ] Full smoke test (re-run once Phases 2–7 are complete): import Open5e
      content → import Compendium → browse → edit one entry → delete it →
      close and relaunch → data persists
- [ ] Confirm a migration-bearing update correctly applies against an existing
      `userData` database without data loss (test with a real prior-version DB copy)

---

## PHASE 1 — Database Schema & Source Management

### 1.1 Prisma Schema

Define all models per the current master schema (see
`Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`, Section 1, for the
authoritative full block). Key rules, unchanged from the original design:
- Every content table has `sourceId String` → FK to `Source`
- JSON columns stored as `String` (pre-stringify before insert)
- `slug` field on each content table: unique within source, URL-safe identifier

```
Models (current, 12 total):
  Source
  ImportJob
  ContentSpell
  ContentClass
  ContentSubclass
  ContentRace
  ContentSubrace
  ContentBackground
  ContentCondition
  ContentItem
  ContentMonster
  ContentFeat
  ContentClassOption
  Language
```

See **Appendix A** for full field lists per content type.

- [ ] All models defined in `schema.prisma`, including the Phase 2 / Phase 4 /
      Compendium-driven additions (see Appendix A for the delta from the
      original Phase 1 field lists)
- [ ] `prisma migrate dev --name init` creates the first migration
- [ ] Foreign keys verified — note the deliberately mixed `onDelete` behavior:
      `Cascade` from Source; `SetNull` for `ContentSubclass.classId` /
      `ContentSubrace.raceId` / `ContentClassOption.classId` (cross-source
      homebrew must survive a parent's deletion); `NoAction` for
      `ContentRace.parentRaceId` self-relation (2014-style subspecies)
- [ ] Seed the non-deletable `"homebrew"` `Source` row and the `Language` table
      (see Appendix A) as part of schema setup, not deferred to Phase 4

### 1.2 Source API Endpoints

- [ ] `GET /api/sources` — list all sources (id, name, type, entryCount, lastUpdated)
- [ ] `POST /api/sources` — create a new manual source `{ name, description }` *(auth)*
- [ ] `GET /api/sources/:id` — single source detail
- [ ] `DELETE /api/sources/:id` — delete source and ALL its entries *(auth)*
  - Returns 400 if source has `isDeletable: false`
  - Per Phase 4: no dependent pre-check here; `SetNull` clears cross-source
    links silently; response includes a `warnings` array listing anything orphaned

### 1.3 Phase 1 Tests

- [ ] Source CRUD operations work correctly
- [ ] Deleting a source cascades to delete all its content entries
- [ ] Cannot delete a protected source (`homebrew` or any `isDeletable: false` row)

---

## PHASE 2 — Open5e Import

> Goal: import all content from the Open5e API into the DB under a named
> source. Re-importing deletes old data for that source only (delete-and-replace
> — distinct from Phase 2.5's Compendium behavior). Full design rationale and
> per-content-type mapping tables: `Documentation/phase-2-import-final-export.md`.

### 2.1 Import Job Model & Progress

- [ ] `ImportJob` is a **DB-backed** model, not in-memory only (survives a
      restart; `GET /api/import/history` reads directly from it)
- [ ] Small in-memory `EventEmitter` per running job pushes live SSE updates;
      every update also writes through to the `ImportJob` row
- [ ] `ImportJobType` enum: `OPEN5E | FILE`; `ImportJobStatus` enum:
      `PENDING | AWAITING_CONFIRMATION | RUNNING | COMPLETED | FAILED | PARTIAL`
      (`AWAITING_CONFIRMATION` is used by Phase 2.5's Compendium flow, not Open5e)

### 2.2 Import Service (`/server/src/importers/open5e/`)

- [ ] `fetchAllPages(endpoint)` — handles Open5e pagination (`next` cursor)
- [ ] `fetchWithRetry` — 3 attempts, base 500ms exponential backoff, honors
      `Retry-After` on 429
- [ ] One transform file per content type (`spells.ts`, `conditions.ts`,
      `races.ts`, `backgrounds.ts`, `classes.ts`, `items.ts`, `monsters.ts`) —
      field mappings per the final export doc, Section 2
- [ ] Batch insert: chunk size 500 rows per `createMany` call — **⚠️ needs
      recalculation, not just re-verification, now that the target DB changed
      from SQL Server to SQLite.** Concretely: each column value in each
      inserted row counts as one bound "parameter" in the underlying SQL
      statement. The original 500-row chunk size was sized against SQL
      Server's ~2,100-parameter-per-query limit. SQLite's own default cap is
      much lower (~999 parameters total, sometimes higher depending on build).
      For a wide table like `ContentMonster` (~25 columns), 500 rows × 25
      columns = 12,500 parameters — far over SQLite's limit, and would throw
      at import time. **Fix:** compute a safe chunk size per model as
      `floor(SQLITE_PARAM_LIMIT / columnCount)` (or just pick one conservative
      universal batch size, e.g. 30–50 rows, comfortably under the limit for
      even the widest model) instead of reusing "500" everywhere.
- [ ] Rollback boundary: **whole content type**, not per-chunk — a bad record
      rolls back that entire type's transaction; other content types in the
      same import are unaffected
- [ ] `importSource(sourceId, contentTypes[])` orchestrates: upsert Source →
      delete existing rows for that sourceId per content type → fetch +
      transform + chunked insert → update `Source.lastUpdated`
- [ ] Build order (dependency-driven): Conditions & Spells first (no
      cross-references) → Races (base races before subraces/lineage synthesis)
      → Classes (before Subclasses) → Items → Monsters last (needs Spells to
      exist for spellcasting-trait name-matching)
- [ ] Import is **idempotent** — running again replaces old data cleanly

### 2.3 Validation

- [ ] Zod, one schema module per content type (`server/src/schemas/content/*.ts`),
      each exporting a full schema and a `.partial()` variant — shared between
      this phase's import validation and Phase 4's write-API validation

### 2.4 Import API Endpoints

- [ ] `POST /api/import/open5e` *(auth)* — body `{ sourceId, sourceName, contentTypes }`, returns `{ jobId }`
- [ ] `GET /api/import/progress/:jobId` — SSE stream: `{ type, total, done, errors }`
- [ ] `GET /api/import/history` — list of past import jobs, read from `ImportJob`

### 2.5 Phase 2 Tests

- [ ] `fetchAllPages` correctly follows pagination
- [ ] Each transform function maps required fields correctly (cross-check
      against the "needs verification" items below before trusting)
- [ ] Import with an existing sourceId replaces data, not duplicates
- [ ] A bad record in one content type rolls back only that type; other types
      in the same import complete successfully
- [ ] Retry/backoff triggers correctly on a simulated 429/transient failure

**⚠️ Flagged as needing live-sample verification before implementation treats
them as settled** (see final export §7, item 8): Classes' `skillChoices` /
`armorProfs` / `weaponProfs` parsing from feature prose (no direct API field);
the hardcoded lookup tables (hit-die fallback, spellcasting ability by class,
multiclass AND/OR logic) need confirmation they cover all SRD 2024 classes.

---

## PHASE 2.5 — Compendium Import (`Complete_Compendium_5.5e.xml`)

> New phase, not in the original outline. A second transform pipeline feeding
> the same schema Phase 2 built — not a separate schema. Full design:
> `Documentation/compendium-import-final-export.md` and
> `Documentation/compendium-race-subrace-reimport-safety-export.md`.

### 2.5.1 Source & Naming Conventions

- [ ] Per-book `Source` rows, parsed from citation text (`"Source:\t<Book> p. <n>"`)
      embedded at the end of a record's text/description field
- [ ] Single fallback source (`id: "fc5-compendium-uncredited"`) for anything
      with no parseable citation
- [ ] `[5.5e]` / `(HB)` name suffixes stripped, tagged in `extraData.edition` /
      `extraData.homebrew` — **per-feature inside Class/Subclass processing,
      not just once per record** (confirmed real: the same Cleric file tags
      one Domain feature `2024` and its duplicate `2014` independently)
- [ ] **Multi-book citations — RESOLVED:** when one record cites more than one
      source book (e.g. `"Curse of Strahd p. 209, Van Richten's Guide to
      Ravenloft p. 34"`), resolve to a single `Source` via a **priority
      ranking** — whichever cited book has the higher priority wins. The rule
      itself is settled; the actual ranking data isn't built yet. **Implementation
      task:** define a priority ordering for known books (e.g. a `priority: Int`
      field on `Source`, or a hardcoded ranking table alongside
      `COMPENDIUM_TO_OPEN5E_SOURCE`) — this is a real data/research task, not a
      design decision, same pattern as that lookup table.

### 2.5.2 XML Parsing Layer

- [ ] Real XML parser (not string-splitting) — build before any per-type transform logic

### 2.5.3 Duplicate Detection & Re-Import Safety

- [ ] `COMPENDIUM_TO_OPEN5E_SOURCE` lookup table (many-to-one; a real research
      task — cross-reference book titles against Open5e's `document.key` values)
- [ ] **Two-layer duplicate resolution, every import (first-run or re-run):**
  1. Same-source check (sourceId + slug already exists from a prior Compendium
     import) → **skip unconditionally, never re-evaluated** — this is what makes
     local corrections to Compendium content durable
  2. Cross-source check (matches an Open5e source via the lookup table) →
     batch-level `AWAITING_CONFIRMATION` prompt: "N records match — import as
     duplicates, or skip?" No per-record prompt; no "overwrite" option (would
     be silently destroyed on the next Open5e refresh)
  3. Neither → import fresh
- [ ] Implement as a **distinct code path** from Open5e's `importSource` —
      additive-only vs. destructive-replace are different enough mechanisms
      that sharing one function risks a future Open5e change leaking into
      Compendium's supposedly-safe path

### 2.5.4 Schema Additions for This Phase

- [ ] `ContentFeat`, `ContentClassOption`, `Language` models (Appendix A)
- [ ] `ImportJobStatus.AWAITING_CONFIRMATION`

### 2.5.5 Standing Conventions (apply to both Open5e and Compendium)

- [ ] Composite resistance/immunity/vulnerability parser — recognizes "B/P/S
      from nonmagical attacks, unless silvered"-shaped phrases as one atomic
      `{ types: [...], nonmagical: true, bypassedBy }` entry, not split on commas
- [ ] Language + telepathy extraction — `"telepathy X ft."` parsed out of free
      text into `extraData.telepathyRange`, separate from the language list

### 2.5.6 Per-Content-Type Mapping — Build Order

- [ ] Feat & Spell first (establish citation-parsing/suffix-stripping utilities)
- [ ] Item
- [ ] Background — **flagged: 6-record sample only**, implement conservatively,
      log unrecognized traits liberally
- [ ] Monster (reuses the standing-convention parsers)
- [ ] **🚩 REQUIRED before Class/Subclass or Race/Subrace are implemented —
      confirmed by user, not just a standard flag:** the current design is
      verified against exactly **one class file** (Cleric 2024) and **two race
      files** (Elf/Wood Elf, Dwarf). That is not enough to trust the
      parenthetical-suffix subclass-detection rule or the comma-separated
      subrace-naming convention at scale. **Pull a much larger real sample —
      multiple classes spanning both 2014 and 2024 editions, multiple race
      families with real subraces, and at least one genuine third-party/
      homebrew example of each — before writing or trusting either transform.**
      This is a blocking prerequisite step, not follow-up cleanup.
- [ ] Class/Subclass (hardest — parenthetical-suffix subclass detection);
      implement defensively even after the broader sample above, logging every
      subclass-routing decision for spot-checking
- [ ] Race/Subrace — comma-separated `"ParentRace, SubraceName Edition"` naming
      convention (not the documented-but-absent `<ancestry>` field); subraces
      import as **complete standalone records** (no lineage-table synthesis
      needed, unlike Open5e); description text gets the safeguarded
      paragraph-match stripping (never strips on low confidence or a
      not-yet-imported parent)
  - [ ] **`<ability>` / `<resist>` / `<vulnerable>` / `<conditionResist>` /
        `<conditionImmune>` / `<proficiency>` / `<weapons>` / `<tools>` /
        `<languages>` — RESOLVED:** no dedicated `ContentRace`/`ContentSubrace`
        column exists for any of these. **Synthesize each into a `traits[]`
        entry** (consistent with how Open5e represents every race grant as
        trait prose — keeps `traits[]` the one canonical place a race's
        mechanical grants live, regardless of source). **Also preserve the
        original raw field value in `extraData`** as a backup/cross-check
        (e.g. `extraData.rawAbility`, `extraData.rawResist`, etc.) rather than
        relying on the synthesized trait alone.

### 2.5.7 Cross-Source Parent Resolution (Subclass & Subrace)

- [ ] Resolution order when a Compendium-derived Subclass/Subrace needs a
      parent: (1) existing Open5e-sourced match preferred, (2) existing
      Compendium-sourced match, (3) import anyway with `classId`/`raceId: null`,
      flagged via `extraData.unresolvedClassName` / `extraData.unresolvedRaceName`

### 2.5.8 Phase 2.5 Tests

- [ ] Re-running the same Compendium file never overwrites a previously-edited row
- [ ] A record matching a mapped Open5e source triggers `AWAITING_CONFIRMATION`
      and respects the user's duplicate/skip choice for the whole batch
- [ ] Subclass/Subrace parent resolution prefers Open5e over Compendium, and
      falls back to `null` + flag rather than dropping the record
- [ ] Composite resistance parser produces the structured shape, not a naive comma-split
- [ ] Race/Subrace's synthesized-trait fields (`<ability>`/`<resist>`/etc.) show
      up correctly in `traits[]` **and** the raw value is still present in `extraData`
- [ ] A record citing two source books resolves to the higher-priority one, not the first-listed one arbitrarily

**Consolidated open verification flags** (not yet confirmed against a broad
sample): Feat's `GENERAL` category default for unprefixed names, Item's
rarity/attunement text-parsing (no confirmed reliable pattern). (Class/Subclass
and Race/Subrace sample-size verification is no longer just a flag — see the
blocking prerequisite step in §2.5.6 above.)

---

## PHASE 3 — Content Read API

> All read endpoints are public (no auth). These power the browse and detail
> screens. This phase has **not** been through its own dedicated design session
> since the original outline — the items below are the original scope plus two
> additions surfaced as dependencies by later phases.

### 3.1 Shared Query Patterns

Every content type supports:
- `?source=` — filter by sourceId
- `?q=` — name search (case-insensitive, partial match)
- `?page=` / `?limit=` — pagination (default limit: 50)
- Response envelope: `{ data: [], total, page, limit }`
- [x] **New requirement, surfaced by Phase 5:** `?fields=name` (or equivalent)
      lightweight mode returning only `{ id, name }` pairs — powers the Browse
      position-bar name index without a full-record fetch per row. Confirm this
      is built before Phase 5's `useContentNameIndex` hook is implemented.
      **Implemented:** bare `{id,name}[]` array (no envelope), ignores
      `page`/`limit` — returns every filtered match, since the position bar
      needs names across the whole result set.

### 3.2 Endpoints Per Content Type

**Spells** — `GET /api/spells` (filters: `level`, `school`, `class`, `source`, `q`), `GET /api/spells/:id`
**Classes & Subclasses** — `GET /api/classes` (filters: `source`, `q`), `GET /api/classes/:id`, `GET /api/subclasses?classId=`
**Races & Subraces** — `GET /api/races` (filters: `source`, `q`), `GET /api/races/:id`, `GET /api/subraces?raceId=`
**Backgrounds** — `GET /api/backgrounds` (filters: `source`, `q`), `GET /api/backgrounds/:id`
**Conditions** — `GET /api/conditions` (filters: `source`, `q`), `GET /api/conditions/:id`
**Items** — `GET /api/items` (filters: `type`, `rarity`, `source`, `q`), `GET /api/items/:id`
**Monsters** — `GET /api/monsters` (filters: `cr`, `type`, `source`, `q`), `GET /api/monsters/:id`
**Feats** *(new type)* — `GET /api/feats` (filters: `category`, `source`, `q`), `GET /api/feats/:id`

- [x] **RESOLVED:** `ContentClassOption` gets its own top-level endpoint,
      `GET /api/class-options` (filters: `classId`, `pool`, `source`, `q`) —
      not only nested under a Class's detail response. Chosen because most
      live rows have `classId: null` (general Maneuvers/Invocations not yet
      linked to a class) and still need to be independently listable.

### 3.3 Phase 3 Tests

- [ ] Each endpoint returns correctly shaped response, including Feat
- [ ] Filters combine correctly (level + class on spells)
- [ ] Pagination: `total` matches actual count, pages are consistent
- [ ] `?fields=name` mode returns the lightweight shape and nothing else
- [ ] Unknown id returns 404

---

## PHASE 4 — Content Write API (Create, Update, Delete)

> All decisions below finalized in a dedicated design session. Full rationale:
> `Documentation/phase-4-write-api-final-export.md`. All write endpoints require auth.
>
> **Implemented Phase 4** — full rationale and every resolved decision:
> `DevTools/Claude/phase-4.md`.

### 4.1 Homebrew Destination & Seed Data

- [x] Seeded `Source` row `{ id: "homebrew", name: "Homebrew", type: MANUAL,
      isDeletable: false }` present from app start (Phase 1.1)
- [x] `saveAs: "homebrew"` defaults to this source; client may override with
      `targetSourceId` to file under a different MANUAL source

### 4.2 Create — `POST /api/:type` (auth)

- [x] Body: content fields + `sourceId` (must resolve to a `MANUAL` source)
- [x] 201 success / 400 `SOURCE_NOT_MANUAL` / 409 `SLUG_CONFLICT` (DB-level
      `@@unique([sourceId, slug])` constraint, same for homebrew copies) /
      400 `VALIDATION_ERROR`

### 4.3 Update — `PATCH /api/:type/:id` (auth)

- [x] **Correctable Fields mechanism:** each content type gets a third Zod
      schema — a `.pick().strict()` subset of fields that were *derived/inferred
      by our own import parser* (safe to edit in place on an official entry
      without triggering the `saveAs` decision). If every changed field parses
      against this subset, apply in place regardless of source type.
- [x] Otherwise: entry already `MANUAL` → apply in place, no `saveAs` needed.
      Entry non-`MANUAL` and no `saveAs` → 400 `SAVE_AS_REQUIRED`.
      `saveAs: "original"` → overwrite in place. `saveAs: "homebrew"` → new row
      under the resolved homebrew destination, original untouched.
- [x] `saveAs: "homebrew"` is a general "duplicate this entry" action, valid
      regardless of whether the original is official or already homebrew —
      not only an official-content escape hatch
- [x] Response codes: 200 in-place / 200 `saveAs: original` / 201 `saveAs: homebrew`
      / 400 `SAVE_AS_REQUIRED` / 409 `SLUG_CONFLICT` / 400 `VALIDATION_ERROR`
- [x] **RESOLVED — every type's Correctable Fields list decided** (drafted
      against this section's own criterion, confirmed with the user before
      implementation): Spell/Condition none (their real inferred content
      lives in `extraData`, deferred — same deferral Monster's own `extraData`
      sub-keys get); Class: hitDie, primaryAbility, savingThrows, armorProfs,
      weaponProfs, skillChoices, spellcastingAbility; Subclass/Subrace/Race/
      ClassOption: their cross-source-resolved parent-link field; Background:
      proficiencies, abilityBonuses; Item: rarity, requiresAttunement, damage,
      properties; Feat: category; Monster: the 6 fields below (finally added
      to the actual schema file — previously only in this doc's example).

### 4.4 Delete — `DELETE /api/:type/:id` (auth)

- [x] Body `{ confirm: true }` required for every delete
- [x] **Class/Race only:** pre-check for dependents (any Subclass/Subrace
      pointing at this row, any source). Split into non-MANUAL dependents
      (will be explicitly deleted alongside the parent, in the same
      transaction — they're replaceable on next refresh) and MANUAL
      dependents (will be `SetNull`'d, kept as orphans — irreplaceable user
      work, never auto-deleted). Return both lists on first call (409
      `HAS_DEPENDENT_CHILDREN`); require `confirm: true` again to proceed.
      **Semantics resolved:** `confirm !== true` → 409-with-lists if
      dependents exist, else 400; `confirm === true` → always proceeds
      (delete + cascade + orphan) regardless of dependents, so a client that
      already knows to confirm can do it in one round trip.
- [x] Any other content type: no dependent-check, just `{ confirm: true }`
- [x] 204 success / 400 `CONFIRM_REQUIRED` / 409 `HAS_DEPENDENT_CHILDREN` / 404 `NOT_FOUND`
- [x] **Reconciliation:** `ContentClassOption` has the same dependency shape as
      `ContentSubclass` (nullable `classId`, `onDelete: SetNull`) — the
      dependent-lookup query must join through both tables, not just Subclass
- [x] **Extended past this section's own scope:** Race's dependent-check also
      covers the `ContentRace.parentRaceId` self-relation (subspecies) — not
      named here (written before ClassOption's reconciliation above existed
      either), but structurally required since that FK is `onDelete: NoAction`,
      not `SetNull`.

### 4.5 New Endpoint — Bulk-Clear a Source

- [x] `DELETE /api/sources/:id/entries` *(auth)* — deletes every content row
      for a source across all tables, source row itself untouched. Gated by
      `{ confirmName: "<source's exact name>" }` (heavier confirmation than a
      single-entry delete, proportional to blast radius). Reuses the same
      delete-all-content-for-sourceId logic Phase 2's `importSource` needs.
      Response: `{ deletedCount, warnings: [...] }` (orphaned cross-source dependents)

### 4.6 Error Envelope (all write endpoints)

- [x] Standardized: `{ error: { code: "SOME_CODE", message: "human-readable" } }`

### 4.7 Deferred / Known Gaps

- [ ] **No optimistic-concurrency check (`updatedAt`) in v1** — last save wins.
      Documented as a known gap, not a silent omission. (Still deferred —
      unchanged by this implementation pass.)

### 4.8 Phase 4 Tests

- [x] Creating an entry under a MANUAL source succeeds; under an API source is rejected (400)
- [x] Editing an official entry with only Correctable Fields changed applies in place, no `saveAs`
- [x] Editing a non-correctable field on an official entry without `saveAs` → 400
- [x] `saveAs: homebrew` creates a new entry; original unchanged
- [x] `saveAs: original` modifies the official entry in place
- [x] Deleting a Class/Race with both an official and homebrew Subclass/Subrace:
      official dependent deleted, homebrew dependent orphaned (`null` parent) and
      listed in the response; a later refresh of that class's source doesn't error
- [x] Bulk-clear requires exact name match; mismatched name deletes nothing

---

## PHASE 5 — Browse UI (Read)

> All decisions below finalized in a dedicated design session. Full rationale:
> `Documentation/phase-5-browse-ui-final-export.md`. Client-side design only —
> unaffected by the SQLite/hosting pivot.
>
> **Revision (post-export):** the results list's layout was revised from a
> card grid to a **table** — the original "card grid, used unconditionally"
> decision in §5.2/the final export's §1.7 no longer holds. "Cards" are now
> understood to mean the **full-content, printable per-type display** shown
> after a record is selected (§5.3's `<Type>DetailFields`), not a summary
> tile in the results list. See `Documentation/card-design-spec.md`.
>
> **Implemented Phase 5** (infrastructure, with the two items §"Not yet
> decided" below still genuinely open) — full rationale and every resolved
> decision: `DevTools/Claude/phase-5.md`.

### 5.1 Data Fetching & State

- [x] **TanStack Query** (+ **TanStack Virtual** for the results list) — chosen
      over plain fetch/useEffect and over SWR
- [x] Filter/pagination state is **local component state, not URL params** —
      no shareable-URL need in a single-user local app
- [x] Hand-built filter bar **per content type** (8 total, one per type below),
      not one generic config-driven component
- [x] Each content type's filter/search state persists independently for the
      session (switching Monsters → Spells → Monsters preserves Monster's
      filters); resets on app refresh/close

### 5.2 Content Browser (`/browse`)

- [x] Sidebar: content type selector — **Spells, Classes, Races, Backgrounds,
      Conditions, Items, Monsters, Feats** (8 types; Feat added post-Compendium)
- [x] Filter bar per type: all types get Source multi-select (checkboxes, all
      checked by default) + name search; type-specific extras (spell
      level/school/class, item type/rarity, monster CR/type, feat category, etc.).
      **Real gap found and fixed:** the Read API's `?source=` only ever
      supported one value — extended to accept repeated `?source=` params
      (`sourceId: { in: [...] }`) so the multi-select can actually filter by
      several sources at once, across all 11 content routers.
- [x] **Pagination: virtualized, bidirectional infinite scroll** (the most
      involved piece of this phase):
  - `useInfiniteQuery` fetching 50 records at a time; auto-fetch driven by the
    virtualizer's own visible-range (functionally equivalent to an
    `IntersectionObserver` sentinel, TanStack Virtual's own recommended
    pattern — not a literal separate sentinel element)
  - Bidirectional fetch (forward and backward from wherever the user currently
    is) — required once jump-to-position is in play
  - TanStack Virtual renders only the visible slice — no thousands of off-screen DOM rows
  - Draggable position bar (`1` to total count); target computed via simple
    arithmetic on drag, actual fetch fires once on release
  - **Name index**: lightweight companion fetch (`{id, name}` pairs only, via
    Phase 3's new `?fields=name`) powers live names in the position-bar tooltip
    while dragging, without a full-record fetch per pixel
  - Position bar resets to top on any filter-set change
  - **Real bug found and fixed** via manual Playwright verification (not
    caught by typecheck): jumping snapped the scroll back to the top instead
    of landing on target, because the query's anchor-page change transiently
    collapsed `total` to 0. Fixed with `placeholderData: keepPreviousData`.
- [x] Results list: **table** (revised from the original card-grid decision —
      see note above), still virtualized per the pagination pattern above.
      Per-type column set — **still not decided**, placeholder `<Type>Row`
      (name + source only) built in its place per this phase's own scope.

### 5.3 Detail View (`/browse/:type/:id`)

- [x] Breadcrumb: Browse → [Type] → [Name]
- [x] `SourceBadge` — links to source detail; truncates long Compendium
      source names (some run 200+ characters) with a title tooltip
- [ ] `<Type>DetailFields` — the full-content, **printable** per-type display
      (referred to elsewhere as the "card"); layout **not decided in this
      phase** — its own dedicated design session, data reference at
      `Documentation/card-design-spec.md`. **Still open** — a generic field
      dump stands in for it for now, per this phase's own scope.
- [x] "Edit" button — auth-gated, present but disabled ("Coming in Phase 7") —
      opens Phase 7's edit form, which doesn't exist yet
- [x] "Delete" button — auth-gated, confirmation dialog wired to Phase 4's
      `DELETE /api/:type/:id` with `{ confirm: true }`; real two-step flow
      (preview call, then confirm) surfaces Class/Race's dependents list

### 5.4 Shared Hooks

- [x] `useContentList(type, filters)` — wraps the paginated GET via `useInfiniteQuery`
- [x] `useContentNameIndex(type, filters)` — wraps the `?fields=name` lightweight fetch
- [x] `useContentDetail(type, id)` — wraps `GET /:type/:id` via `useQuery`

### 5.5 Phase 5 Tests

- [x] Browser renders without errors for each of the 8 content types
- [x] Filter by level + class narrows spell results correctly
- [x] Switching between all 8 content types preserves each one's filter state independently
- [x] Position bar drag shows live names from the index without full-record fetches
- [x] Jumping to an arbitrary position renders that neighborhood without fetching everything in between
- [x] Detail view 404 page shown for unknown id

**Verification method:** no client-side automated test runner exists yet
(no `vitest` config for `client/`) — the above were verified manually via
Playwright screenshots against the real dev server, not a written regression
suite. Flagged as a real gap for Phase 6/7, which will keep needing this
same kind of verification.

**Not yet decided (flagged in the final export, not oversights):**
- `<Type>DetailFields` — the full-content, printable per-type "card" —
  deferred to its own session. Data reference for that session:
  `Documentation/card-design-spec.md`.
- Results-list table's per-type column set — not yet decided (see revision note above)
- ~~Whether `ContentClassOption` gets its own Browse tab~~ — **RESOLVED:**
  surfaced only from a Class's detail view, no dedicated tab. Confirmed with
  the user before building `BrowseScreen`.

---

## PHASE 6 — Import UI

> **Implemented Phase 6.** Full rationale and every resolved decision:
> `Documentation/Phase-6-Import-UI-Design-Decisions.md` (produced from
> `DevTools/Claude/phase-6-import-ui-design-brief.md`). Dev log:
> `DevTools/Claude/phase-6.md`.

### 6.1 Source List (`/sources`)

- [x] Table of all sources: name, type badge, entry count, last updated, actions
- [x] Actions per source: "Re-import" (API sources — `Source.type === 'API'`),
      "Delete source" (with confirmation), and — per Phase 4 §4.5 — a "Clear
      entries" action wired to the new bulk-clear endpoint. **No "Re-import"
      for Compendium/JSON sources** (design decision — see the decisions doc
      §1.6): both need a filesystem path the app never stores, so a re-run
      would just reopen the wizard anyway.
- [x] "Add Source" button → create source dialog (name + description)
- [x] Delete confirmation states how many entries will be deleted

### 6.2 Import Wizard (`/sources/import`)

**Step 1 — Choose import type**
- [x] Three options now, not two: "From Open5e API", "From Compendium XML file"
      *(new — needs its own step, distinct from the original outline's generic
      "From JSON file")*, "From JSON file"

**Step 2a — Open5e API import** — source name input, content-type checkboxes, "Start Import" (SSE progress)

**Step 2b — Compendium XML import** *(new)* — file picker (`.xml`), then:
- [x] If the batch-level duplicate check returns matches, show the
      `AWAITING_CONFIRMATION` summary ("N records match content that already
      exists — import as duplicates, or skip?") **before** the real import runs
      — this is a genuinely new UI state the original wizard design never
      needed to account for
- [x] **No content-type checkboxes on this step** (design decision — decisions
      doc §1.5): the backend always imports the same fixed 7 types with no
      filtering option, so showing checkboxes would imply a choice that
      doesn't exist. A static informational list stands in instead.
- **Forward note, not this phase's scope:** a future session could add
  import-by-section/subsection filtering, or a preview screen letting the
  user deselect individual rows before committing — that would need a
  backend change (the Compendium route accepting a filter, or a two-phase
  preview/commit flow) as well as a UI one. Flagged here so that session
  doesn't have to reconstruct this context from scratch.

**Step 2c — JSON file import** — source name input, file picker (`.json`), "Upload & Import"

- [x] Request contract designed and built this phase (it didn't exist before):
      `POST /api/import/file` `{ sourceId, sourceName, filePath }` → `202
      {jobId}`, reusing Appendix B's file-content shape. See §6.4 below for
      what "reusing the existing transform functions" actually meant in
      practice — no such functions existed for this shape, so this phase
      wrote real ones.

**Step 3 — Progress view** — progress bar per content type, live count, error list, "Done" → `/sources`

- [x] Shared across all three import kinds via one `useImportProgress(jobId)`
      hook and one `Step3Progress` component

### 6.4 Backend Additions This Phase (not in the original outline)

- [x] **File-picker mechanism:** native Electron file dialog, not a multipart
      upload (decisions doc §1.1) — `electron/src/preload.cts` +
      `dialog:selectFile` IPC channel, exposed to the renderer as
      `window.electronAPI.selectFile`. The client gates the picker button on
      `isElectron()` since the client also runs in a plain browser during dev.
      **Real bug found and fixed, and only catchable by actually launching
      Electron** (not typecheck, not a plain-browser test): the preload
      script silently failed to load at all — `import { contextBridge, ... }
      from 'electron'` compiled to real ESM (this package is `"type":
      "module"`), but Electron's sandboxed preload loader executes preload
      scripts as plain scripts and can't parse `import` syntax regardless of
      the package's module type. The entire file-picker feature — the design
      doc's own "load-bearing decision for the whole wizard" — was completely
      broken until this was found. Fixed by renaming to `preload.cts`
      (TypeScript's per-file CommonJS-output override for a `"type":
      "module"` package), which compiles to `preload.cjs` using
      `require`/`module.exports` under the hood while the source still reads
      as normal `import`/`export`. Verified via a real `_electron.launch()`
      (Playwright) round-trip, not just a rebuild.
- [x] `ImportJobType` extended to `OPEN5E | FILE | COMPENDIUM | JSON_FILE`
      (decisions doc §1.4) — `FILE` kept for backward compat with existing
      rows, never written by new jobs; the Compendium route now writes
      `COMPENDIUM`.
- [x] **Real gap found and fixed:** the SSE route (`GET /api/import/progress/:jobId`)
      closed the stream on *any* `type:'DONE'` event, but
      `compendiumOrchestrator.ts` emits `DONE` for `AWAITING_CONFIRMATION`
      too (not just real terminal statuses) — contradicting decisions doc
      §1.3's explicit requirement that the stream stay open through the
      pause. Fixed to only close on a genuinely terminal status.
- [x] **Real gap found and fixed:** nothing let the client see *what* matched
      when a Compendium job pauses — the `AWAITING_CONFIRMATION` `DONE` event
      carries no payload beyond the status itself. Added
      `GET /api/import/:jobId` (single job detail, `contentTypes`/`errorLog`
      parsed) for `AwaitingConfirmationPanel` to fetch match details from.
- [x] `server/src/importers/jsonFileImporter.ts` — new, since "reuses the
      existing per-content-type transform functions" (decisions doc §2.1)
      turned out not to literally apply: Open5e/Compendium's transform
      functions map a *foreign* API/XML shape onto the schema, but Appendix
      B's JSON shape is already close to the schema's own field names — this
      needed real validation/slug-generation/extraData-folding logic of its
      own, reusing each content type's existing Zod schema for validation
      rather than a source-specific transform. Scoped to the 8 top-level
      browsable types only (no Subclass/Subrace/ClassOption — they need FK
      linkage a flat JSON entry has no clean way to express).

### 6.5 Phase 6 Tests

- [x] Import wizard flow completes without errors against Open5e
- [x] SSE progress events arrive and the progress bar advances
- [x] Compendium import surfaces the `AWAITING_CONFIRMATION` step correctly
      and respects the user's duplicate/skip choice — verified manually in
      the desktop app (see dev log); the SSE-stream-persistence fix itself
      has no automated regression test (awkward to test against the existing
      supertest-based harness, flagged as a real coverage gap)
- [x] Re-import replaces data (Open5e) or skips existing rows unconditionally (Compendium); counts are accurate after
- [x] "Clear entries" action removes all of a source's content, leaves the source row intact
- [x] New this phase: `POST /api/import/file` and `GET /api/import/:jobId`
      route tests (`server/src/__tests__/importRoutes.test.ts`);
      `extractSections`/`importJsonFile` unit tests
      (`server/src/__tests__/importers/jsonFileImporter.test.ts`)
- [x] **Real gap found and fixed, in test infrastructure rather than app
      code:** running a full `npm run build` (not just `tsc --noEmit`)
      compiles `server/src/__tests__/` into `server/dist/__tests__/*.test.js`
      too. Vitest 4's default `exclude` dropped `**/dist/**` (older versions
      had it) — with nothing in `vitest.config.ts` overriding that, a
      populated `dist/` gets discovered and run *alongside* the real `src/`
      sources, both copies racing the same live `dev.db` in parallel and
      producing spurious failures unrelated to any real bug. Latent since
      Phase 1, never triggered before because a full server-workspace build
      hadn't run mid-session until this phase. Fixed with an explicit
      `**/dist/**` exclude in `server/vitest.config.ts`.

---

## PHASE 7 — Edit & Create UI (Write)

> All decisions below finalized in a dedicated design session. Full rationale:
> `Documentation/phase-7-edit-create-ui-final-export.md`.

### 7.1 Foundational Decisions

- [ ] **Hand-built forms**, one per content type (8: Spell, Class, Race,
      Background, Condition, Item, Monster, Feat — Subclass/Subrace likely
      share most of their parent type's form rather than a fully separate build)
- [ ] **react-hook-form + Zod resolver**, against schemas from Phases 2/4
- [ ] Set up a real `@dragonledger/content-types` workspace package **now** —
      move the Zod schemas here so client and server both depend on one
      definition, ahead of Heroes eventually consuming the same shapes
- [ ] **Every JSON-shaped field gets a real structured widget — no raw-JSON
      textarea fallback, ever, at any complexity level.** Firm requirement, not
      a case-by-case call, since this app needs to be usable by someone with no
      coding background.

### 7.2 Save-As UX (already resolved by Phase 4, not a new decision)

- [ ] Save button reads live off the Correctable Fields check: "Save" (in-place,
      no interruption) while every dirty field is correctable, flips to "Save
      as..." (prompting original vs. homebrew) the moment a non-correctable
      field becomes dirty — visible to the user as they type, not a submit-time surprise

### 7.3 Other UX Requirements

- [ ] Route-leave guard warns before discarding unsaved changes
- [ ] Create form's Source picker defaults to the seeded `"homebrew"` source,
      overridable to any other MANUAL source
- [ ] `CreateSourceInlineDialog` — "no MANUAL source exists" fallback (brief §7.3, unchanged)

### 7.4 Shared JSON-Widget Plan

Build in this order (per final export §5) since several widgets compose others:

- [ ] `FixedChoiceGrantWidget` — first; the most-reused shape (skillChoices,
      proficiencies, abilityBonuses, trait `grant`, etc.)
- [ ] `AbilityScoreGrid`, `SpeedWidget`, `ActionListWidget`, `PropertyListWidget`,
      `TraitListWidget` (composes `FixedChoiceGrantWidget`), `ComponentsWidget`,
      `ResistanceListWidget` (composite-parser-aware, not a generic list),
      `SpellcastingWidget` (autocomplete against `ContentSpell`)

### 7.5 Per-Type Form Sessions

- [ ] Each content type's form needs its own short design session before being
      built (field-by-field layout, required/nullable off the Zod schema,
      Correctable Fields list review, extraData-to-form-field decisions) — this
      phase's export intentionally stopped at shared infrastructure, not full
      per-type field lists. Spell's worked template lives in the final export §3.

### 7.6 Phase 7 Tests

- [ ] Create form submits and new entry appears in the browse list
- [ ] Edit with "save as homebrew" creates a new entry; original unchanged in the DB
- [ ] Edit with "update original" modifies the existing row
- [ ] Validation blocks submission with empty required fields
- [ ] Unsaved-changes guard fires on navigation away from a dirty form

**Not yet decided:** whether `ContentClassOption` gets its own form or is
edited within its parent Class's form — flagged as unresolved, to be settled
before or during whichever future session covers Class's form specifically.

---

## PHASE 8 — Desktop Packaging (Electron) — *moved up front, see Phase 0.7*

**Decided:** build this immediately after Phase 0, not deferred to the end.
Kept under the "Phase 8" label (matching the design-export doc's naming) but
physically sequenced right after Phase 0 in this document — see **Phase 0.7**
above for the full checklist. Nothing here changed except *when* it's built.

---

## Appendix A — Content Type Field Reference (current, reconciled)

This reflects `dragonledger-master-schema.md` as of the Compendium sessions —
it is the field reference to build against, not the original Phase 1 draft.
JSON columns are `String` in SQLite; parse/stringify at the application layer.

### Source
| Field | Type | Notes |
|---|---|---|
| id | String (PK) | human-assigned, e.g. `"open5e-srd-2024"`, `"homebrew"`, or a parsed per-book Compendium id |
| name | String | |
| type | Enum `API \| FILE \| MANUAL` | |
| description | String? | |
| lastUpdated | DateTime | |
| isDeletable | Boolean | `false` for `"homebrew"` and other protected sources |

### ImportJob
| Field | Type | Notes |
|---|---|---|
| id | String (PK, cuid) | |
| sourceId | String (FK) | |
| jobType | Enum `OPEN5E \| FILE` | |
| contentTypes | String | JSON array |
| status | Enum `PENDING \| AWAITING_CONFIRMATION \| RUNNING \| COMPLETED \| FAILED \| PARTIAL` | |
| totalItems | Int? | |
| processedItems | Int | default 0 |
| errorLog | String? | JSON array of `{ contentType, message }` |
| startedAt | DateTime | default now |
| completedAt | DateTime? | |

### ContentSpell
| Field | Type | Notes |
|---|---|---|
| id | String (PK, cuid) | |
| slug, sourceId | String | unique within source |
| name | String | |
| level | Int | 0 = cantrip; indexed |
| school | String | indexed |
| castingTime, range, duration | String | |
| components | String | collapsed display string, e.g. `"V, S, M"` |
| material | String? | |
| concentration, ritual | Boolean | |
| classes | String | JSON array of **display names** |
| description | String | |
| higherLevels | String? | |
| extraData | String? | castingOptions, damageRoll, damageTypes, savingThrow, attackRoll, targetType/Count, shape info, reactionCondition, materialCost/Consumed |

### ContentClass
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name | String | |
| hitDie | Int | |
| primaryAbility | String | **JSON `{ abilities: string[], logic: "AND"\|"OR" }`** — restructured from a flat array; `logic` from a hardcoded per-class table |
| savingThrows, armorProfs, weaponProfs | String | JSON arrays |
| skillChoices | String | Fixed/Choice Grant Shape (Appendix C) |
| spellcastingAbility | String? | null if non-caster |
| description | String | |
| extraData | String? | casterType, features[] (name/description/type/levels) |

### ContentSubclass
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| classId | **String? (nullable)** | FK → ContentClass, `onDelete: SetNull` — was required/`NoAction`, changed in Phase 4 so homebrew can point at official classes |
| name, description | String | |
| extraData | String? | features[]; `unresolvedClassName` if Compendium cross-source resolution fails |

### ContentRace
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name | String | |
| size | String | JSON array, e.g. `["medium"]` or `["small","medium"]` |
| speed | String | JSON `{ walk, fly?, swim? }` |
| traits | String | JSON array of `{ name, description, level, grant? }` |
| description | String | |
| extraData | String? | |
| parentRaceId | String? | **new** — self-relation FK, `onDelete: NoAction`, for real 2014-style subspecies records |

### ContentSubrace
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | new table (Phase 2) |
| raceId | **String? (nullable)** | FK → ContentRace, `onDelete: SetNull` (Phase 4 change) |
| name | String | synthetic rows use the lineage option's label (Open5e) or the parsed subrace name (Compendium) |
| description | String? | |
| size, speed | String? | null unless this subrace overrides the parent |
| traits | String | same shape as ContentRace.traits |
| extraData | String? | `unresolvedRaceName` if cross-source resolution fails |

### ContentBackground
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name | String | |
| proficiencies | String | **merged field** — `skillProficiencies` + `toolProficiencies` combined into one Fixed/Choice Grant Shape field, entries tagged `category: "skill"\|"tool"` (needed to represent mixed-category choices like "Stealth, Sleight of Hand, or Thieves' Tools") |
| abilityBonuses | String | Fixed/Choice Grant Shape; `fixed` is an object (carries an amount) |
| feature | String | JSON array `[{ name, description }]` — collects every feature-type benefit |
| description | String | |
| extraData | String? | languages, equipment, unrecognizedBenefits[], flavor text, `proficiencyMismatch` (Compendium, when tag and bullet disagree) |

### ContentCondition
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name, description | String | |
| effects | String? | usually null — Open5e conditions have no structured effects |
| extraData | String? | `descriptionSource`/`requestedSource` (only when a fallback substitution occurred), icon |

### ContentItem
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name | String | |
| itemType | String | indexed; overridden by armor's more specific category when present |
| rarity | String? | indexed |
| requiresAttunement | Boolean | |
| cost, weight, damage, armorClass | String? | |
| properties | String? | JSON array of `{ name, detail? }` |
| description | String | |
| extraData | String? | size, range, isSimple/isMartial/isImprovised, stealthDisadvantage, maxDexBonus, addDexMod, strRequired, acDisplay, attunementDetail |

### ContentMonster
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name, size, monsterType (indexed), alignment | String | |
| armorClass, hitPoints | Int | |
| hitDice | String | |
| speed, abilityScores | String | JSON |
| savingThrows, skills | String? | JSON |
| damageResistances, damageImmunities | String? | JSON array, composite-parser shape |
| damageVulnerabilities | String? | **new column** — real content gap, mechanically as significant as resistance/immunity |
| conditionImmunities | String? | JSON array |
| senses, languages | String? | plain display strings |
| challengeRating | String | handles fractions (`"1/8"`); indexed |
| actions | String | JSON array, each entry tagged `actionType: "action"\|"bonus"\|"reaction"` |
| legendaryActions | String? | |
| description | String? | |
| extraData | String? | armorClassDetail, lairActions, traits[], spellcasting, proficiencyBonus, legendaryResistances, experiencePoints, category/subcategory |

### ContentFeat *(new — Compendium sessions)*
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| name | String | |
| category | String | `GENERAL \| ORIGIN \| FIGHTING_STYLE \| EPIC_BOON \| CLASS_SPECIFIC` |
| prerequisite | String? | |
| description | String | |
| extraData | String? | benefits[] (Open5e only), special, modifiers[] |

### ContentClassOption *(new — Compendium sessions)*
| Field | Type | Notes |
|---|---|---|
| id, slug, sourceId | | |
| classId | String? | FK → ContentClass, `onDelete: SetNull` |
| pool | String | `"Metamagic" \| "Eldritch Invocation" \| "Maneuver"` \| future pools |
| name, description | String | |
| prerequisite | String? | |
| extraData | String? | |

### Language *(new — Compendium sessions)*
| Field | Type | Notes |
|---|---|---|
| id (PK) | String | |
| name | String | `@unique` |
| category | String | `"common" \| "exotic" \| "secret"` — a real table, not a Prisma enum (enums can't grow at runtime); seeded, grows via upsert whenever an importer meets an unrecognized language. Not a strict FK anywhere it's referenced (`ContentMonster.languages`, background/race grant fields) — a plain matching string, same convention as `ContentSpell.classes`. |

---

## Appendix B — JSON Import File Format

The JSON file upload accepts either:

**Single content type:**
```json
{ "contentType": "spell", "entries": [ { ...spell fields... } ] }
```

**Multiple content types:**
```json
{ "spells": [ ... ], "items": [ ... ], "monsters": [ ... ] }
```

- `id` and `slug` are optional — if omitted, the server generates them from the name
- `sourceId` in the file body is ignored; the source is always determined by the import request
- Unknown fields are stored in `extraData` as a JSON string rather than rejected

---

## Appendix C — Fixed/Choice Grant Shape

The single most-reused JSON shape in the schema. Applies wherever official
content mixes a fixed grant with a player choice —
`Background.proficiencies`, `Background.abilityBonuses`, `extraData.languages`,
`ContentClass.skillChoices`, and any race/subrace trait's `grant` field.

```json
{
  "fixed": { },
  "choices": [
    { "type": "select", "count": 1, "from": [ ] , "amount": null },
    { "type": "distribute", "pool": 2, "among": [ ], "maxPerOption": 2 }
  ]
}
```

- `fixed` is an array for name-only grants (skills, tools, languages), or an
  object for grants carrying an amount (ability bonuses, e.g. `{ "WIS": 1 }`)
- `choices[].type: "select"` — pick `count` items from `from` (or anywhere, if `from` is `null`)
- `choices[].type: "distribute"` — spend a `pool` of points across `among`, capped by `maxPerOption`
- `from`/`among` entries are plain strings when every option shares one
  category; `{ name, category }` objects when a choice spans categories
  (e.g. "Stealth, Sleight of Hand, or Thieves' Tools")
- `amount` on a `select` choice specifies bonus size when relevant (e.g.
  `{ type: "select", count: 1, from: ["WIS","INT"], amount: 1 }`); omitted for skills/tools/languages

**`extraData` fallback rule:** any field with no dedicated column, and any
record hitting a case the mapping didn't anticipate, gets captured in
`extraData` rather than silently dropped — losing data invisibly is a worse
failure mode than an unused JSON blob, since this app is the foundation for a
future character-sheet app (Heroes).

---

## Open Questions & Unresolved Items

Consolidated from every design session so far, updated as decisions land.
Nothing here should be implemented by guessing — either ask, or treat as
explicitly deferred.

### Resolved

- ~~Auth middleware's role post-pivot~~ — **RESOLVED:** not needed for a
  local-only app; retire/disable it. Revisit when Heroes integration happens.
  (Phase 0.5)
- ~~Electron packaging timeline~~ — **RESOLVED:** build it up front, right
  after Phase 0, not deferred to the end. (Phase 0.7)
- ~~Race's un-columned Compendium fields~~ (`<ability>`, `<resist>`,
  `<proficiency>`, `<languages>`, etc.) — **RESOLVED:** synthesize each into a
  `traits[]` entry, and also preserve the raw original value in `extraData` as
  a backup/cross-check. (Phase 2.5 §2.5.6)
- ~~Multi-book Compendium citations~~ — **RESOLVED (rule, not the data):**
  resolve to whichever cited source has the higher priority. The ranking data
  itself (which books outrank which) still needs to be built — see Phase 2.5
  task list. (Phase 2.5 §2.5.1)
- ~~Compendium Class/Subclass & Race/Subrace sample-size verification~~ —
  **RESOLVED as a required blocking step, not just a flag:** confirmed only
  one class file (Cleric 2024) and two race files (Elf/Wood Elf, Dwarf) have
  been checked so far. A broader real-file sample must be pulled and manually
  verified **before** either transform is written, not as follow-up cleanup.
  (Phase 2.5 §2.5.6 — see the 🚩 REQUIRED step there)

### Still needs a decision before relevant implementation

1. **`ContentClassOption`'s Browse/Edit treatment** — own Browse tab or
   surfaced only from a Class's detail view? Own edit form or edited within
   the parent Class's form? **Not yet decided.** (Phase 5 §5.5, Phase 7 §7.6)
~~2. **`ContentClassOption` read-API shape**~~ — **RESOLVED (Phase 3):** own
   top-level endpoint, `GET /api/class-options`. See §3.2.

### Needs implementation work before it can be trusted, not a decision

3. Batch insert chunk size — **not just re-verification, an actual
   recalculation.** 500 rows/`createMany` was sized against SQL Server's
   ~2,100-parameter limit; SQLite's own limit (~999 total parameters) is far
   more restrictive per query, especially for wide tables like `ContentMonster`.
   See the worked-through fix in Phase 2 §2.2.
4. Classes' `skillChoices`/`armorProfs`/`weaponProfs` parsing from feature
   prose (Open5e) — no direct API field, needs live-sample verification.
5. Hardcoded lookup tables (hit-die fallback, spellcasting ability by class,
   multiclass AND/OR logic) — need confirmation they cover all SRD 2024 classes.
6. Correctable Fields lists — **only Monster's is defined and confirmed
   needed.** The other 7 content types (Spell, Class/Subclass, Race/Subrace,
   Background, Condition, Item) each need a real per-type judgment pass before
   Phase 4/7 can be considered complete for them.
7. The book-priority ranking data for multi-book citation resolution (the rule
   is settled above; the actual ordered list of books isn't built yet).
8. Compendium Background bullet-parsing — 6-record sample only.
9. Compendium Feat category default (`GENERAL` for unprefixed names) — unconfirmed.
10. Compendium Item rarity/attunement text-parsing — no confirmed reliable
    pattern; implemented as best-effort, not guaranteed.

### Explicitly deferred (not gaps, deliberate scope cuts for v1)

11. Concurrent-edit safety (optimistic concurrency via `updatedAt`) — last save wins in v1.
12. `<Type>DetailFields` — the full-content, printable per-type "card" shown
    after selecting a record — its own future design session. Data reference
    compiled: `Documentation/card-design-spec.md`. (The results list itself is
    a table, not cards — see Phase 5's revision note.)
13. Per-type Phase 7 form field layouts beyond Spell's worked template — each needs its own short session.
14. Create-form homebrew-source default becoming user-configurable (global or per-content-type) — stretch goal, not core scope.
