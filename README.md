# DragonLedger DatabaseApp

A local, single-user application for storing, searching, and managing D&D 5e content — spells, classes, races, backgrounds, conditions, items, monsters, and feats — from multiple named sources.

Content can be bulk-imported from the [Open5e API](https://open5e.com/) or the `Complete_Compendium_5.5e.xml` file, uploaded as a JSON file, or entered manually. Each import belongs to a named **source**, and sources can be refreshed independently without touching anything else — though refresh behavior differs deliberately by source type (see [Data Model](#data-model)). Entries can be edited in-place or saved as a homebrew copy under a separate source.

This is a content management tool. It is intentionally simpler than DragonLedger Heroes. It has no character sheets, no dice, no session state — just a clean, searchable database of game content. It is also genuinely single-user and runs entirely on your own machine: there's no hosted server, and a separate companion app (Heroes) will eventually be the primary consumer, handling its own cross-device sync independently.

---

## What It Does

| Feature | Description |
|---|---|
| **Browse** | Search and filter any of 8 content types by name, source, and type-specific attributes (spell level, monster CR, item rarity, etc.) |
| **Detail view** | Full field display for any entry, with edit and delete actions |
| **Source management** | Create, refresh, and delete named content sources |
| **Open5e import** | Fetch all pages of any content type from the Open5e API, stored under a named source, with live progress tracking via SSE. Refresh is delete-and-replace. |
| **Compendium import** | Import `Complete_Compendium_5.5e.xml`, parsing per-book sources from embedded citations. **Additive-only, never-overwrite** — re-running a file never touches a previously-edited row, and cross-source duplicates (vs. an existing Open5e import) prompt for a single batch-level duplicate/skip decision. |
| **JSON import** | Upload a `.json` file matching the content schema; unknown fields are stored rather than rejected |
| **Manual entry** | Create entries from scratch under any MANUAL-type source |
| **Homebrew edits** | Edit any entry and save it as a new entry under a homebrew source, leaving the original untouched. "Correctable" parser-derived fields (e.g. a monster's resistances) can be fixed in place on official entries without a homebrew copy. |
| **Auth gate** | All write operations (create, edit, delete, import) require a shared password; browsing and reading are public. **Under review** now that the app is local-only — see Build Status. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Routing | React Router v8 |
| Data fetching | TanStack Query + TanStack Virtual (Browse UI, Phase 5) |
| Forms | react-hook-form + Zod resolver (Edit/Create UI, Phase 7) |
| Shared validation | Zod, via a shared `@dragonledger/content-types` workspace package (client + server) |
| API server | Node.js + Express 5 + TypeScript |
| ORM | Prisma 6 (**SQLite** provider) |
| Database | **SQLite** (local file; lives in the OS `userData` directory once packaged) |
| Auth | Shared password via `x-app-password` header or `Authorization: Bearer` — **disabled/retired for the local build** (see Auth section below) |
| Testing | Vitest + Supertest |
| Packaging | **Electron** + `electron-builder` — no hosting; ships as a desktop `.app`/`.dmg` |
| CI/CD | GitHub Actions (build/test only — there's no deploy target anymore) |

> **Architecture note:** this app originally targeted a hosted Azure SQL +
> Azure App Service deployment. That was superseded mid-build once it became
> clear the app is genuinely single-user with no need for a shared, always-on
> database — see `Documentation/architecture-addendum-local-sqlite.md` for the
> full reasoning. No schema or API design changed as a result, only where and
> how the app runs.

---

## Project Structure

```
/
  client/                   React frontend (Vite)
    src/
      api/                  Typed fetch wrappers (apiFetch)
      components/
        layout/             Layout shell, Sidebar nav
        ui/                 shadcn/ui primitives
        filters/            Per-content-type filter bars (Phase 5)
      screens/              Full-page views (Browse, Detail, Sources, Import, Login)
      hooks/                Custom React hooks (useContentList, useContentNameIndex, useContentDetail)

  server/                   Express API (Node.js)
    src/
      routes/               Express routers (health, auth — content routes in later phases)
      middleware/           Password auth guard, global error handler
      db/                   Singleton Prisma client
      importers/
        open5e/             One transform file per content type + orchestrator (Phase 2)
        compendium/         XML parser + one transform file per content type + orchestrator (Phase 2.5)
        utils/              fetchWithRetry, shared composite-resistance/telepathy parsers
      schemas/content/      Zod schema per content type (full / .partial() / Correctable)
      lib/
        logger.ts           Runtime logger → DevTools/Logs/server.log
      __tests__/            Vitest integration tests → DevTools/Tests/test-server.log

  packages/
    content-types/          Shared Zod schemas, client + server (Phase 7)

  prisma/
    schema.prisma           Single source of truth for all DB models (provider = "sqlite")
    migrations/             Prisma-generated migration files (bundled into the packaged app)

  electron/                 Electron main process + electron-builder config (Phase 8)

  test/
    ping-db.ts              Standalone DB connectivity check → DevTools/Logs/db-ping.log

  DevTools/
    Logs/                   Runtime application logs (gitignored)
    Tests/                  Test run logs (gitignored)
    Claude/                 Per-phase dev logs + design-session process logs

  Documentation/
    outline.md              Full phase-by-phase build plan with checkboxes
    tasks.md                 Actionable per-phase implementation checklist
    *-final-export.md        Detailed design decisions per phase (Phase 2/4/5/7, Compendium)
    architecture-addendum-local-sqlite.md   The SQLite/Electron pivot, in full
    FlowCharts_ERDs/dragonledger-master-schema.md   Current, reconciled Prisma schema + ER diagram
```

---

## Data Model

Every piece of content belongs to a **Source**. A source has a name, a type (`API | FILE | MANUAL`), and a `lastUpdated` timestamp. **Refresh behavior now differs deliberately by source type:**

- `API` sources (Open5e) — delete-and-replace: a refresh deletes all of that source's entries and re-imports fresh data.
- `FILE` sources (Compendium XML) — **additive-only, never-overwrite**: a same-source/same-slug match is skipped unconditionally on every re-run, so local text corrections to Compendium content are never silently destroyed. A Compendium import is expected to run roughly once per database lifetime, not on a recurring cadence.
- `MANUAL` sources (homebrew) — never touched by any import job. A seeded, non-deletable `"homebrew"` source always exists.

```
Source
  id            String    e.g. "open5e-srd-2024", "homebrew", a parsed per-book id
  name          String    display name
  type          Enum      API | FILE | MANUAL
  description   String?
  lastUpdated   DateTime
  isDeletable   Boolean   false for "homebrew" and other built-in placeholder sources

Content tables (each with sourceId FK → Source), 8 browsable types + 2 satellite tables:
  ContentSpell   ContentClass   ContentSubclass   ContentRace   ContentSubrace
  ContentBackground   ContentCondition   ContentItem   ContentMonster
  ContentFeat            standalone, prerequisite-gated (not class-locked)
  ContentClassOption     class-gated pool: Metamagic / Eldritch Invocations / Maneuvers
  Language               seeded, grows via upsert; referenced by name, not a strict FK
  ImportJob              DB-backed import/progress tracking, not in-memory only
```

JSON columns (arrays, objects) are stored as `String` in SQLite and serialized before insert. Each content table has a `slug` field for URL-safe identifiers that are unique within a source. Full current schema, ER diagram, and worked examples: `Documentation/FlowCharts_ERDs/dragonledger-master-schema.md`.

---

## Local Setup

**Prerequisites:** Node.js 20+, npm 10+. No external database — SQLite runs as a local file, nothing to provision.

**1. Clone and install**
```bash
git clone <repo-url>
cd DragonLedger_DatabaseApp
npm install
```

**2. Configure environment**

Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

```env
DATABASE_URL="file:./dev.db"
APP_PASSWORD="your-shared-password"
CLIENT_ORIGIN="http://localhost:5173"
PORT=3000
```

Also create `prisma/.env` with just `DATABASE_URL` (Prisma CLI picks it up automatically):
```env
DATABASE_URL="file:./dev.db"
```

**3. Push the schema**
```bash
npm run db:push
```

**4. Run locally**

In two terminals:
```bash
npm run dev:server    # Express API on http://localhost:3000
npm run dev:client    # Vite dev server on http://localhost:5173
```

**5. Run tests**
```bash
npm test
```

Test logs write to `DevTools/Tests/test-server.log`. Runtime logs write to `DevTools/Logs/server.log`. Both are gitignored.

---

## Available npm Scripts

| Script | What it does |
|---|---|
| `npm run dev:client` | Start Vite dev server |
| `npm run dev:server` | Start Express with tsx watch mode |
| `npm test` | Run Vitest integration tests (server) |
| `npm run build` | Build client for production |
| `npm run lint` | ESLint across both packages |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (used in CI) |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:push` | Push schema to DB without a migration file |
| `npm run db:migrate` | Create a named migration and apply it |
| `npm run db:studio` | Open Prisma Studio |
| `npm run ping:db` | Run the standalone DB connectivity check |

---

## Auth

All **read** endpoints (`GET`) are public — no password required to browse or view content.

All **write** operations (`POST`, `PATCH`, `PUT`, `DELETE`) require the shared password in one of two ways:
- `x-app-password: <password>` header
- `Authorization: Bearer <password>` header

The login screen (`/login`) accepts the password, verifies it against `POST /api/auth/check`, and stores it in `sessionStorage`. The `apiFetch` wrapper injects the password header automatically on all mutating requests.

There are no user accounts. If you know the password, you have full write access.

**Resolved:** the app is local-only now, so the threat model this middleware was designed for — a hosted API reachable by anyone with the URL — no longer applies. The password gate is disabled/retired for this build; the code stays in place rather than being deleted, so it's easy to re-enable if Heroes integration later introduces a real reachability scenario.

---

## Build Status

### Phase 0 — Scaffold (complete, SQLite migration pending)
- npm workspaces (client + server)
- TypeScript strict mode, ESLint, Prettier
- Vitest configured with verbose reporter and test logging
- Express server with health check, CORS, global error handler, request logger
- Auth middleware with correct/wrong/missing password handling
- React + Vite + Tailwind v4 + shadcn/ui client scaffold
- React Router with Layout + Outlet, placeholder screens, Login screen
- All Phase 0 tests passing
- ⚠️ Prisma still needs its `datasource` block switched from SQL Server to SQLite (`Documentation/architecture-addendum-local-sqlite.md`)

### Phase 0.7 — Desktop Packaging (Electron) (next, moved up front)
**Decided:** build the Electron shell now, right after Phase 0, rather than deferring it to the end — see `Documentation/outline.md` §Phase 0.7. Still labeled "Phase 8" in some design docs (naming carried over from the original design session) but scheduled to happen here in the build order.

### Phase 1 — Database Schema & Source API
- Define all current Prisma models (`Source`, `ImportJob`, 8 content types, `ContentSubrace`, `ContentClassOption`, `Language` — 13 models total, up from the original 9)
- First migration
- Source CRUD endpoints with cascade delete
- Seed the `homebrew` source and the `Language` table

### Phases 2–7 (planned)
See `Documentation/outline.md` for the full design/decisions reference and `Documentation/tasks.md` for the actionable per-phase checklist.

| Phase | Scope |
|---|---|
| 2 | Open5e import (pagination, transforms, SSE progress, DB-backed job tracking) |
| 2.5 | Compendium XML import — second, additive-only import pipeline into the same schema (new phase, not in the original plan) |
| 3 | Content read API (8 types incl. Feat, filters, pagination, lightweight name-index mode) |
| 4 | Content write API (create, edit, delete; homebrew copy flow; Correctable Fields; dependent-aware delete) |
| 5 | Browse UI (TanStack Query/Virtual, per-type filter bars, virtualized bidirectional infinite scroll) |
| 6 | Import UI (source list, 3-way import wizard incl. Compendium, live progress bar) |
| 7 | Edit & create UI (hand-built per-type forms, shared JSON-shape widgets, save-as UX) |

(Desktop packaging, originally planned as a final "Phase 8," is now Phase 0.7 above — there's no separate deployment phase left at the end.)

Design decisions for Phases 2, 4, 5, 7, and the Compendium import are fully
settled — see the corresponding `Documentation/*-final-export.md` files. A
consolidated list of remaining open questions and unverified assumptions lives
at the bottom of `Documentation/outline.md`.

---

## Integration with DragonLedger Heroes

DragonLedger Heroes is a companion character sheet application. This DatabaseApp is designed from the start to serve as Heroes' content backend — **but the mechanism changed with the local/SQLite pivot** (see the architecture addendum). DatabaseApp no longer runs as an always-available hosted service, so Heroes can't assume it's simply reachable over the internet at some URL.

### The Relationship

**DatabaseApp** is the authoritative store for all game content. It knows nothing about characters. Its long-term job is producing and curating content, then exporting it — not running as a live service.

**Heroes** is the authoritative store for all character data, and will eventually **supersede** DatabaseApp as the primary day-to-day app. It handles its own cross-device sync independently (an iCloud-equivalent on iOS, an Android equivalent) rather than depending on DatabaseApp for that.

### How It Works (updated for the local pivot)

Two integration paths are plausible, and which one Heroes actually uses hasn't been finalized:

- **JSON export/import** — the interchange format explicitly called out in the architecture addendum: DatabaseApp exports its content (or a filtered subset), Heroes imports it. Works regardless of whether the two apps are ever running at the same time, on the same machine, or not.
- **Local HTTP calls** — if both apps happen to run on the same machine, Heroes could still make standard `GET` requests against DatabaseApp's local Express server (all read endpoints remain public, no auth required) the same way it would have against a hosted API, just pointed at `http://localhost:<port>` instead of a public domain.

Either way, the API contract below (paths, response shapes, slug format) is the same interface — only the transport assumption changes.

Example calls Heroes would make, now against a local address rather than a public one:
```
GET http://localhost:3000/api/spells?level=3&class=Wizard
GET http://localhost:3000/api/spells/open5e-srd-2024__fireball
GET http://localhost:3000/api/monsters?cr=5
GET http://localhost:3000/api/classes/open5e-srd-2024__paladin
GET http://localhost:3000/api/feats?category=ORIGIN
```

Heroes never writes to DatabaseApp. It only reads. All content management (importing, editing, homebrew) happens inside DatabaseApp by someone with the password.

### The Slug System

Every content entry has a `slug` field — a URL-safe string unique within its source. The full entry ID is `{sourceId}__{slug}` (e.g., `open5e-srd-2024__fireball`). Heroes will store these IDs on character data (spell lists, equipped items, etc.) so it can look up the full content on demand.

This means:
- Heroes stores a reference, not a copy
- Content updates in DatabaseApp are immediately reflected in Heroes on next fetch
- If a spell is renamed or removed, Heroes sees that on the next read — Heroes should handle 404 gracefully

### What Heroes Needs From DatabaseApp's API

| Heroes feature | DatabaseApp endpoint |
|---|---|
| Spell list on character sheet | `GET /api/spells/:id` per known spell ID |
| Class feature display | `GET /api/classes/:id` + `GET /api/subclasses?classId=` |
| Race traits display | `GET /api/races/:id` |
| Background feature display | `GET /api/backgrounds/:id` |
| Condition tracker | `GET /api/conditions/:id` per active condition |
| Inventory detail | `GET /api/items/:id` per carried item |
| Bestiary / encounter builder | `GET /api/monsters` with CR/type filters |
| Content search (add spell to sheet) | `GET /api/spells?q=fire&class=Druid&level=2` |
| Feat selection | `GET /api/feats?category=ORIGIN` |

### When Integration Happens

The API contract (endpoint paths, response shapes, slug format) is established in **Phase 3** of this build. Heroes integration can begin as soon as Phase 3 is functionally complete — there is no "deploy" step anymore, since neither app is hosted. There is no shared code between the two apps beyond the schemas package below — the API is the interface. Heroes calls HTTP endpoints (or reads an export); it does not import server code from this repo.

`@dragonledger/content-types` — a shared Zod schemas package — is **now planned as real infrastructure in Phase 7**, not a hypothetical later step: both DatabaseApp's client and server need the same validation shapes regardless of hosting, and building it now means Heroes has a real, ready-made package to import from once it needs these same shapes, rather than duplicating response-shape types independently.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Azure SQL connection string (`sqlserver://` format) |
| `APP_PASSWORD` | Yes | Shared write password |
| `CLIENT_ORIGIN` | Yes | Client URL for CORS (e.g. `http://localhost:5173` or production URL) |
| `PORT` | No | API server port (default: 3000) |

Client-side:

| Variable | Description |
|---|---|
| `VITE_API_URL` | API base URL (defaults to `http://localhost:3000` in dev) |
