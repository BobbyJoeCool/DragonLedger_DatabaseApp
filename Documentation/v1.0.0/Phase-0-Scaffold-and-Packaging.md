# Phase 0 — Project Scaffold & Desktop Packaging: Design Notes

> Part of the `Documentation/v1.0.0/` phase-document set — see
> `v1.0.0-Roadmap.md` for the build-plan checklist and task log this design
> rationale supports. Consolidated from `architecture-addendum-local-sqlite.md`.

---

# DragonLedger DatabaseApp — Architecture Addendum: Local SQLite, No Hosting

This document captures a cross-cutting architecture decision made during the Phase 5 design session, superseding the tech-stack line in every prior brief (Phase 1.1 through Phase 5) that specifies **Azure SQL Database** and a hosted API. It does not change any schema, mapping, or endpoint design already completed — only where and how the app runs.

## 1. Why This Changed

Every design brief through Phase 5 assumed a conventional hosted web app: Node/Express API, Prisma on Azure SQL Database, reachable from anywhere. That assumption was reconsidered once two facts were established mid-session:

- This app is genuinely single-user (described as "99% just for me") — there's no scenario requiring multiple people or devices to reach a shared live database simultaneously.
- A separate, planned mobile app ("Heroes") will eventually **replace** DragonLedger DatabaseApp entirely, and will handle its own cross-device sync independently (an iCloud-equivalent on iOS, an Android equivalent), plus a JSON export/import as the interchange format between the two apps. DragonLedger's actual job, long-term, is producing and curating content, then exporting it — not running as an always-available service.

Given that, a hosted database was solving a problem ("reachable from anywhere, multiple consumers") that doesn't actually exist here. Running entirely locally removes hosting cost entirely, with no loss of real capability.

## 2. What Changes

