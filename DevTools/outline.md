# DragonLedger Database App — Build Outline

> **Purpose:** A hosted web app for storing, searching, and managing D&D 5e content
> (spells, classes, races, backgrounds, conditions, items, monsters) from multiple
> named sources. Content can be bulk-imported from the Open5e API or a JSON file,
> manually entered, or edited and saved as homebrew. Sources can be refreshed
> (old data deleted, new data re-imported) without affecting other sources.
>
> **Philosophy:** One vertical slice at a time — schema → API → UI — with working
> tests before moving on. This app is intentionally simpler than DragonLedger Heroes;
> it is a content management tool, not a character sheet.

---

## TECH STACK

| Layer       | Technology                         | Purpose                              |
| ----------- | ---------------------------------- | ------------------------------------ |
| Frontend    | React 19 + Vite + TypeScript       | SPA UI                               |
| UI          | Tailwind CSS + shadcn/ui           | Styling and components               |
| API server  | Node.js + Express + TypeScript     | REST API, auth gate, import logic    |
| ORM         | Prisma                             | Type-safe DB access + migrations     |
| Database    | Azure SQL Database                 | Persistent content storage           |
| Auth        | Simple shared password (env var)   | Single password gate; no user accounts |
| Testing     | Vitest                             | Unit + integration tests             |
| Hosting     | Azure App Service (API) + Azure Static Web Apps (client) | Free tiers |
| CI/CD       | GitHub Actions                     | Build + deploy on push to main       |

---

## REPO STRUCTURE

```
/
  /client               ← Vite + React frontend
    /src
      /api              ← Typed fetch wrappers
      /components       ← Reusable UI primitives (shadcn extended)
      /screens          ← Full page views (Browse, Detail, Import, Sources)
      /hooks            ← Custom React hooks
  /server               ← Node.js + Express API
    /src
      /routes           ← Express routers (content, sources, import, auth)
      /middleware       ← Password auth guard, error handler
      /db               ← Prisma client + query helpers
      /importers        ← Open5e fetch logic + JSON file parser
  /prisma
    schema.prisma       ← Single source of truth for DB schema
    /migrations         ← Prisma-generated migration files
```

---

## DATA MODEL OVERVIEW

Every content entry belongs to a **Source**. A source has a name, a type, and
can be refreshed — deleting all its entries and re-importing fresh data — without
touching entries from any other source.

```
Source
  id          String  (e.g. "open5e-srd-2024", "my-homebrew")
  name        String  (display name)
  type        Enum    API | FILE | MANUAL
  description String?
  lastUpdated DateTime
  isDeletable Boolean (false for built-in placeholder sources)

ContentType  Enum: SPELL | CLASS | SUBCLASS | RACE | BACKGROUND
                   | CONDITION | ITEM | MONSTER
```

Each content table has `sourceId` (FK → Source) so a source refresh is a
`DELETE WHERE sourceId = X` followed by a re-import.

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
- [x] React Router v7 — placeholder routes:
  - `/` → redirect to `/browse`
  - `/browse` — search/filter content
  - `/browse/:type/:id` — detail view
  - `/sources` — source management
  - `/sources/import` — import wizard
- [x] Base layout: sidebar nav + main content area

### 0.4 Database Setup

- [x] Prisma installed, `DATABASE_URL` pointing to Azure SQL
- [x] `prisma/schema.prisma` with `provider = "sqlserver"`
- [x] `prisma db push` verifies connection ← needs live Azure SQL
- [x] `server/src/db/client.ts` exports the shared Prisma client

### 0.5 Auth Middleware

- [x] `server/src/middleware/auth.ts`
- [x] Reads `x-app-password` header (or `Authorization: Bearer <password>`)
- [x] Compares to `APP_PASSWORD` env var
- [x] Returns 401 if missing or wrong
- [x] All non-read routes (POST, PATCH, PUT, DELETE) are protected
- [x] GET (browse/read) routes are **public** — no password required to view content
- [x] Client: password stored in `sessionStorage`; injected into every mutating request
- [x] Login screen: single password input, redirects to `/browse` on success

### 0.6 Phase 0 Tests

- [x] Health check returns 200
- [x] Auth middleware: correct password → 200, wrong → 401, missing → 401
- [x] Prisma client connects without error

---

## PHASE 1 — Database Schema & Source Management

### 1.1 Prisma Schema

