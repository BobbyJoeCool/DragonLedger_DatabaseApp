# Phase 5 — Browse UI: Design Notes

> Part of the `Documentation/v1.0.0/` phase-document set — see
> `v1.0.0-Roadmap.md` for the build-plan checklist and task log this design
> rationale supports. Consolidated from `phase-5-browse-ui-final-export.md`.
> Per-type results-table columns and the printable detail "card" were both
> deferred by this document to Phase 8 — see `Phase-8-Card-Theming.md`.
> Implementation log: `DevTools/Notes/v0.5.notes.md`.

---

# DragonLedger DatabaseApp — Phase 5 Browse UI: Final Design Export

Note: this brief's tech-stack assumptions (hosted API, Azure SQL) were superseded mid-session by an architecture pivot to a fully local, SQLite-backed, eventually Electron-packaged app. See `Phase-0-Scaffold-and-Packaging.md` for that decision in full. Nothing below changes as a result of that pivot — Browse is a client-side design and doesn't care where or how the API is hosted — but it's worth reading alongside this document for full context.

**Reconciliation note (added after later sessions):** this document was designed around exactly seven content types (Spells, Classes, Races, Backgrounds, Conditions, Items, Monsters). The Compendium sessions added an **eighth: Feat**, a genuine top-level browsable type (not a variant of an existing one) — it needs its own sidebar entry, its own `FeatFilterBar` (likely just the Source + search baseline, plus a `category` filter), and its own `<Type>Card` design. `ContentClassOption` (Metamagic/Invocations/Maneuvers) is **not** a new Browse tab — it's class-gated content, more naturally surfaced from a Class's own detail view than as a top-level browsable list (this was later confirmed as a deliberate decision, not just a lean — see the v1.0.0 Roadmap Part 4, Section 0.1). Every "seven"/"7" reference below should be read as needing a `+1` for Feat.

## 1. Decisions Made

### 1.1 Data Fetching Library

TanStack Query. Chosen over plain `fetch`+`useEffect` (which would mean hand-building loading/error states and losing all cache on every Browse↔Detail navigation) and over SWR (smaller ecosystem, weaker built-in mutation support — TanStack Query's mutation hooks will carry Phase 4's write-API calls naturally when Phase 7 needs them). Also brings in **TanStack Virtual** as a companion library for the virtualized results list (Section 1.5).

### 1.2 Filter/Pagination State: Local, Not URL

Local component state, not URL query params. The original reasoning for URL-based state (shareable/bookmarkable views) turned out not to apply: a mid-session architecture discussion established this app is single-user, runs entirely locally, and will eventually be superseded by a separate mobile app (Heroes) that handles its own cross-device sync independently — there's no scenario where sharing a specific filtered Browse URL with anyone else matters. The only remaining benefit of URL state (surviving an accidental page refresh) wasn't judged worth the extra complexity.

### 1.3 Filter Bar Architecture

Hand-built filter bar component per content type (seven total, e.g. `SpellFilterBar`, `MonsterFilterBar`), not one generic config-driven component. Slightly more repeated boilerplate for the shared Source + search baseline, but each bar stays simple and directly editable without needing to understand a shared config schema first.

### 1.4 Content-Type Switch Behavior

Each content type's filter/search state persists independently for the session, like browser tabs — switching from Monsters to Spells and back leaves Monster's filters exactly as they were. Implemented as one state object in `BrowseScreen`, keyed by content type, rather than a single flat filter state. This only persists for the current session; closing/refreshing the app resets all seven types' state, consistent with the local (not URL) state decision above.

### 1.5 Pagination Pattern: Virtualized Bidirectional Infinite Scroll

The most involved decision in this phase, arrived at incrementally:

- Base mechanism: `useInfiniteQuery` (TanStack Query) fetching 50 records at a time, triggered automatically via an `IntersectionObserver`-watched sentinel near the bottom of the list — no manual "Load more" click needed.
- Bidirectional: fetches both forward and backward from wherever the user currently is, not just forward from record 1 — necessary once jump-to-position (below) is in play, since jumping to the middle of a 5,000-row list means needing to fetch in both directions from that new starting point.
- Rendering: TanStack Virtual renders only the currently-visible slice of the full known range, so the DOM never holds thousands of off-screen rows at once — this is what makes an instant jump to an arbitrary position performant rather than requiring a "catch-up fetch" through every page in between.
- Position indicator: a slim bar along the edge of the results, showing `1` at the top and the total count at the bottom, with the current approximate position in between. Clicking or dragging on the bar computes a target record number via simple arithmetic (`(pointerPosition / barHeight) * totalCount`) with no network call — the actual data fetch for that offset only fires once, on drag release.
- **Name index**: a lightweight companion fetch (`{ id, name }` pairs only, no full record data — mirroring the `?fields=name,key` pattern Open5e's own API uses) runs once per filter-set change, loaded alongside the first page of full results. This powers live, real record names in the position-bar tooltip while dragging, without needing a full-record fetch on every pixel of drag movement. Even at Monster-scale (~5,000 rows), this index is small (id/name pairs only) and fast to load.
- Position bar resets to the top whenever the active filter set changes (a new search term, a source toggled, switching content type) — it does not try to preserve a scroll position across a filter change, since the underlying result set is different.

Acknowledged complexity: this is the single most involved piece of UI in Phase 5, more so than the filter bars or detail view combined. Virtualized, bidirectional, draggable-jump lists are inherently one of the trickier things to get right in React (scroll math, avoiding visual jank when new pages insert above the current viewport).

### 1.6 Source Filter: Custom Multi-Select

A custom-built multi-select (checkboxes, not shadcn's stock single-select dropdown), since shadcn/ui doesn't ship one out of the box and the outline specifically calls for filtering by multiple sources at once (e.g. viewing SRD-2024 and Homebrew content together in one combined list). **All sources are checked by default** — Browse shows everything unless the user deliberately narrows it down, rather than defaulting to an empty/single selection.

### 1.7 Results List Layout: Table

**Revised after this export.** Originally decided as a card grid, used unconditionally with no responsive fallback. That's been superseded: the results list is a **table**, not cards. "Card" now refers specifically to the full-content, printable per-type display shown in `DetailScreen` once a record is selected (Section 2's `<Type>DetailFields`) — not a summary tile in this list. Per-type column layout for the table is not decided here, same status as the per-type card design below: deferred to its own session (**resolved in Phase 8** — see `Phase-8-Card-Theming.md`, which also folds in the `card-design-spec.md` data reference).

## 2. Component Breakdown

```
BrowseScreen
├── ContentTypeSidebar          (7 types; switching preserves each type's own filter state)
├── <Type>FilterBar             (one per content type: Spell, Class, Race, Background,
│                                 Condition, Item, Monster — hand-built, not shared)
│   ├── SourceMultiSelect       (shared across all 7 bars; checkboxes, all-checked default)
│   ├── NameSearchInput         (shared across all 7 bars)
│   └── <type-specific extra fields, e.g. level/school for Spell, cr/type for Monster>
├── ResultsTable                 (shared virtualized table, TanStack Virtual —
│                                 revised from a card grid, see Decision 1.7)
│   ├── <Type>Row                (one per content type — column set DEFERRED to its own design session)
│   └── PositionBar             (shared; draggable, name-index-backed live labels,
│                                 resets to top on any filter change)

DetailScreen
├── Breadcrumb                  (Browse → [Type] → [Name])
├── SourceBadge                 (shared; links to source detail)
├── <Type>DetailFields          (per content type — the full-content, printable
│                                 "card" per Decision 1.7's revision; layout
│                                 approach not decided in this phase — its own
│                                 design session, data reference at
│                                 card-design-spec.md, now in Phase-8-Card-Theming.md)
├── EditButton                  (auth-gated; opens Phase 7's edit form)
└── DeleteButton                (auth-gated; confirmation dialog per Phase 4's
                                  { confirm: true } contract)
```

Shared/reusable across phases: `SourceMultiSelect`, `NameSearchInput`, `ResultsGrid`/`PositionBar`, `SourceBadge`, the `useContentList`/`useContentNameIndex`/`useContentDetail` hooks (Section 3) — Phase 6 (Import UI) and Phase 7 (Edit/Create UI) should reuse these rather than rebuilding equivalents.

## 3. Data-Fetching Hook Design

```typescript
// client/src/hooks/useContentList.ts
function useContentList(
  type: ContentType,
  filters: { sourceIds: string[]; query: string; extra: Record<string, unknown> }
): UseInfiniteQueryResult<ContentPage>
// Wraps GET /api/{type}?source=...&q=...&page=...&limit=50 via useInfiniteQuery.
// getNextPageParam / getPreviousPageParam both defined, supporting bidirectional fetch
// from an arbitrary starting page (needed for jump-to-position).
// Query key includes the full filter set, so switching content type or changing
// filters produces a fresh query rather than reusing stale pages.

// client/src/hooks/useContentNameIndex.ts
function useContentNameIndex(
  type: ContentType,
  filters: { sourceIds: string[]; query: string; extra: Record<string, unknown> }
): UseQueryResult<{ id: string; name: string }[]>
// Wraps GET /api/{type}?fields=name&source=...&q=... (or a dedicated lightweight
// endpoint, if the Read API doesn't already support field-selection). Refetches
// whenever the filter set changes; powers live names in the PositionBar during drag.

// client/src/hooks/useContentDetail.ts
function useContentDetail(type: ContentType, id: string): UseQueryResult<ContentEntry>
// Wraps GET /api/{type}/:id via useQuery. Standard cache behavior — revisiting a
// previously-viewed detail from Browse reuses the cached response rather than
// re-fetching immediately.
```

## 4. State Scheme

No URL involvement (per Decision 1.2). `BrowseScreen` holds one state object, keyed by content type, each type's slice independent:

```typescript
type BrowseState = Record<ContentType, {
  sourceIds: string[];       // defaults to ALL known source ids (all checked)
  query: string;             // defaults to ""
  extraFilters: Record<string, unknown>;  // type-specific, e.g. { level, school } for Spell
  scrollPosition: number;    // reset to 0 whenever sourceIds/query/extraFilters change
}>;
```

This object lives in memory only, for the current session — no persistence to localStorage/sessionStorage (per the project's artifact/browser-storage constraints, and because there's no cross-session persistence need established for this app).

## 5. Implementation Instructions for Claude Code (historical — already executed)

1. Install `@tanstack/react-query` and `@tanstack/react-virtual` (`npm install @tanstack/react-query @tanstack/react-virtual` in `client/`).
2. Set up a `QueryClientProvider` at the app root if not already present.
3. Confirm the Read API (Phase 3) supports a `?fields=name` (or equivalent) parameter for the lightweight name-index fetch; if it doesn't yet, this is a small Phase 3 addition needed before Section 3's `useContentNameIndex` hook can be implemented as designed.
4. Build the three hooks in Section 3 under `client/src/hooks/`.
5. Build `SourceMultiSelect` and `NameSearchInput` under `client/src/components/` — shared, used by all seven filter bars.
6. Build the seven `<Type>FilterBar` components under `client/src/components/filters/`, each composing the two shared inputs above plus its own type-specific extra fields per the table in the Phase 5 brief's Section 4.
7. Build `ResultsTable` and `PositionBar` — this is the most involved piece of the phase (Decision 1.5); budget real time for scroll-math/jank issues. Defer `<Type>Row` column internals (just render placeholder rows for now) until the deferred per-type column-design session happens.
8. Build `BrowseScreen`, wiring the sidebar, per-type `BrowseState`, filter bar, and results table together.
9. Build `DetailScreen` with `Breadcrumb`, `SourceBadge`, a placeholder `<Type>DetailFields`, and the auth-gated Edit/Delete buttons (Delete wired to Phase 4's `DELETE /api/:type/:id` with `{ confirm: true }`, behind a confirmation dialog).
10. Do not consider Phase 5 fully complete until: (a) the dedicated per-content-type table-row design session happens, and (b) the dedicated `<Type>DetailFields` ("card") design session happens and produces the full-content, printable layout per type. (**Both resolved in Phase 8.**)
11. Verify before moving to Phase 5's own test-writing step: switching between all 7 content types preserves each one's filter state independently within a session; the position bar drag shows live names from the index without triggering full-record fetches; dragging to an arbitrary position correctly renders that neighborhood of records without needing to fetch everything in between.