**Datasource provider only.** Every model, field, enum, and JSON-as-`String` design decision from Phases 1.1, 2, and 4 carries over completely unchanged. The only edit is the `datasource` block:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"  // becomes an OS userData path in the packaged app — see Section 4
}
```

**Confirmed technical fact (verified, not assumed):** as of Prisma 6.2, SQLite fully supports both enums and JSON-shaped fields — a limitation that existed in earlier Prisma versions and could have forced schema rework, but does not apply to the current version. Enums are enforced at the Prisma ORM layer rather than the database layer for SQLite specifically (SQLite itself has no native enum type), meaning invalid values are caught by Prisma Client at runtime rather than by a database-level `CHECK` constraint — a minor difference from the SQL Server behavior originally assumed, essentially irrelevant for a single-user local app where all writes go through the app itself.

**Tech stack line, updated:**

| Layer | Was | Now |
|---|---|---|
| Database | Azure SQL Database | SQLite (local file), via Prisma's `sqlite` provider |
| Hosting | Implied Azure App Service or similar | None — runs entirely on the user's own machine |

**Downgraded, not removed:** the password-gated write-auth middleware built in Phase 0 protects against a different threat model than originally assumed (a hosted service reachable by anyone with the URL, vs. an app only reachable by whoever is sitting at the machine it's running on). It's not necessarily wrong to keep, but its priority/necessity should be reconsidered rather than assumed unchanged. (**Resolved, see the v1.0.0 Roadmap's Phase 0.5** — retired/no-op'd for the local build, revisit for Heroes integration.)

## 3. How the App Runs

Two processes during active development — the Vite dev server (frontend) and the Express API (backend) — typically run either as two terminal tabs, or unified under one root `npm run dev` script via a tool like `concurrently`. Vite's dev server proxies `/api/...` requests through to Express, so the browser only ever talks to one address.

For day-to-day *use* (once built, not being actively developed), a simpler single-process mode is preferable: `npm run build` compiles the React app to static files, and Express serves those files directly (`express.static()`) alongside its own API routes, all on one port. This is the mode worth targeting for the eventual packaged app (Section 4) — one process, one thing to launch.

## 4. Desktop Packaging (Electron)

**Decision: Electron**, chosen over Tauri (lighter install size, but its backend is Rust — DragonLedger's existing Express/Prisma server would need to run as a separate managed "sidecar" process rather than living directly inside the app, more integration work) and over Node SEA/pkg (bundles only the server into one binary, not a full desktop app with its own window — would still mean opening a browser tab manually). Electron's tradeoff is a larger install size (packaging bundles a full Chromium runtime, typically 100–200MB), judged acceptable for a personal tool where install size doesn't meaningfully matter.

Electron provides a real Node.js environment as its backend, so the existing Express server runs directly inside Electron's own process — no rewrite, no separate server binary — with Electron opening a window pointed at it instead of the user opening a browser tab manually. `electron-builder` packages the compiled frontend, the Express server, and a bundled Node runtime into a double-clickable `.app`, producing a signed/notarized `.dmg` for macOS distribution.

**Status at time of writing: not yet decided whether to build this now or defer until Phases 5–7 are functionally complete.** (**Resolved:** built up front, right after Phase 0's scaffold — see Phase 0.7 in the v1.0.0 Roadmap.)

## 5. Data Persistence Across App Updates

**The core rule: the SQLite database file must live outside the Electron app bundle, in the OS-managed user-data directory** (`app.getPath('userData')` — on macOS, `~/Library/Application Support/DragonLedger/`), never inside the bundle's own Resources folder. Electron/`electron-builder` updates replace the app bundle wholesale on every version install; anything stored inside that bundle would be wiped or replaced along with it. Anything stored in `userData` is untouched by an update, since it's a separate location entirely.

## 6. Schema Migrations Against an Existing Local Database

Prisma's migration files (small SQL scripts generated by `prisma migrate dev` during development, one per schema change) are bundled with the app itself — they're just text, negligible size. The database also gains one Prisma-managed tracking table, `_prisma_migrations`, recording which migration files have already been applied to that specific database file.

On every app launch, running `prisma migrate deploy` (the non-interactive, production-safe command — distinct from `migrate dev`) against the `userData` database path checks that tracking table and applies only whatever migrations aren't yet marked as applied. A brand-new install runs everything from scratch; an install several versions behind only runs what it's missing. Both converge to the same final schema without any manual intervention.

**SQLite-specific wrinkle worth knowing:** SQLite's `ALTER TABLE` support is limited — it can add a column directly, but can't drop a column, change a column's type, or perform most other structural changes in place. For anything beyond a simple column addition (such as Phase 2's `ContentClass.primaryAbility` restructuring), Prisma's migration engine automatically falls back to a standard, well-tested workaround: create a new table with the target shape, copy all existing rows into it, drop the old table, rename the new one into place. This happens automatically — the migration author never writes this by hand — but it does mean even a "simple-looking" schema change triggers a full table rebuild under the hood on SQLite specifically. At this app's data scale, that rebuild is effectively instantaneous regardless.

**Recommended habit, specifically because data now lives outside the app bundle:** back up the `userData` SQLite file (a plain file copy) before installing any version that includes new migrations. Prisma's migration tooling is well-tested, but a crash mid-migration (power loss, force-quit) remains a real, if rare, risk with any database — cheap insurance given how easy backing up a single file is.

## 7. Open Items (as of this document's original writing — see Roadmap for current status)

- Packaging timeline (build Electron wrapper now vs. after Phases 5–7 ship) — **resolved: built up front.**
- Whether to formally retire the Phase 0 write-auth middleware, keep it as-is, or repurpose it for something else now that the threat model has changed — **resolved: retired/no-op'd, revisit for Heroes.**
- Every existing brief (Phase 1.1, 2, 4, 5, and the not-yet-run Phase 7) should be considered to have its tech-stack line superseded by Section 2 above; none currently reference this document since it postdates them.
- **Phase 6's design brief independently re-derived this same contradiction** (its own Phase 1.1 doc still says "hosted web app on Azure SQL") before this addendum was found — confirms the addendum's supersession list above, no new decision needed. Added here as the pointer a future session should find first.