Define all models. Key rules:
- Every content table has `sourceId String` → FK to `Source`
- JSON columns stored as `String` in SQL Server (pre-stringify before insert)
- `slug` field on each content table: unique within source, URL-safe identifier

```
Models:
  Source
  ContentSpell
  ContentClass
  ContentSubclass
  ContentRace
  ContentBackground
  ContentCondition
  ContentItem
  ContentMonster
```

See **Appendix A** for full field lists per content type.

- [ ] All models defined in `schema.prisma`
- [ ] `prisma migrate dev --name init` creates the first migration
- [ ] Foreign keys verified (Source → each content table)

### 1.2 Source API Endpoints

- [ ] `GET /api/sources` — list all sources (id, name, type, entryCount, lastUpdated)
- [ ] `POST /api/sources` — create a new manual source `{ name, description }` *(auth)*
- [ ] `GET /api/sources/:id` — single source detail
- [ ] `DELETE /api/sources/:id` — delete source and ALL its entries *(auth)*
  - Returns 400 if source has `isDeletable: false`

### 1.3 Phase 1 Tests

- [ ] Source CRUD operations work correctly
- [ ] Deleting a source cascades to delete all its content entries
- [ ] Cannot delete a protected source

---

## PHASE 2 — Open5e Import

> Goal: User can connect to the Open5e API and import all content into the DB
> under a named source. Re-importing deletes old data for that source only.

### 2.1 Import Service (`/server/src/importers/open5e.ts`)

- [ ] `fetchAllPages(endpoint)` — handles Open5e pagination (`next` cursor)
- [ ] One transform function per content type (Open5e field names → Prisma model fields)
  - Reference: `DragonLedger_Heroes/DevNotes/API_ImportMaps/` for field mappings
- [ ] `importSource(sourceId, contentTypes[])` — orchestrates the full import:
  1. Upsert `Source` row
  2. `DELETE` all existing rows for that sourceId across selected content tables
  3. Fetch + transform + batch-insert each content type
  4. Update `Source.lastUpdated`
- [ ] Import is **idempotent** — running again replaces old data cleanly
- [ ] Progress reported via SSE stream (`/api/import/progress/:jobId`) so the UI can show a progress bar

### 2.2 JSON File Import (`/server/src/importers/jsonFile.ts`)

- [ ] Accepts a JSON structure matching our content schema (or a subset)
- [ ] Same pipeline: delete old entries for sourceId, insert new
- [ ] Validation: required fields present, types correct; returns error list for invalid entries
- [ ] Supported format documented in **Appendix B**

### 2.3 Import API Endpoints

- [ ] `POST /api/import/open5e` *(auth)*
  - Body: `{ sourceId, sourceName, contentTypes: ContentType[] }`
  - Starts import job, returns `{ jobId }`
- [ ] `GET /api/import/progress/:jobId` — SSE stream: `{ type, total, done, errors }`
- [ ] `POST /api/import/file` *(auth)*
  - Multipart form: `source` metadata + `file` JSON upload
  - Returns `{ inserted, skipped, errors }`
- [ ] `GET /api/import/history` — list of past import jobs (sourceId, timestamp, counts)

### 2.4 Phase 2 Tests

- [ ] `fetchAllPages` correctly follows pagination
- [ ] Each transform function maps required fields correctly
- [ ] Import with an existing sourceId replaces data, not duplicates
- [ ] Invalid JSON file returns structured error list, does not partially import

---

## PHASE 3 — Content Read API

> All read endpoints are public (no auth). These power the browse and detail screens.

### 3.1 Shared Query Patterns

Every content type supports:
- `?source=` — filter by sourceId
- `?q=` — name search (case-insensitive, partial match)
- `?page=` / `?limit=` — pagination (default limit: 50)
- Response envelope: `{ data: [], total, page, limit }`

### 3.2 Endpoints Per Content Type

**Spells**
- [ ] `GET /api/spells` — filters: `level`, `school`, `class`, `source`, `q`
- [ ] `GET /api/spells/:id`

**Classes & Subclasses**
- [ ] `GET /api/classes` — filters: `source`, `q`
- [ ] `GET /api/classes/:id`
- [ ] `GET /api/subclasses?classId=` — subclasses for a class

**Races**
- [ ] `GET /api/races` — filters: `source`, `q`
- [ ] `GET /api/races/:id`

**Backgrounds**
- [ ] `GET /api/backgrounds` — filters: `source`, `q`
- [ ] `GET /api/backgrounds/:id`

