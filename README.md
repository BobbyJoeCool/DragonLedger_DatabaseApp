# DragonLedger DatabaseApp

A hosted web application for storing, searching, and managing D&D 5e content — spells, classes, races, backgrounds, conditions, items, and monsters — from multiple named sources.

Content can be bulk-imported from the [Open5e API](https://open5e.com/), uploaded as a JSON file, or entered manually. Each import belongs to a named **source**, and sources can be refreshed (old data deleted, new data re-imported) independently without touching anything else. Entries can be edited in-place or saved as a homebrew copy under a separate source.

This is a content management tool. It is intentionally simpler than DragonLedger Heroes. It has no character sheets, no dice, no session state — just a clean, searchable database of game content that other apps (including Heroes) can read from.

---

## What It Does

| Feature | Description |
|---|---|
| **Browse** | Search and filter any content type by name, source, and type-specific attributes (spell level, monster CR, item rarity, etc.) |
| **Detail view** | Full field display for any entry, with edit and delete actions |
| **Source management** | Create, refresh, and delete named content sources |
| **Open5e import** | Fetch all pages of any content type from the Open5e API, stored under a named source, with live progress tracking via SSE |
| **JSON import** | Upload a `.json` file matching the content schema; unknown fields are stored rather than rejected |
| **Manual entry** | Create entries from scratch under any MANUAL-type source |
| **Homebrew edits** | Edit any entry and save it as a new entry under a homebrew source, leaving the original untouched |
| **Auth gate** | All write operations (create, edit, delete, import) require a shared password; browsing and reading are public |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| Routing | React Router v8 |
| API server | Node.js + Express 5 + TypeScript |
| ORM | Prisma 6 (SQL Server provider) |
| Database | Azure SQL Database |
| Auth | Shared password via `x-app-password` header or `Authorization: Bearer` |
| Testing | Vitest + Supertest |
| Hosting | Azure App Service (API) + Azure Static Web Apps (client) |
| CI/CD | GitHub Actions (planned — Phase 8) |

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
      screens/              Full-page views (Browse, Detail, Sources, Import, Login)
      hooks/                Custom React hooks

  server/                   Express API (Node.js)
    src/
      routes/               Express routers (health, auth — content routes in later phases)
      middleware/           Password auth guard, global error handler
      db/                   Singleton Prisma client
      importers/            Open5e fetch logic + JSON file parser (Phase 2)
      lib/
        logger.ts           Runtime logger → DevTools/Logs/server.log
      __tests__/            Vitest integration tests → DevTools/Tests/test-server.log

  prisma/
    schema.prisma           Single source of truth for all DB models
    migrations/             Prisma-generated migration files

  test/
    ping-db.ts              Standalone DB connectivity check → DevTools/Logs/db-ping.log

  DevTools/
    Logs/                   Runtime application logs (gitignored)
    Tests/                  Test run logs (gitignored)
    Outline.md              Full phase-by-phase build plan with checkboxes
```

---

## Data Model

Every piece of content belongs to a **Source**. A source has a name, a type (`API | FILE | MANUAL`), and a `lastUpdated` timestamp. Refreshing a source deletes all its entries and re-imports fresh data without touching any other source.

```
Source
  id            String    e.g. "open5e-srd-2024", "my-homebrew"
  name          String    display name
  type          Enum      API | FILE | MANUAL
  description   String?
  lastUpdated   DateTime
  isDeletable   Boolean   false for built-in placeholder sources

Content tables (each with sourceId FK → Source):
  ContentSpell
  ContentClass
  ContentSubclass
  ContentRace
  ContentBackground
  ContentCondition
  ContentItem
  ContentMonster
```

JSON columns (arrays, objects) are stored as `String` in Azure SQL and serialized before insert. Each content table has a `slug` field for URL-safe identifiers that are unique within a source. A source refresh is a `DELETE WHERE sourceId = X` followed by a batch insert.

---

## Local Setup

**Prerequisites:** Node.js 20+, npm 10+, access to an Azure SQL database.

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
DATABASE_URL="sqlserver://<server>.database.windows.net:1433;database=<db>;user=<user>;password=<pass>;encrypt=true;trustServerCertificate=false;connectionTimeout=30"
APP_PASSWORD="your-shared-password"
CLIENT_ORIGIN="http://localhost:5173"
PORT=3000
```

Also create `prisma/.env` with just `DATABASE_URL` (Prisma CLI picks it up automatically):
```env
DATABASE_URL="sqlserver://..."
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

---

## Build Status

### Phase 0 — Scaffold (complete)
- npm workspaces (client + server)
- TypeScript strict mode, ESLint, Prettier
- Vitest configured with verbose reporter and test logging
- Express server with health check, CORS, global error handler, request logger
- Auth middleware with correct/wrong/missing password handling
- Azure SQL connection via Prisma 6 (SQL Server provider)
- React + Vite + Tailwind v4 + shadcn/ui client scaffold
- React Router with Layout + Outlet, placeholder screens, Login screen
- All Phase 0 tests passing

### Phase 1 — Database Schema & Source API (next)
- Define all 9 Prisma models (`Source` + 8 content tables)
- First migration
- Source CRUD endpoints with cascade delete

### Phases 2–8 (planned)
See `DevTools/Outline.md` for the full checklist.

| Phase | Scope |
|---|---|
| 2 | Open5e import (pagination, transforms, SSE progress) + JSON file import |
| 3 | Content read API (all 8 types, filters, pagination) |
| 4 | Content write API (create, edit, delete; homebrew copy flow) |
| 5 | Browse UI (content type selector, filter bar, paginated list, detail view) |
| 6 | Import UI (source list, import wizard, live progress bar) |
| 7 | Edit & create UI (per-type forms, homebrew prompt, validation) |
| 8 | Azure deployment + GitHub Actions CI/CD |

---

## Integration with DragonLedger Heroes

DragonLedger Heroes is a companion character sheet application. This DatabaseApp is designed from the start to serve as Heroes' content backend.

### The Relationship

**DatabaseApp** is the authoritative store for all game content. It knows nothing about characters.

**Heroes** is the authoritative store for all character data. It knows nothing about content storage.

When a Heroes user needs a spell, class, race, or any other content, it requests it from DatabaseApp's public read API.

### How It Works

All read endpoints in this app are public — no auth required. Heroes makes standard `GET` requests to the DatabaseApp API to fetch content. DatabaseApp's CORS config will be updated to allow Heroes' origin.

Example calls Heroes would make:
```
GET https://api.dragonledger.app/api/spells?level=3&class=Wizard
GET https://api.dragonledger.app/api/spells/open5e-srd-2024__fireball
GET https://api.dragonledger.app/api/monsters?cr=5
GET https://api.dragonledger.app/api/classes/open5e-srd-2024__paladin
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

### When Integration Happens

The API contract (endpoint paths, response shapes, slug format) is established in **Phase 3** of this build. Heroes integration can begin as soon as Phase 3 is deployed. There is no shared code between the two apps — the API is the interface. Heroes calls HTTP endpoints; it does not import from this repo.

A possible later step is extracting a shared TypeScript types package (`@dragonledger/content-types`) that both apps can import, eliminating the need to duplicate response-shape types in Heroes. That would be a separate workspace or published package — not part of this build.

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