**Conditions**
- [ ] `GET /api/conditions` — filters: `source`, `q`
- [ ] `GET /api/conditions/:id`

**Items**
- [ ] `GET /api/items` — filters: `type`, `rarity`, `source`, `q`
- [ ] `GET /api/items/:id`

**Monsters**
- [ ] `GET /api/monsters` — filters: `cr`, `type`, `source`, `q`
- [ ] `GET /api/monsters/:id`

### 3.3 Phase 3 Tests

- [ ] Each endpoint returns correctly shaped response
- [ ] Filters combine correctly (level + class on spells)
- [ ] Pagination: `total` matches actual count, pages are consistent
- [ ] Unknown id returns 404

---

## PHASE 4 — Content Write API (Create, Update, Delete)

> These endpoints are protected by the auth middleware.

### 4.1 Create — Manual Entry

For each content type:
- [ ] `POST /api/:type` *(auth)*
  - Body: content fields + `sourceId` (must be a MANUAL type source)
  - Returns created entry

### 4.2 Update — Edit Entry

- [ ] `PATCH /api/:type/:id` *(auth)*
  - Body: any subset of fields to update
  - **If `sourceId` of the entry is not a MANUAL source**, the endpoint requires
    an additional `{ saveAs: 'original' | 'homebrew' }` field
    - `'original'` — updates the entry in place (overwrites official data)
    - `'homebrew'` — creates a new entry under the user's designated homebrew
      source with the edited fields; original entry untouched
  - Returns the updated (or newly created) entry

### 4.3 Delete — Single Entry

- [ ] `DELETE /api/:type/:id` *(auth)*
  - Deletes a single entry regardless of source

### 4.4 Phase 4 Tests

- [ ] Creating an entry under a MANUAL source succeeds
- [ ] Creating an entry under an API source is rejected with 400
- [ ] Editing official entry with `saveAs: homebrew` creates a new entry; original unchanged
- [ ] Editing official entry with `saveAs: original` modifies it in place
- [ ] Delete removes only the targeted entry

---

## PHASE 5 — Browse UI (Read)

### 5.1 Content Browser (`/browse`)

- [ ] Sidebar: content type selector (Spells, Classes, Races, Backgrounds, Conditions, Items, Monsters)
- [ ] Filter bar (adapts per content type):
  - All types: source selector (multi-select), name search input
  - Spells: level (0–9), school, class
  - Items: item type, rarity
  - Monsters: CR range, creature type
- [ ] Results list: paginated, 50 per page, "Load more" or page controls
- [ ] Each row shows: name, source badge, key metadata (e.g. spell level + school)

### 5.2 Detail View (`/browse/:type/:id`)

- [ ] Displays all fields for the entry, formatted for readability
- [ ] Source badge with link to source detail
- [ ] "Edit" button (opens edit form, password prompt if not authenticated)
- [ ] "Delete" button with confirmation dialog *(auth)*
- [ ] Breadcrumb: Browse → [Type] → [Name]

### 5.3 Phase 5 Tests

- [ ] Browser renders without errors for each content type
- [ ] Filter by level + class narrows spell results correctly
- [ ] Detail view 404 page shown for unknown id
- [ ] Pagination controls function correctly

---

## PHASE 6 — Import UI

### 6.1 Source List (`/sources`)

- [ ] Table of all sources: name, type badge, entry count, last updated, actions
- [ ] Actions per source: "Re-import" (API/FILE sources), "Delete source" (with confirmation)
- [ ] "Add Source" button → opens create source dialog (name + description)
- [ ] Delete confirmation states how many entries will be deleted

### 6.2 Import Wizard (`/sources/import`)

**Step 1 — Choose import type**
- [ ] Two options: "From Open5e API" or "From JSON file"

**Step 2a — Open5e API import**
- [ ] Source name input (pre-filled "Open5e SRD 2024" if sourceId `open5e-srd-2024` doesn't exist)
- [ ] Checkboxes for content types to import (all checked by default)
- [ ] "Start Import" button → begins SSE-streamed progress

**Step 2b — JSON file import**
- [ ] Source name input
- [ ] File picker (accepts `.json`)
- [ ] "Upload & Import" button

**Step 3 — Progress view**
- [ ] Progress bar per content type
- [ ] Live count: "342 / 1200 spells"
- [ ] Error list if any entries failed to parse
- [ ] "Done" button when complete → navigates to `/sources`

### 6.3 Phase 6 Tests

- [ ] Import wizard flow completes without errors against Open5e
- [ ] SSE progress events arrive and the progress bar advances
- [ ] After import, source appears in source list with correct entry counts
- [ ] Re-import replaces data; counts are accurate after

---

## PHASE 7 — Edit & Create UI (Write)

### 7.1 Edit Form

- [ ] Accessible from the detail view "Edit" button
- [ ] Form fields adapt to content type (e.g. spell has level, school, components; monster has CR, HP, actions)
- [ ] If entry belongs to a non-MANUAL source:
  - Shows a "Save as" prompt before submitting:
    - "Update original" — patches the official entry
    - "Save as homebrew copy" — creates a new entry under the homebrew source
- [ ] Validation: required fields highlighted, cannot submit with empty name
- [ ] On success: navigates back to detail view (of the updated or newly created entry)

### 7.2 Create Form

- [ ] Accessible from a "New Entry" button on the browse screen (when authenticated)
- [ ] Source selector: only MANUAL sources listed
- [ ] Same per-type field layout as the edit form
- [ ] On success: navigates to the new entry's detail view

### 7.3 Homebrew Source Auto-Creation

- [ ] If no MANUAL source exists when the user tries to create or save as homebrew,
  prompt: "Create a homebrew source first?" → opens create source dialog inline

### 7.4 Phase 7 Tests

- [ ] Create form submits and new entry appears in browse list
- [ ] Edit with "save as homebrew" creates the new entry; original is unchanged in the DB
- [ ] Edit with "update original" modifies the existing row
- [ ] Validation blocks submission with empty name

---

## PHASE 8 — Azure Deployment

### 8.1 Azure SQL Database

- [ ] Provision Azure SQL Database (free 32 GB tier or Basic)
- [ ] Firewall rule for App Service outbound IP
- [ ] Connection string stored in App Service environment variables
- [ ] `prisma migrate deploy` run against production DB

### 8.2 API: Azure App Service

- [ ] Provision App Service (free F1 tier, Node.js runtime)
- [ ] Environment variables: `DATABASE_URL`, `APP_PASSWORD`, `CLIENT_ORIGIN`, `PORT`
- [ ] Startup command: `node dist/index.js`
- [ ] `npm run build` compiles TypeScript to `dist/`
- [ ] GitHub Actions: on push to `main` → build + deploy server

### 8.3 Client: Azure Static Web Apps

- [ ] Provision Azure Static Web App (free tier)
- [ ] `VITE_API_URL` set to App Service URL
- [ ] GitHub Actions: on push to `main` → `npm run build`, deploy `dist/`
- [ ] SPA routing: all 404s → `index.html`

### 8.4 Deployment Checklist

- [ ] HTTPS enforced on both client and API
- [ ] CORS allows only Static Web App origin in production
- [ ] `APP_PASSWORD` is a strong value, not a placeholder
- [ ] Smoke test: import Open5e content, browse spells, edit one entry, delete it

---

## Appendix A — Content Type Field Reference

### Spell
| Field          | Type          | Notes                                      |
| -------------- | ------------- | ------------------------------------------ |
| id             | String (PK)   | sourceId + slug                            |
| slug           | String        | URL-safe, unique within source             |
| sourceId       | String (FK)   |                                            |
| name           | String        |                                            |
| level          | Int           | 0 = cantrip                                |
| school         | String        | Abjuration, Evocation, etc.                |
| castingTime    | String        |                                            |
| range          | String        |                                            |
| components     | String        | V, S, M (material)                         |
| material       | String?       | Material component description             |
| duration       | String        |                                            |
| concentration  | Boolean       |                                            |
| ritual         | Boolean       |                                            |
| classes        | String        | JSON array: ["Wizard","Sorcerer"]           |
| description    | String        |                                            |
| higherLevels   | String?       | "At Higher Levels" text                    |

### Class
| Field             | Type        | Notes                              |
| ----------------- | ----------- | ---------------------------------- |
| id                | String (PK) |                                    |
| slug              | String      |                                    |
| sourceId          | String (FK) |                                    |
| name              | String      |                                    |
| hitDie            | Int         | 6, 8, 10, or 12                    |
| primaryAbility    | String      |                                    |
| savingThrows      | String      | JSON array: ["STR","CON"]          |
| armorProfs        | String      | JSON array                         |
| weaponProfs       | String      | JSON array                         |
| skillChoices      | String      | JSON: { count, from[] }            |
| spellcastingAbility | String?   | null if non-caster                 |
| description       | String      |                                    |
| extraData         | String?     | JSON escape hatch for non-standard fields |

### Subclass
| Field       | Type        | Notes              |
| ----------- | ----------- | ------------------ |
| id          | String (PK) |                    |
| slug        | String      |                    |
| sourceId    | String (FK) |                    |
| classId     | String (FK) | → ContentClass     |
| name        | String      |                    |
| description | String      |                    |
| extraData   | String?     |                    |

### Race
| Field       | Type        | Notes                     |
| ----------- | ----------- | ------------------------- |
| id          | String (PK) |                           |
| slug        | String      |                           |
| sourceId    | String (FK) |                           |
| name        | String      |                           |
| size        | String      | Tiny/Small/Medium/Large   |
| speed       | String      | JSON: { walk, fly?, swim? } |
| traits      | String      | JSON array of trait objects |
| description | String      |                           |
| extraData   | String?     |                           |

### Background
| Field             | Type        | Notes                 |
| ----------------- | ----------- | --------------------- |
| id                | String (PK) |                       |
| slug              | String      |                       |
| sourceId          | String (FK) |                       |
| name              | String      |                       |
| skillProficiencies| String      | JSON array            |
| toolProficiencies | String      | JSON array            |
| abilityBonuses    | String      | JSON: { STR: 1, ... } |
| feature           | String      | JSON: { name, description } |
| description       | String      |                       |
| extraData         | String?     |                       |

### Condition
| Field       | Type        | Notes |
| ----------- | ----------- | ----- |
| id          | String (PK) |       |
| slug        | String      |       |
| sourceId    | String (FK) |       |
| name        | String      |       |
| description | String      |       |
| effects     | String?     | JSON array of effect strings |

### Item
| Field       | Type        | Notes                              |
| ----------- | ----------- | ---------------------------------- |
| id          | String (PK) |                                    |
| slug        | String      |                                    |
| sourceId    | String (FK) |                                    |
| name        | String      |                                    |
| itemType    | String      | weapon, armor, gear, magic, etc.   |
| rarity      | String?     | common, uncommon, rare, etc.       |
| requiresAttunement | Boolean |                               |
| cost        | String?     | e.g. "50 gp"                       |
| weight      | String?     |                                    |
| damage      | String?     | e.g. "1d8 slashing"                |
| armorClass  | String?     |                                    |
| properties  | String?     | JSON array: ["finesse","light"]    |
| description | String      |                                    |
| extraData   | String?     |                                    |

### Monster
| Field          | Type        | Notes                          |
| -------------- | ----------- | ------------------------------ |
| id             | String (PK) |                                |
| slug           | String      |                                |
| sourceId       | String (FK) |                                |
| name           | String      |                                |
| size           | String      |                                |
| monsterType    | String      | beast, undead, humanoid, etc.  |
| alignment      | String      |                                |
| armorClass     | Int         |                                |
| hitPoints      | Int         |                                |
| hitDice        | String      | e.g. "5d10+10"                 |
| speed          | String      | JSON: { walk, fly?, swim? }    |
| abilityScores  | String      | JSON: { STR, DEX, CON, INT, WIS, CHA } |
| savingThrows   | String?     | JSON object                    |
| skills         | String?     | JSON object                    |
| damageResistances | String?  | JSON array                     |
| damageImmunities | String?   | JSON array                     |
| conditionImmunities | String? | JSON array                   |
| senses         | String?     |                                |
| languages      | String?     |                                |
| challengeRating | String     | "1/4", "1", "10", etc.         |
| actions        | String      | JSON array of action objects   |
| legendaryActions | String?   | JSON array                     |
| description    | String?     |                                |
| extraData      | String?     |                                |

---

## Appendix B — JSON Import File Format

The JSON file upload accepts either:

**Single content type:**
```json
{
  "contentType": "spell",
  "entries": [ { ...spell fields... }, ... ]
}
```

**Multiple content types:**
```json
{
  "spells": [ { ...spell fields... } ],
  "items": [ { ...item fields... } ],
  "monsters": [ { ...monster fields... } ]
}
```

- `id` and `slug` are optional — if omitted, the server generates them from the name
- `sourceId` in the file body is ignored; the source is always determined by the import request
- Unknown fields are stored in `extraData` as a JSON string rather than rejected
